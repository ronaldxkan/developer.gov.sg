const path = require("path");
const express = require("express");
const beautifyHtml = require("js-beautify").html;
const yaml = require("js-yaml");
const Octokit = require("@octokit/rest");
const axios = require("axios");
const { oauthLoginUrl } = require("@octokit/oauth-login-url");
const uuidv4 = require("uuid/v4");
const owners = require("../lib/owners");
const utils = require("../lib/utils");
const github = require("../lib/github");
const Cryptography = require("../lib/cryptography");
const packageInfo = require("../../package.json");
const {
    githubBaseRef,
    githubRepoOwner,
    githubRepoName,
    clientID,
    clientSecret,
    tokenHash,
    netlifyUrl
} = require("./config");
const lib = require("../lib");

let cryptography = new Cryptography(tokenHash);

const octokit = github.octokit;

const router = express.Router();

router.get("/", (req, res) =>
    res.json({
        version: packageInfo.version
    })
);

router.get("/oauth", (req, res) => {
    res.redirect(
        oauthLoginUrl({
            clientId: clientID,
            scopes: ["public_repo"]
        }).url
    );
});

router.get("/oauth/github/callback", (req, res) => {
    const requestToken = req.query.code;
    axios({
        method: "post",
        url: `https://github.com/login/oauth/access_token?client_id=${clientID}&client_secret=${clientSecret}&code=${requestToken}`,
        headers: {
            accept: "application/json"
        }
    })
        .then(response => {
            const accessToken = cryptography.encrypt(
                response.data.access_token
            );
            if (req.hostname === "localhost") {
                res.cookie("_devpo", accessToken, { httpOnly: false });
                res.redirect(`http://localhost:8888/review/`);
            } else {
                res.cookie("_devpo", accessToken, { secure: true });
                res.redirect(`${netlifyUrl}/review/`);
            }
        })
        .catch(err => {
            if (req.hostname === "localhost") {
                res.redirect(`http://localhost:8888/review/`);
            } else {
                res.redirect(`${netlifyUrl}/review/`);
            }
        });
});

router.get("/review", async (req, res) => {
    try {
        const octokit = new Octokit({
            auth: cryptography.decrypt(req.cookies._devpo)
        });

        const user = await octokit.users.getAuthenticated();
        const username = user.data.login;

        // Ensure logged in user is one of our product owners
        if (owners.fetchProductOwners().indexOf(username) === -1) {
            res.status(500).json({
                error: "Please make sure you are authorised to review changes."
            });
        }

        const pulls = await octokit.pulls.list({
            owner: githubRepoOwner,
            repo: githubRepoName
        });
        const pullRequests = utils.getUsersPullRequests(username, pulls.data);
        res.json(pullRequests);
    } catch (err) {
        res.status(500).json(err);
    }
});

router.get("/review-diff", async (req, res) => {
    try {
        axios.get(req.query.diff_url).then(response => {
            res.json(response.data);
        });
    } catch (err) {
        res.status(500).json(err);
    }
});

router.get("/review-merge", async (req, res) => {
    try {
        const octokit = new Octokit({
            auth: cryptography.decrypt(req.cookies._devpo)
        });

        const result = await octokit.pulls.merge({
            owner: githubRepoOwner,
            repo: githubRepoName,
            pull_number: req.query.number
        });
        res.json(result);
    } catch (err) {
        res.status(500).json(err);
    }
});

router.get("/review-reject", async (req, res) => {
    try {
        const octokit = new Octokit({
            auth: cryptography.decrypt(req.cookies._devpo)
        });

        const result = await octokit.pulls.update({
            owner: githubRepoOwner,
            repo: githubRepoName,
            pull_number: req.query.number,
            state: "closed"
        });
        res.json(result);
    } catch (err) {
        res.status(500).json(err);
    }
});

router.post("/request-otp", async (req, res) => {
    const requestBody = req.body;
    if (!requestBody.email) {
        res.status(400).json({
            error: "The email parameter is missing."
        });
        return;
    }
    try {
        let otpResponse = await lib.otp.requestOtp(requestBody.email);
        res.json(otpResponse.data);
    } catch (err) {
        let statusCode = 500;
        if (err.response) {
            statusCode = err.response.status;
        }
        res.status(statusCode).json({
            error: err.message || "Error requesting for email verification OTP."
        });
    }
});

router.post("/submit-article-changes", async (req, res) => {
    let submission = req.body;

    let missingParams = lib.utils.getMissingParams(
        [
            "email",
            "otp",
            "otpRequestId",
            "page_title",
            "page_layout",
            "page_category",
            "page_path",
            "page_content",
        ],
        submission
    );
    if (missingParams.length > 0) {
        res.status(400).json({
            error: `The following parameters are missing: ${missingParams.join(
                ", "
            )}`
        });
        return;
    }

    let email = submission.email;
    let otp = submission.otp;
    let otpRequestId = submission.otpRequestId;
    
    try {
        await lib.otp.verifyOtp(email, otp, otpRequestId);
    } catch (err) {
        res.status(403).json({
            error: `OTP validation failed. ${err.message}`
        });
        return;
    }

    let pageTitle = submission.page_title;
    let pageLayout = submission.page_layout;
    let pageCategory = submission.page_category;
    let pageDescription = submission.page_description;
    let pagePath = submission.page_path;
    let pageContent = submission.page_content;
    let pullRequestLabels = [
        pageCategory.toLowerCase(),
        utils.toLowerCaseSlug(pageTitle)
    ];
    try {
        const conflictingPr = await lib.github.checkForConflictingPr(
            pullRequestLabels
        );
        if (conflictingPr) {
            res.status(400).json({
                error: `Can't make submission; pending changes at ${
                    conflictingPr.html_url
                }`
            });
            return;
        }
    } catch (err) {
        let statusCode = err.status || 500;
        res.status(statusCode).json({
            error: `Couldn't check for conflicting pull requests.`
        });
        return;
    }

    let newPage =
        `---\n` +
        `title: ${pageTitle}\n` +
        `layout: ${pageLayout}\n` +
        `category: ${pageCategory}\n` + 
        `${pageDescription ? `description: ${pageDescription}\n` : ""}` +
        `---\n`;

    const formattedContent = beautifyHtml(pageContent, {
        wrap_line_length: 120
    });
    newPage += formattedContent;

    try {
        const newBranchId = await lib.utils.generateId();
        let filePath = pagePath.startsWith("/") ? `_${pagePath.substring(1)}` : `_${pagePath}`;
        const pr = await lib.github.createNewBranchAndPullRequest({
            filePath: path.join("collections", filePath),
            fileContent: newPage,
            baseBranchName: githubBaseRef,
            newBranchName: `${pageCategory.toLowerCase()}-edit-${new Date()
                .toISOString()
                .substring(0, 10)}-${newBranchId}`,
            commitMessage: `New edits for ${pageTitle} page by ${email}`,
            prTitle: `New edits for ${pageTitle} page by ${email}`,
            prBody: newPage
        });

        let issueAssignees = [];
        if (owners.fetchProductDetails().hasOwnProperty(pageTitle)) {
            issueAssignees = owners.fetchProductDetails()[pageTitle];
        } else {
            let admins = await lib.github.getRepoAdmins();
            issueAssignees = admins;
        }

        let invalidAssignees = [];

        await Promise.all([
            lib.github.addLabelsToPullRequest({
                prNumber: pr.data.number,
                labels: pullRequestLabels
            }),
            ...issueAssignees.map(githubLogin => {
                lib.github
                    .addAssigneesToPullRequest({
                        prNumber: pr.data.number,
                        assignees: [githubLogin]
                    })
                    .catch(err => {
                        // If assignee invalid, err.errors = 
                        // [{value: "<github_login>", resource: "Issue", field: "assignees", code: "invalid"}]
                        if (err.errors && err.errors[0].field === "assignees") {
                            invalidAssignees.push(err.errors[0].value);
                        }
                    });
            })
        ]);

        if (invalidAssignees.length === issueAssignees.length) {
            // All assignees invalid, assign to admins
            let admins = await lib.github.getRepoAdmins();
            await lib.github.addAssigneesToPullRequest({
                prNumber: pr.data.number,
                assignees: admins
            });
        }

        res.json({
            pr: pr.data.html_url
        });
    } catch (err) {
        res.status(500).json({
            error:
                err.message ||
                `Error submitting ${pageCategory.toLowerCase()} changes.`
        });
    }
});

router.post("/terms", async (req, res) => {
    let submission = req.body;
    let missingParams = lib.utils.getMissingParams(
        ["email", "otp", "otpRequestId", "term", "full_term", "description"],
        submission
    );
    if (missingParams.length > 0) {
        res.status(400).json({
            error: `The following parameters are missing: ${missingParams.join(
                ", "
            )}`
        });
        return;
    }

    const email = submission.email;
    const otp = submission.otp;
    const otpRequestId = submission.otpRequestId;

    try {
        await lib.otp.verifyOtp(email, otp, otpRequestId);
    } catch (err) {
        res.status(403).json({
            error: "OTP validation failed."
        });
        return;
    }

    try {
        let termsFileContents = await octokit.repos.getContents({
            owner: githubRepoOwner,
            repo: githubRepoName,
            path: "terms.json",
            ref: githubBaseRef
        });

        let termsFileRaw = Buffer.from(
            termsFileContents.data.content,
            "base64"
        ).toString();

        let existingTerms = JSON.parse(termsFileRaw);

        let newTerm = {
            id: uuidv4(),
            term: submission.term,
            full_term: submission.full_term,
            description: submission.description,
            links: submission.links.length > 0 ? submission.links : [],
            tags: submission.tags.length > 0 ? submission.tags : []
        };

        existingTerms.push(newTerm);
        lib.utils.sortTerms(existingTerms);

        const updatedTerms = JSON.stringify(existingTerms, null, 4);

        const newBranchId = await lib.utils.generateId();
        const pr = await lib.github.createNewBranchAndPullRequest({
            filePath: "terms.json",
            fileContent: updatedTerms,
            baseBranchName: githubBaseRef,
            newBranchName: `term-new-${new Date()
                .toISOString()
                .substring(0, 10)}-${newBranchId}`,
            commitMessage: `New term suggestion from ${submission.email}`,
            prTitle: `New term suggestion from ${submission.email}`,
            prBody: yaml.safeDump(newTerm, {
                lineWidth: 120
            })
        });

        let pullRequestLabels = [
            "term",
            utils.toLowerCaseSlug(submission.term)
        ];

        await lib.github.addLabelsToPullRequest({
            labels: pullRequestLabels,
            prNumber: pr.data.number
        });

        res.json({
            pr: pr.data.html_url
        });
    } catch (err) {
        res.status(500).json({
            error: err.message || "Error submitting new term"
        });
    }
});

router.put("/terms", async (req, res) => {
    let submission = req.body;
    let missingParams = lib.utils.getMissingParams(
        [
            "email",
            "otp",
            "otpRequestId",
            "id",
            "term",
            "full_term",
            "description"
        ],
        submission
    );
    if (missingParams.length > 0) {
        res.status(400).json({
            error: `The following parameters are missing: ${missingParams.join(
                ", "
            )}`
        });
        return;
    }

    const email = submission.email;
    const otp = submission.otp;
    const otpRequestId = submission.otpRequestId;

    try {
        await lib.otp.verifyOtp(email, otp, otpRequestId);
    } catch (err) {
        res.status(403).json({
            error: "OTP validation failed."
        });
        return;
    }

    try {
        const updatedTerm = {
            id: submission.id,
            term: submission.term,
            full_term: submission.full_term,
            description: submission.description,
            links: submission.links.length > 0 ? submission.links : [],
            tags: submission.tags.length > 0 ? submission.tags : []
        };

        let termsFileContent = await octokit.repos.getContents({
            owner: githubRepoOwner,
            repo: githubRepoName,
            path: "terms.json",
            ref: githubBaseRef
        });

        let termsFileRaw = Buffer.from(
            termsFileContent.data.content,
            "base64"
        ).toString();

        let existingTerms = JSON.parse(termsFileRaw);

        let updatedTermIndex = existingTerms.findIndex(
            term => term.id === submission.id
        );
        existingTerms.splice(updatedTermIndex, 1, updatedTerm);

        let newContent = JSON.stringify(existingTerms, null, 4);

        const newBranchId = await lib.utils.generateId();
        let pr = await lib.github.createNewBranchAndPullRequest({
            filePath: "terms.json",
            fileContent: newContent,
            baseBranchName: githubBaseRef,
            newBranchName: `term-edit-${new Date()
                .toISOString()
                .substring(0, 10)}-${newBranchId}`,
            commitMessage: `New term edits from ${submission.email}`,
            prTitle: `New term edits from ${submission.email}`,
            prBody: yaml.safeDump(updatedTerm, {
                lineWidth: 120
            })
        });
        let pullRequestLabels = [
            "term",
            utils.toLowerCaseSlug(submission.term)
        ];
        await lib.github.addLabelsToPullRequest({
            labels: pullRequestLabels,
            prNumber: pr.data.number
        });

        res.json({
            pr: pr.data.html_url
        });
    } catch (err) {
        res.status(500).json({
            error: err
        });
    }
});

router.get("/events", async (req, res) => {
    const response = await axios.get("https://api.meetup.com/STACK-X-by-GovTech-Singapore/events?fields=plain_text_description");
    res.send(response.data);
});

module.exports = router;
