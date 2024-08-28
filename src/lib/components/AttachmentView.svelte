<script lang="ts">
    import type { Attachment, JsonSafe } from "backend/lib/database";

    export let attachment: JsonSafe<Attachment>;
    $: href = `/api/attachment/${attachment.id.replace("attachment:", "")}`;
</script>

<a {href} target="_blank">
    {#if attachment.mime_type.startsWith("image/")}
        <img
            class="max-w-full"
            src={href}
            loading="lazy"
            title={attachment.name}
            alt={attachment.name}
        />
    {:else}
        {attachment.name}
    {/if}
</a>
