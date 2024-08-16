<script lang="ts">
    import VideoPlayer from "./MediaPlayer.svelte";

    export let peers: Record<string, Set<MediaStream>>;
    export let streams: { local?: MediaStream; screen?: MediaStream };
    export let screenShareId: string;

    $: videos = [
        ...Object.values(peers).flatMap((streams) => [...streams]),
        ...Object.values(streams).filter((stream) => stream),
    ];

    $: nonScreenShare = videos.filter((stream) => stream.id !== screenShareId);
    $: screenShare = videos.find((stream) => stream.id === screenShareId);
</script>

<div class="w-full h-full grid gap-3 root">
    {#each nonScreenShare as stream (stream.id)}
        <div class="min-w-0 min-h-0 grid-">
            <VideoPlayer
                class_="w-full h-full"
                {stream}
                muted={stream == streams.local}
            />
        </div>
    {/each}
    <div class="span-cols-all min-h-0">
        {#if screenShare}
            <VideoPlayer class_="w-full h-full" stream={screenShare} />
        {/if}
    </div>
</div>

<style>
    .root {
        grid-template-columns: repeat(auto-fill, 1fr);
        grid-template-rows: minmax(12rem, 1fr) auto;
    }
</style>
