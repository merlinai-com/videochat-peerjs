<script lang="ts">
    import CreateRoom from "$lib/components/CreateRoom.svelte";
    import type { PageData } from "./$types";

    export let data: PageData;
</script>

<nav>
    <a href="/">Zap</a>
</nav>

<!-- SSO information -->
{#if data.user}
    <div>
        Logged in as {data.user.name} ({data.user.email})
        <a href={data.authURLs.logout}>Log out</a>
    </div>
{:else}
    <div>
        <a href={data.authURLs.login}>Log in</a>
    </div>
{/if}

<div>
    <CreateRoom />
</div>

{#if data.user}
    <div>
        <h1>Messages</h1>
        <ul id="message-list"></ul>
    </div>
{/if}
