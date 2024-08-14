<script lang="ts">
    import { findBestLayout } from "$lib/layout";
    import Video from "./Video.svelte";

    export let peers: Record<string, MediaStream>;
    export let self: MediaStream | undefined;

    /** Get metadata about videos */
    function getVideoLayouts(
        peers: Record<string, MediaStream>,
        self?: MediaStream
    ): { aspectRatio: number }[] {
        const stream = Object.values(peers);
        if (self) stream.push(self);

        // TODO: assumes there's at most 1 video track
        const videos = stream.flatMap((stream) =>
            stream.getVideoTracks().slice(0, 1)
        );

        return videos.map((track) => {
            const settings = track.getSettings();
            return {
                aspectRatio:
                    settings.aspectRatio ??
                    (settings.width ?? 640) / (settings.height ?? 480),
            };
        });
    }

    $: videos = getVideoLayouts(peers, self);

    let client = { width: 1, height: 1 };
    $: layout = findBestLayout(client, videos);

    $: style = `grid-template-columns: repeat(${layout.cols}, 1fr); grid-template-rows: repeat(${layout.rows}, 1fr)`;
</script>

<div
    class="w-full h-full grid"
    {style}
    bind:clientWidth={client.width}
    bind:clientHeight={client.height}
>
    {#each Object.entries(peers) as [id, stream] (id)}
        <div class="min-w-0 min-h-0">
            <Video class_="w-full h-full" {stream} />
        </div>
    {/each}
    {#if self}
        <div class="min-w-0 min-h-0">
            <Video class_="w-full h-full" stream={self} muted />
        </div>
    {/if}
</div>
