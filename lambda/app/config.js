function loadEnvVar(envVarName) {
    if (process.env[envVarName]) {
        return process.env[envVarName];
    } else {
        throw new Error(`Missing environment variable: ${envVarName}`);
    }
}

module.exports = {
    githubAppId: Number.parseInt(loadEnvVar("GITHUB_APP_ID")),
    githubAppInstallationId: Number.parseInt(
        loadEnvVar("GITHUB_APP_INSTALLATION_ID")
    ),
    githubAppKey: loadEnvVar("GITHUB_APP_KEY")
        .split("\\n")
        .join("\n"), // To format newlines properly
    githubAppUid: loadEnvVar("GITHUB_APP_UID"), // todo: use uid to identify commits from GitHub app
    githubBaseRef: loadEnvVar("GITHUB_BASE_REF"),
    githubRepoOwner: loadEnvVar("GITHUB_OWNER"),
    clientID: loadEnvVar("GITHUB_SSO_ID"),
    clientSecret: loadEnvVar("GITHUB_SSO_SECRET"),
    tokenHash: loadEnvVar("GITHUB_SSO_TOKEN_HASH"),
    otpServiceUrl: loadEnvVar("OTP_SERVICE_URL"),
    otpServiceAppId: loadEnvVar("OTP_SERVICE_APP_ID"),
    otpServiceAppSecret: loadEnvVar("OTP_SERVICE_APP_SECRET"),
    githubRepoName: "developer.gov.sg",
    netlifyUrl: loadEnvVar("NETLIFY_URL")
};
