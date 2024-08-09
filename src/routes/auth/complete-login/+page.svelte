<script lang="ts">
    import { onMount } from "svelte";
    import type { PageData } from "./$types";

    export let data: PageData;

    onMount(() => {
        (window.top ?? window).location = data.redirect;
    });
</script>

You should be redirected now. If not please click <a href={data.redirect}
    >Here</a
>
