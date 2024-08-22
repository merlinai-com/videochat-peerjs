<script lang="ts">
    import CookieNotice from "$lib/components/CookieNotice.svelte";
    import GroupSelector from "$lib/components/GroupSelector.svelte";
    import Login from "$lib/components/Login.svelte";
    import PickName from "$lib/components/PickName.svelte";
    import type { ActionData, PageData } from "./$types";

    export let data: PageData;
    export let form: ActionData;
</script>

<CookieNotice {data} />

<div class="root flex-col gap-3">
    <nav>
        <a href="/">Zap</a>
    </nav>

    <Login {data} />

    {#if data.user}
        <PickName required={!data.ssoUser} user={data.user} />
    {/if}

    <!-- <CreateRoom user={data.ssoUser} /> -->

    <GroupSelector {data} {form} />
</div>

<style>
    .root {
        width: 100vw;
        height: 100vh;
    }
</style>
