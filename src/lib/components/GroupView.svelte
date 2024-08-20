<!--
 @component The message history of a single group
 -->

<script lang="ts">
    import { enhance } from "$app/forms";
    import { fetchJson } from "$lib";
    import { message as messageSocket } from "$lib/socket";
    import { createTimeStore, createUserNamesStore } from "$lib/stores";
    import type {
        Attachment,
        AttachmentId,
        Group,
        GroupId,
        JsonSafe,
        Message,
        User,
    } from "backend/lib/database";
    import type { MessageSocket, UUID } from "backend/lib/types";
    import { groupBy, mergeBy, selectNonNull } from "backend/lib/utils";
    import { format } from "date-fns/format";
    import { formatDistanceToNowStrict } from "date-fns/formatDistanceToNowStrict";
    import { onMount } from "svelte";
    import MessageView from "./MessageView.svelte";

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
    let users = createUserNamesStore();

    $: title =
        selectedGroup &&
        (selectedGroup.type == "group" ? selectedGroup.name : "P2P");
    // : getOtherUser(selectedGroup.users, data.user?.email).email);

    let messages: JsonSafe<Message<Attachment>>[] = [];

    /** The message that's currently being edited*/
    let message = {
        content: "",
        attachments: [] as File[],
    };

    /** A map from files to attachment IDs */
    const attachmentIds = new WeakMap<File, JsonSafe<AttachmentId>>();
    /** A map from files with image/* MIME type to object URLs */
    const attachmentUrls = new Map<File, string>();

    $: updateAttachmentUrls(message.attachments);
    function updateAttachmentUrls(attachments: File[]) {
        const images = new Set(
            attachments.filter((file) => file.type.startsWith("image/"))
        );
        for (const [file, url] of attachmentUrls) {
            if (!images.has(file)) {
                URL.revokeObjectURL(url);
                attachmentUrls.delete(file);
            }
        }
        for (const image of images) {
            if (!attachmentUrls.has(image)) {
                attachmentUrls.set(image, URL.createObjectURL(image));
            }
        }
    }

    async function getAttachmentId(
        file: File,
        group: JsonSafe<GroupId>
    ): Promise<JsonSafe<AttachmentId>> {
        let id = attachmentIds.get(file);
        if (id) return id;

        const formData = new FormData();
        formData.set("file", file);
        formData.set("group", group);

        id = await fetchJson<JsonSafe<AttachmentId>>("/api/attachment/create", {
            body: formData,
            method: "POST",
        });

        attachmentIds.set(file, id);
        return id;
    }

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
    }

    onMount(() => {
        socket = messageSocket();

        socket.on("messages", (ms) => {
            if (!selectedGroup) return;

            addMessages(ms);
            users.request(messages.map((m) => m.in));
        });

        users = createUserNamesStore(socket);

        return () => socket.close();
    });

    function dropHandler(event: DragEvent) {
        let files: (File | null)[] = [];

        if (event.dataTransfer?.items) {
            files = [...event.dataTransfer.items].map((item) =>
                item.getAsFile()
            );
        } else if (event.dataTransfer) {
            files = [...event.dataTransfer.files];
        }

        message.attachments = [...message.attachments, ...selectNonNull(files)];
    }

    function pasteHandler(event: ClipboardEvent) {
        if (!event.clipboardData) return;
        let files = [...event.clipboardData.items].map((item) =>
            item.getAsFile()
        );
        message.attachments = [...message.attachments, ...selectNonNull(files)];
    }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div on:drop|preventDefault={dropHandler} on:dragover|preventDefault>
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
            {#each groupBy( messages, (m) => format(m.sent_time, "d MMMM yyyy") ) as { key, values }}
                <span class="align-self-center text-translucent">
                    {key}
                </span>
                {#each values as message}
                    <li class="flex-row col-gap-3 flex-wrap-reverse">
                        <MessageView
                            {message}
                            userId={user?.id}
                            users={$users}
                        />
                    </li>
                {/each}
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
            <div class="flex-row">
                {#if message.attachments.length > 0}
                    <h3>Attachments</h3>
                {/if}
                <ul>
                    {#each message.attachments as attachment, idx}
                        {@const image = attachmentUrls.get(attachment)}
                        <li>
                            {#if image}
                                <img
                                    class="max-w-8 max-h-8"
                                    src={image}
                                    alt={attachment.name}
                                />
                            {:else}
                                {attachment.name}
                            {/if}
                            <button
                                type="button"
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
            </div>

            <div>
                <!-- svelte-ignore a11y-no-noninteractive-element-to-interactive-role -->
                <label class="button" role="button" for="file-selector">
                    Add attachment
                </label>
                <input
                    id="file-selector"
                    type="file"
                    multiple
                    on:change={({ currentTarget }) =>
                        (message.attachments = [
                            ...message.attachments,
                            ...(currentTarget.files ?? []),
                        ])}
                />

                <input
                    placeholder="Message"
                    required={message.attachments.length === 0}
                    bind:value={message.content}
                    on:paste={pasteHandler}
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
