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
        User,
        UserId,
    } from "backend/lib/database";
    import type { MessageSocket, UUID } from "backend/lib/types";
    import { onMount } from "svelte";

    /** The current user's ID */
    export let user: JsonSafe<User> | undefined;

    export let selectedGroup: JsonSafe<Group> | undefined;

    let socket: MessageSocket | undefined;

    $: title =
        selectedGroup &&
        (selectedGroup.type == "group" ? selectedGroup.name : "P2P");
    // : getOtherUser(selectedGroup.users, data.user?.email).email);

    let users: Record<JsonSafe<UserId>, string | undefined> = {};
    let messages: JsonSafe<Message>[] = [];
    let messageContent = "";

    $: socket && selectedGroup && subscribe(socket, selectedGroup);
    function subscribe(socket: MessageSocket, selectedGroup: JsonSafe<Group>) {
        messages = [];
        socket.emit("subscribe", selectedGroup.id);
    }

    async function sendMessage(arg: {
        groupId: JsonSafe<GroupId>;
        content: string;
        msgId: UUID;
    }) {
        const timeoutStep = 1000;
        const timeoutMax = 10000;
        let timeout = 2000;
        while (true) {
            try {
                await socket?.timeout(timeout).emitWithAck("send", arg);
                return;
            } catch (error) {
                console.error(
                    `Error when sending message with timeout: ${timeout}`,
                    error
                );
                timeout = Math.min(timeout + timeoutStep, timeoutMax);
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
            if (!selectedGroup) return;

            for (const m of ms) {
                addMessage(m);
            }
            requestUsers();
        });

        socket.on("users", (us) => {
            for (const u of us) {
                users[u.id] = u.name;
            }
        });

        return () => socket?.close();
    });
</script>

{#if selectedGroup}
    <h2>{title}</h2>
    <button
        on:click={() =>
            window.navigator.clipboard
                .writeText(
                    new URL(
                        `/selectedGroup/${selectedGroup.id.replace("group:", "")}`,
                        window.location.origin
                    ).href
                )
                .catch(console.error)}>Copy invite link</button
    >
    <form action="/?/call_group" method="POST" use:enhance>
        <input name="group" value={selectedGroup.id} hidden readonly />
        <button>Call</button>
    </form>
    <ul>
        {#each messages as message}
            <li>
                <b
                    >{message.in === user?.id
                        ? "Me"
                        : users[message.in] ?? message.in}:</b
                >
                <span>{message.content}</span>
            </li>
        {/each}
    </ul>
    <form
        on:submit|preventDefault={() => {
            sendMessage({
                groupId: selectedGroup.id,
                content: messageContent,
                msgId: crypto.randomUUID(),
            });
        }}
    >
        <input placeholder="Message" required bind:value={messageContent} />
        <button disabled={!socket} type="submit">Send</button>
    </form>
{/if}
