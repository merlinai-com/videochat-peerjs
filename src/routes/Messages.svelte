<!--
 @component The list of all (p2p and normal) groups
 -->

<script lang="ts">
    import { enhance } from "$app/forms";
    import { type UUID } from "backend/lib/types";
    import { onMount } from "svelte";
    import type { ActionData, PageData } from "./$types";
    import Message from "../lib/components/Message.svelte";
    import { getOtherUser } from "$lib";

    export let data: PageData;
    export let form: ActionData;

    $: groupById = Object.fromEntries(
        (data.groups ?? []).map((g) => [g.id, g])
    );

    let selectedGroup: UUID | undefined;

    $: if (
        form?.action === "create_p2p_group" ||
        form?.action === "create_group"
    ) {
        selectedGroup = form.id;
    }

    onMount(() => {});
</script>

{#if data.user}
    <div>
        <h1>Messages</h1>
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
        <h2>Groups</h2>
        {#if data.groups}
            <ul>
                {#each data.groups as group}
                    <li>
                        <button on:click={() => (selectedGroup = group.id)}>
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

    <Message {selectedGroup} {groupById} />
{/if}
