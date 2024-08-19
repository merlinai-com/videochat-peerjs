<!--
 @component The message history of a single group
 -->

<script lang="ts">
    import { enhance } from "$app/forms";
    import { fetchJson } from "$lib";
    import { message as messageSocket } from "$lib/socket";
    import { createTimeStore } from "$lib/stores";
    import type {
        Attachment,
        AttachmentId,
        Group,
        GroupId,
        JsonSafe,
        Message,
        User,
        UserId,
    } from "backend/lib/database";
    import type { MessageSocket, UUID } from "backend/lib/types";
    import { mergeBy, selectNonNull } from "backend/lib/utils";
    import { formatDistanceToNowStrict } from "date-fns/formatDistanceToNowStrict";
    import { onMount } from "svelte";

    const dateFns = createTimeStore(() => ({
        formatDistanceToNowStrict,
    }));

    /** The current user's ID */
    export let user: JsonSafe<User> | undefined;
    /** The currently selected group */
    export let selectedGroup: JsonSafe<Group> | undefined;
    /** Include controls for the group (ie invite link, call button) */
    export let controls = false;

    let socket: MessageSocket;

    $: title =
        selectedGroup &&
        (selectedGroup.type == "group" ? selectedGroup.name : "P2P");
    // : getOtherUser(selectedGroup.users, data.user?.email).email);

    let users: Record<JsonSafe<UserId>, string | undefined> = {};
    let messages: JsonSafe<Message<Attachment>>[] = [];

    /** A map from files to attachment IDs */
    const attachmentMap = new WeakMap<File, JsonSafe<AttachmentId>>();

    async function getAttachmentId(
        file: File,
        group: JsonSafe<GroupId>
    ): Promise<JsonSafe<AttachmentId>> {
        let id = attachmentMap.get(file);
        if (id) return id;

        const formData = new FormData();
        formData.set("file", file);
        formData.set("group", group);

        id = await fetchJson<JsonSafe<AttachmentId>>("/api/attachment/create", {
            body: formData,
            method: "POST",
        });

        attachmentMap.set(file, id);
        return id;
    }

    let message = {
        content: "",
        attachments: [] as File[],
    };

    $: socket && selectedGroup && subscribe(socket, selectedGroup);
    function subscribe(socket: MessageSocket, selectedGroup: JsonSafe<Group>) {
        messages = [];
        socket.emit("subscribe", selectedGroup.id);
    }

    async function sendMessage(message: {
        groupId: JsonSafe<GroupId>;
        content: string;
        attachments: File[];
        msgId: UUID;
    }) {
        const timeoutStep = 1000;
        const timeoutMax = 10000;
        let timeout = 2000;

        const attachments: JsonSafe<AttachmentId>[] = [];
        for (const attachment of message.attachments) {
            attachments.push(
                await getAttachmentId(attachment, message.groupId)
            );
        }

        while (true) {
            try {
                await socket
                    .timeout(timeout)
                    .emitWithAck("send", { ...message, attachments });
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

    function addMessages(m: JsonSafe<Message<Attachment>>[]) {
        // TODO: add message ordering
        messages = mergeBy(messages, m, "sent_time");
        console.log(messages);
    }

    function requestUsers() {
        let us = messages.flatMap((m) => (m.in in users ? [] : [m.in]));
        us = [...new Set(us)];
        if (us.length > 0) socket.emit("request_users", us);
    }

    onMount(() => {
        socket = messageSocket();

        socket.on("messages", (ms) => {
            if (!selectedGroup) return;

            addMessages(ms);
            requestUsers();
        });

        socket.on("users", (us) => {
            for (const u of us) {
                users[u.id] = u.name;
            }
        });

        return () => socket.close();
    });

    function dropHandler(event: DragEvent) {
        if (!event.dataTransfer) return;

        let files;
        if (event.dataTransfer.items) {
            files = selectNonNull(
                [...event.dataTransfer.items].map((item) => item.getAsFile())
            );
        } else {
            files = [...event.dataTransfer.files];
        }

        message.attachments = [...message.attachments, ...files];
    }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
    on:drop|preventDefault={dropHandler}
    on:dragover|preventDefault={() => console.log("File in drop zone")}
>
    {#if selectedGroup}
        {#if controls}
            <h2>{title}</h2>
            <button
                on:click={() =>
                    window.navigator.clipboard
                        .writeText(
                            new URL(
                                `/group/${selectedGroup.id.replace("group:", "")}`,
                                window.location.origin
                            ).href
                        )
                        .catch(console.error)}>Copy invite link</button
            >
            <form action="/?/call_group" method="POST" use:enhance>
                <input name="group" value={selectedGroup.id} hidden readonly />
                <button>Call</button>
            </form>
        {/if}
        <ul class="flex-col overflow-y-auto overflow-x-hidden min-h-0 min-w-0">
            {#each messages as message}
                <li class="flex-row col-gap-3 flex-wrap-reverse">
                    <div>
                        <span class="text-indent-hang-1 overflow-wrap-word">
                            <b>
                                {message.in === user?.id
                                    ? "Me"
                                    : users[message.in] ?? message.in}:
                            </b>
                            {message.content}
                        </span>

                        {#each message.attachments as attachment}
                            <a
                                href="/api/attachment/{attachment.id.replace(
                                    'attachment:',
                                    ''
                                )}"
                            >
                                {attachment.name}
                            </a>
                        {/each}
                    </div>

                    <time
                        class="text-translucent self-end flex-self-right"
                        datetime={message.sent_time}
                    >
                        {$dateFns.formatDistanceToNowStrict(message.sent_time, {
                            addSuffix: true,
                        })}
                    </time>
                </li>
            {/each}
        </ul>
        <form
            class="flex-col"
            on:submit|preventDefault={() => {
                sendMessage({
                    ...message,
                    groupId: selectedGroup.id,
                    msgId: crypto.randomUUID(),
                });
                message = { content: "", attachments: [] };
            }}
        >
            <ul>
                {#each message.attachments as attachment, idx}
                    <li>
                        {attachment.name}
                        <button
                            on:click={() => {
                                message.attachments.splice(idx, 1);
                                message = message;
                            }}
                        >
                            Delete
                        </button>
                    </li>
                {/each}
            </ul>
            <div>
                <!-- svelte-ignore a11y-no-noninteractive-element-to-interactive-role -->
                <label class="button" role="button" for="file-selector">
                    Add attachment
                </label>
                <input id="file-selector" type="file" multiple />
                <!-- File list -->
                <input
                    placeholder="Message"
                    required
                    bind:value={message.content}
                />
                <button disabled={!socket} type="submit">Send</button>
            </div>
        </form>
    {/if}
</div>

<style>
    input[type="file"] {
        opacity: 0;
        width: 0;
        height: 0;
    }
</style>
