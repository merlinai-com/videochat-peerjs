<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    export let stream: MediaStream;
    export let name: string | undefined = undefined;
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
        on:contextmenu|preventDefault={(ev) => emit("contextmenu", ev)}
        class={class_}
        bind:this={element}
        disablepictureinpicture
        autoplay
        {muted}
    >
    </video>
{:else}
    <div class={class_}>
        <div class="w-full h-full flex-col justify-center align-center">
            <span>{name}</span>
            <span>Audio only</span>
        </div>
        {#if !muted}
            <audio bind:this={element} autoplay></audio>
        {/if}
    </div>
{/if}
