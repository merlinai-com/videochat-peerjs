<script lang="ts">
    import { onMount } from "svelte";

    export let stream: MediaStream;
    export let muted: boolean = false;
    export let class_ = "";

    let video: HTMLVideoElement;

    onMount(() => {
        video.srcObject = stream;
        video.play();
    });
</script>

<!-- svelte-ignore a11y-media-has-caption -->
<video
    class={class_}
    bind:this={video}
    disablepictureinpicture
    on:contextmenu|preventDefault
    {muted}
>
</video>
