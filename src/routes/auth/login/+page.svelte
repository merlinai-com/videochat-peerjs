<script lang="ts">
    import type { PageData } from "./$types";

    export let data: PageData;
</script>

<iframe src={data.loginUrl} title="Log in"></iframe>

<style>
    iframe {
        border: none;
        width: 100vw;
        height: 100vh;
    }
</style>
