<script lang="ts">
    import { onMount } from "svelte";

    export let stream: MediaStream;
    export let muted: boolean = false;

    let video: HTMLVideoElement;

    onMount(() => {
        video.srcObject = stream;
        video.play();
    });
</script>

<!-- svelte-ignore a11y-media-has-caption -->
<video
    bind:this={video}
    disablepictureinpicture
    on:contextmenu|preventDefault
    {muted}
>
</video>
