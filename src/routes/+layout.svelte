<script lang="ts">
    import CookieNotice from "$lib/components/CookieNotice.svelte";
    import "$lib/global.css";

    export let data: App.PageData;
</script>

<CookieNotice {data} />

<slot />
