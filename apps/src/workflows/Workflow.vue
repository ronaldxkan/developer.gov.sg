<template>
    <div id="workflow">
        <h4>How can we help you?</h4>
        <h3>
            I need a
            <div class="field">
                <div class="control">
                    <div class="select">
                        <select v-model="selectedApp">
                            <option
                                v-for="application of APPLICATIONS"
                                :key="application"
                                :value="application"
                            >{{ application }}</option>
                        </select>
                    </div>
                </div>
            </div>and
            <div class="field">
                <div class="control">
                    <div class="select">
                        <select v-model="selectedStage">
                            <option
                                v-for="stage in STAGES"
                                :key="stage.tag"
                                :value="stage"
                            >{{ stage.title }}</option>
                        </select>
                    </div>
                </div>
            </div>
        </h3>
        <hr />
        <template v-for="(category, categoryIndex) of highlightedCategories">
            <div :key="category.tag">
                <div class="row">
                    <div class="col">
                        <h5>{{ category.title }}</h5>
                        <p>{{ category.description }}</p>
                    </div>
                </div>

                <div class="row is-multiline">
                    <div
                        class="col is-4 is-flex"
                        v-for="(workflow, index) in category.workflows"
                        :key="index"
                    >
                        <a class="sgds-card sgds-card-button" :href="workflow.url">
                            <div class="sgds-card-header">
                                <p class="sgds-card-header-title">{{ workflow.title }}</p>
                            </div>
                            <div class="sgds-card-content">
                                <small>{{workflow.description }}</small>
                            </div>
                        </a>
                    </div>
                </div>
                <hr v-if="categoryIndex !== highlightedCategories.length - 1" />
            </div>
        </template>
    </div>
</template>

<script>
import { STAGES, APPLICATIONS, CATEGORIES } from "./WorkflowData";

export default {
    data() {
        return {
            workflows: window.workflows,
            selectedStage: STAGES.BEGINNER,
            selectedApp: APPLICATIONS.STATIC_WEBSITE,
            STAGES: STAGES,
            APPLICATIONS: APPLICATIONS,
            CATEGORIES: CATEGORIES
        };
    },
    computed: {
        highlightedCategories() {
            // Create a copy for computed property, else it changes the data() state directly
            let hc = this.CATEGORIES.map(category => {
                return {
                    ...category
                };
            });
            hc.forEach((category, index) => {
                category.workflows = this.highlightedWorkflows.filter(
                    workflow => workflow.category === category.tag
                );
            });
            return hc.filter(category => category.workflows.length > 0);
        },
        highlightedWorkflows() {
            return this.workflows.filter(workflow => {
                let stages = workflow.stage
                    ? workflow.stage.split(",").map(s => s.trim())
                    : [];
                let applications = workflow.application
                    ? workflow.application.split(",").map(s => s.trim())
                    : [];

                return (
                    stages.includes(this.selectedStage.tag) &&
                    applications.includes(this.selectedApp)
                );
            });
        }
    }
};
</script>

<style scoped>
.field,
.control {
    display: inline-block;
}

.select:not(.is-multiple):not(.is-loading):after {
    margin-top: -1em;
}
</style>
