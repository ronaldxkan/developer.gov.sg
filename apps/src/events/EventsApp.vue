<template>
    <div id="events-app">
        <h4>Meetups</h4>
        <div class="spinner" v-if="loading">
            <div class="rect1"></div>
            <div class="rect2"></div>
            <div class="rect3"></div>
            <div class="rect4"></div>
            <div class="rect5"></div>
        </div>
        <div v-if="!loading">
            <div class="row is-multiline">
                <div class="col is-flex" v-for="event of events" :key="event.id">
                    <a class="sgds-card sgds-card-button" :href="event.link" target="_blank">
                        <div class="sgds-card-header">
                            <p class="sgds-card-header-title">{{ event.name }}</p>
                        </div>
                        <div class="sgds-card-content">
                            <div class="row">
                                <div class="col is-2 has-text-centered">
                                    <p>{{ event.time | moment("MMM") }}</p>
                                    <h2>{{ event.time | moment("D") }}</h2>
                                </div>
                                <div class="col is-10">
                                    <p class="summary">{{ event.plain_text_description }}</p>
                                    <br />
                                    <small>
                                        <span class="sgds-icon sgds-icon-my-location"></span>
                                        {{ event.venue.name }}
                                    </small>
                                </div>
                            </div>
                        </div>
                    </a>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import axios from "axios";
export default {
    data() {
        return {
            events: null,
            loading: false
        };
    },
    created() {
        this.loading = true;
        axios
            .get("/.netlify/functions/api/events")
            .then(response => {
                this.events = response.data;
            })
            .finally(() => {
                this.loading = false;
            });
    }
};
</script>

<style scoped>
.summary {
    max-height: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    display: -webkit-box;
}
</style>
