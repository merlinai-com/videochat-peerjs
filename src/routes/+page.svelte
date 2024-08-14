<script lang="ts">
    import CreateRoom from "$lib/components/CreateRoom.svelte";
    import Login from "$lib/components/Login.svelte";
    import Messages from "$lib/components/Messages.svelte";
    import PickName from "$lib/components/PickName.svelte";
    import type { ActionData, PageData } from "./$types";

    export let data: PageData;
    export let form: ActionData;
</script>

<nav>
    <a href="/">Zap</a>
</nav>

<Login {data} />

{#if data.user}
    <PickName required={!data.ssoUser} user={data.user} />
{/if}

<CreateRoom user={data.ssoUser} />

<Messages {data} {form} />
