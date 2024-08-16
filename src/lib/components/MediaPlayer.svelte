<script lang="ts">
    import { onMount } from "svelte";

    export let stream: MediaStream;
    export let muted: boolean = false;
    export let class_ = "";

    let element: HTMLVideoElement | HTMLAudioElement;
    $: hasVideo = stream.getVideoTracks().length > 0;

    onMount(() => {
        element.srcObject = stream;
        element.play();
    });
</script>

<!-- svelte-ignore a11y-media-has-caption -->
{#if hasVideo}
    <video
        class={class_}
        bind:this={element}
        disablepictureinpicture
        on:contextmenu|preventDefault
        {muted}
    >
    </video>
{:else}
    <div class={class_}>
        Audio
        <audio bind:this={element}></audio>
    </div>
{/if}
