<script lang="ts">
    import VideoPlayer from "./MediaPlayer.svelte";

    export let peers: Record<string, Set<MediaStream>>;
    export let streams: { local?: MediaStream; screen?: MediaStream };
    export let screenShareId: string;

    $: videos = [
        ...Object.values(peers).flatMap((streams) => [...streams]),
        ...(streams.local ? [streams.local] : []),
        ...(streams.screen ? [streams.screen] : []),
    ];

    $: nonScreenShare = videos.filter((stream) => stream.id !== screenShareId);
    $: screenShare = videos.find((stream) => stream.id === screenShareId);

    $: style = `grid-template-columns: repeat(${nonScreenShare.length}, 1fr); grid-template-rows: min(max-content, 3fr) 1fr;`;
</script>

<div class="w-full h-full grid gap-3" {style}>
    <div class="min-w-0 min-h-0 span-cols-all">
        {#if screenShare}
            <VideoPlayer class_="w-full h-full" stream={screenShare} />
        {/if}
    </div>
    {#each nonScreenShare as stream (stream.id)}
        <div class="min-w-0 min-h-0">
            <VideoPlayer
                class_="w-full h-full"
                {stream}
                muted={stream == streams.local}
            />
        </div>
    {/each}
</div>
