<script lang="ts">
    import type {
        Attachment,
        JsonSafe,
        Message,
        UserId,
    } from "backend/lib/database";
    import { format } from "date-fns/format";
    import AttachmentView from "./AttachmentView.svelte";

    export let message: JsonSafe<Message<Attachment>>;
    export let users: Record<JsonSafe<UserId>, string | undefined>;
    export let userId: JsonSafe<UserId | undefined>;
</script>

<div class="min-w-0">
    <span class="text-indent-hang-1 overflow-wrap-word">
        <b>
            {message.in === userId ? "Me" : users[message.in] ?? message.in}:
        </b>
        {message.content}
    </span>

    {#each message.attachments as attachment}
        <AttachmentView {attachment} />
    {/each}
</div>

<time
    class="text-translucent self-end flex-self-right"
    datetime={message.sent_time}
>
    {format(message.sent_time, "HH:mm:ss")}
</time>
