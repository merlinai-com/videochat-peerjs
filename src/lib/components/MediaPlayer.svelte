<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    export let stream: MediaStream;
    export let muted: boolean = false;
    export let class_ = "";

    const emit = createEventDispatcher<{
        click: MouseEvent;
        contextmenu: MouseEvent;
    }>();

    let element: HTMLVideoElement | HTMLAudioElement;
    $: hasVideo = stream.getVideoTracks().length > 0;

    $: updateSrcObject(stream);
    function updateSrcObject(stream: MediaStream) {
        if (element) element.srcObject = stream;
    }
    onMount(() => updateSrcObject(stream));
</script>

<!-- svelte-ignore a11y-media-has-caption -->
{#if hasVideo}
    <video
        on:click={(ev) => emit("click", ev)}
        on:contextmenu={(ev) => emit("contextmenu", ev)}
        class={class_}
        bind:this={element}
        disablepictureinpicture
        on:contextmenu|preventDefault
        autoplay
        {muted}
    >
    </video>
{:else}
    <div class={class_}>
        <div class="w-full h-full flex-row justify-center align-center">
            Audio only
        </div>
        <audio bind:this={element} autoplay></audio>
    </div>
{/if}
