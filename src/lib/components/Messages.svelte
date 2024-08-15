<!--
 @component The list of all (p2p and normal) groups
 -->

<script lang="ts">
    import { enhance } from "$app/forms";
    import { getOtherUser } from "$lib";
    import type { Group, JsonSafe } from "backend/lib/database";
    import { onMount } from "svelte";
    import type { ActionData, PageData } from "../../routes/$types";
    import Message from "./Message.svelte";

    export let data: PageData;
    export let form: ActionData;

    let selectedGroup: JsonSafe<Group> | undefined;

    $: if (
        form?.action === "create_p2p_group" ||
        form?.action === "create_group"
    ) {
        selectedGroup = form.group;
    }

    onMount(() => {});
</script>

<div>
    <h1>Messages</h1>
    {#if data.ssoUser}
        <form action="/?/create_group" method="POST" use:enhance>
            <h2>Create group</h2>
            <label for="create-group-name">Name:</label>
            <input
                id="create-group-name"
                name="name"
                placeholder="Group name"
            />
            <button type="submit">New group</button>
        </form>
        <form action="/?/create_p2p_group" method="POST" use:enhance>
            <h2>Message a user</h2>
            <label for="p2p-message-user">Email:</label>
            <input
                type="email"
                id="p2p-message-user"
                name="email"
                placeholder="Email"
                required
            />
            <button type="submit">Message</button>
        </form>
    {:else}
        Log in to create create a group
    {/if}
    <h2>Groups</h2>
    {#if data.user && data.groups}
        <ul>
            {#each data.groups as group}
                <li>
                    <button on:click={() => (selectedGroup = group)}>
                        {#if group.type === "p2p"}
                            {getOtherUser(group.users, data.user.id)}
                        {:else}
                            {group.name}
                        {/if}
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<Message user={data.user} {selectedGroup} controls />
