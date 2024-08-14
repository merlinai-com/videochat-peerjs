<script lang="ts">
    import VideoGrid from "$lib/components/VideoGrid.svelte";
    import { createRecordingHandler, createRtcHandler } from "$lib/room";
    import { room } from "$lib/socket";
    import type { RoomSocket, UUID } from "backend/lib/types";
    import { onMount } from "svelte";
    import type { PageData } from "./$types";

    export let data: PageData;

    let localStream: MediaStream | undefined;

    const state = { connected: false, recording: false };
    let videos: Record<UUID, MediaStream> = {};

    const tap = (f1: () => void, f2: () => void) => () => {
        f1();
        f2();
    };

    let handlers = {
        connect: () => {},
        startRecording: () => {},
        stopRecording: () => {},
        cleanup: () => {
            console.log("cleanup");
        },
    };

    async function init(socket: RoomSocket) {
        const ac = new AbortController();
        handlers.cleanup = tap(handlers.cleanup, () => ac.abort());

        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
        } catch (err) {
            console.error("Unable to get user media", err);
            return;
        }

        handlers.cleanup = tap(handlers.cleanup, () => {
            localStream?.getTracks().forEach((track) => track.stop());
        });

        const rtcHandler = createRtcHandler(
            data.iceServers,
            localStream,
            {
                signal(arg) {
                    socket.emit("signal", arg);
                },
                addVideoOutput(id, stream) {
                    videos[id] = stream;
                },
                removeVideoOutput(id) {
                    delete videos[id];
                    videos = videos;
                },
            },
            state
        );

        handlers.cleanup = tap(handlers.cleanup, rtcHandler.cleanup);

        socket.on("connect_to", rtcHandler.connect);
        socket.on("signal", rtcHandler.signal);
        socket.on("disconnect_from", rtcHandler.disconnect);

        handlers.connect = () => {
            state.connected = !state.connected;
            if (state.connected) {
                socket.emit("join_room", data.roomId);
            } else {
                socket.emit("leave_room");
                rtcHandler.disconnectAll();
            }
        };

        const recordingHandler = await createRecordingHandler(
            {
                async upload_start(arg) {
                    const res = await socket.emitWithAck("upload_start", arg);
                    if (res.error !== undefined) throw new Error(res.error);
                    return res;
                },
                upload_chunk(id, data) {
                    socket.emit("upload_chunk", id, data);
                },
                upload_stop(id) {
                    socket.emit("upload_stop", id);
                },
                start() {
                    console.log("recording start");
                    state.recording = true;
                },
                stop() {
                    state.recording = false;
                },
            },
            ac.signal
        );

        handlers.startRecording = () => recordingHandler.start(localStream!);
        handlers.stopRecording = recordingHandler.stop;
        handlers.cleanup = tap(handlers.cleanup, recordingHandler.stop);
    }

    onMount(() => {
        const socket = room();
        handlers.cleanup = tap(handlers.cleanup, () => socket.close());
        init(socket);
        return () => handlers.cleanup();
    });
</script>

<div class="root overflow-hidden grid">
    <div class="flex-row p-3 gap-3">
        <nav>
            <a href="/">Zap</a>
        </nav>

        <div class="flex-row gap-3">
            <p>Room: {data.roomName}</p>
            <button
                on:click={() =>
                    navigator.clipboard.writeText(window.location.href)}
            >
                Copy URL
            </button>
        </div>
    </div>

    <div class="min-h-0">
        <VideoGrid peers={videos} self={localStream} />
    </div>

    <div class="flex-row p-3 gap-3">
        <form on:submit|preventDefault={handlers.connect}>
            <button type="submit">
                {#if state.connected}
                    Disconnect from call
                {:else}
                    Connect to call
                {/if}
            </button>
        </form>
        {#if data.isOwner}
            <button
                disabled={state.recording || !state.connected}
                on:click={handlers.startRecording}
            >
                Start Recording
            </button>
            <button
                disabled={!state.recording || !state.connected}
                on:click={handlers.stopRecording}
            >
                Stop Recording
            </button>
            <button disabled>Save Recording</button>
            <button disabled>Delete Recording</button>
            <button disabled>Save to Server</button>
            <a
                href={`/api/room/${data.roomId.replace("room:", "")}/recording`}
                target="_blank"
            >
                Download recording
            </a>
            <!-- <a class="button disabled" download="recording.webm">
    Download Recording
    </a> -->
        {/if}
    </div>
</div>

<style>
    .root {
        width: 100vw;
        height: 100vh;
        grid-template-rows: max-content 1fr max-content;
    }
</style>
