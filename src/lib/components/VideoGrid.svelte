<script lang="ts">
    import { findBestLayout } from "$lib/layout";
    import { createEventDispatcher, onMount } from "svelte";
    import MediaPlayer from "./MediaPlayer.svelte";

    export let videos: { stream: MediaStream; name?: string }[];
    export let streams: { local?: MediaStream; screen?: MediaStream };

    const emit = createEventDispatcher<{ select: MediaStream }>();

    let container: HTMLElement;

    /** Get metadata about videos */
    function getVideoLayouts(
        videos: { stream: MediaStream }[]
    ): { aspectRatio?: number; stream: MediaStream }[] {
        // TODO: assumes there's at most 1 video track
        const tracks = videos.flatMap(({ stream }) => {
            const [videoTrack] = stream.getVideoTracks();
            return [
                { track: videoTrack as MediaStreamTrack | undefined, stream },
            ];
        });

        return tracks.map(({ track, stream }) => {
            const settings = track?.getSettings();
            return {
                aspectRatio:
                    settings?.aspectRatio ??
                    (settings?.width ?? 640) / (settings?.height ?? 480),
                stream,
            };
        });
    }

    let client = { width: 1, height: 1 };
    $: layout = findBestLayout(client, getVideoLayouts(videos));

    onMount(() => {
        client.width = container.clientWidth;
        client.height = container.clientHeight;

        const observer = new ResizeObserver(() => {
            client.width = container.clientWidth;
            client.height = container.clientHeight;
        });
        observer.observe(container);
        return () => observer.disconnect();
    });
</script>

<div
    class="w-full h-full grid gap-3"
    style="grid-template-columns: repeat({layout.cols}, 1fr); grid-template-rows: repeat({layout.rows}, 1fr);"
    bind:this={container}
>
    {#each videos as { stream, name } (stream.id)}
        <div class="min-w-0 min-h-0">
            <MediaPlayer
                on:click={() => emit("select", stream)}
                class_="w-full h-full"
                {stream}
                muted={stream === streams.local}
                {name}
            />
        </div>
    {/each}
</div>
