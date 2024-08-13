<script lang="ts">
    import CreateRoom from "$lib/components/CreateRoom.svelte";
    import Messages from "./Messages.svelte";
    import type { ActionData, PageData } from "./$types";

    export let data: PageData;
    export let form: ActionData;
</script>

<nav>
    <a href="/">Zap</a>
</nav>

<!-- SSO information -->
{#if data.user}
    <div>
        Logged in as {data.user.name} ({data.user.email})
        <a href={data.authURLs.logout}>Log out</a>
        {data.user.id}
    </div>
{:else}
    <div>
        <a href={data.authURLs.login}>Log in</a>
    </div>
{/if}

<CreateRoom user={data.user} />

<Messages {data} {form} />
