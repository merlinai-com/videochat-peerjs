<!-- @component A video grid with a selected large video -->

<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import VideoPlayer from "./MediaPlayer.svelte";

    export let videos: MediaStream[];
    export let streams: { local?: MediaStream; screen?: MediaStream };
    export let selectedStream: MediaStream;

    const emit = createEventDispatcher<{
        select: MediaStream;
        deselect: undefined;
    }>();

    // Non-selected streams
    $: otherStreams = videos.filter((stream) => stream !== selectedStream);
</script>

<div
    class="w-full h-full grid gap-3 root"
    style="grid-template-columns: repeat({otherStreams.length}, 1fr);"
>
    {#each otherStreams as stream (stream.id)}
        <div class="min-w-0 min-h-0 grid-row-1">
            <VideoPlayer
                on:click={() => emit("select", stream)}
                class_="w-full h-full"
                {stream}
                muted={stream === streams.local}
            />
        </div>
    {/each}
    <div class="span-cols-all min-h-0">
        <VideoPlayer
            on:click={() => emit("deselect")}
            class_="w-full h-full"
            stream={selectedStream}
            muted={selectedStream === streams.local}
        />
    </div>
</div>

<style>
    .root {
        grid-template-rows: minmax(12rem, 1fr) auto;
    }
</style>
