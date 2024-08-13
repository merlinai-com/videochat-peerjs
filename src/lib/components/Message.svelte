<!--
 @component The message history of a single group
 -->

<script lang="ts">
    import { enhance } from "$app/forms";
    import { message } from "$lib/socket";
    import type {
        Group,
        GroupId,
        JsonSafe,
        Message,
        UserId,
    } from "backend/lib/database";
    import type { MessageSocket, UUID } from "backend/lib/types";
    import { onMount } from "svelte";

    export let selectedGroup: UUID | undefined;
    export let groupById: Record<UUID, JsonSafe<Group>>;

    let socket: MessageSocket | undefined;

    $: group = selectedGroup && groupById[selectedGroup];
    $: title = group && (group.type == "group" ? group.name : "P2P");
    // : getOtherUser(group.users, data.user?.email).email);

    let users: Record<JsonSafe<UserId>, string> = {};
    let messages: JsonSafe<Message>[] = [];
    let messageContent = "";

    $: socket && group && subscribe(socket, group);
    function subscribe(socket: MessageSocket, group: JsonSafe<Group>) {
        messages = [];
        socket.emit("subscribe", group.id);
    }

    async function sendMessage(arg: {
        groupId: JsonSafe<GroupId>;
        content: string;
        msgId: UUID;
    }) {
        while (true) {
            const error = await socket?.timeout(2000).emitWithAck("send", arg);
            if (error) {
                console.error(error);
            } else {
                return;
            }
        }
    }

    function addMessage(m: JsonSafe<Message>) {
        // TODO: add message ordering
        messages = [...messages, m];
    }

    function requestUsers() {
        let us = messages.flatMap((m) => (m.in in users ? [] : [m.in]));
        us = [...new Set(us)];
        socket?.emit("request_users", us);
    }

    onMount(() => {
        socket = message();

        socket.on("messages", (ms) => {
            if (!group) return;

            for (const m of ms) {
                addMessage(m);
                requestUsers();
            }
        });

        socket.on("users", (us) => {
            for (const u of us) {
                users[`user:${u.id}`] = u.name;
            }
        });

        return () => socket?.close();
    });
</script>

{#if group}
    <h2>{title}</h2>
    <button
        on:click={() =>
            window.navigator.clipboard
                .writeText(
                    new URL(
                        `/group/${group.id.replace("group:", "")}`,
                        window.location.origin
                    ).href
                )
                .catch(console.error)}>Copy invite link</button
    >
    <form action="/?/call_group" method="POST" use:enhance>
        <input name="group" value={group.id} hidden readonly />
        <button>Call</button>
    </form>
    <ul>
        {#each messages as message}
            <li>
                <b>{message.in}:</b>
                <span>{message.content}</span>
            </li>
        {/each}
    </ul>
    <form
        on:submit|preventDefault={() => {
            sendMessage({
                groupId: group.id,
                content: messageContent,
                msgId: crypto.randomUUID(),
            });
        }}
    >
        <input placeholder="Message" required bind:value={messageContent} />
        <button disabled={!socket} type="submit">Send</button>
    </form>
{/if}
