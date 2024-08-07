<script lang="ts">
    import type { PageData } from "./$types";

    export let data: PageData;
</script>

<iframe src={data.loginUrl} title="Log in"></iframe>

<style>
    :global(body) {
        padding: 0;
        margin: 0;
        overflow: hidden;
    }

    iframe {
        border: none;
        width: 100vw;
        height: 100vh;
    }
</style>
