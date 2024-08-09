<script lang="ts">
    import { fetchJson } from "$lib";
    import { io, type Socket } from "$lib/socket";
    import type {
        ClientToServerEvents,
        ServerToClientEvents,
        UUID,
    } from "backend/types";
    import { onMount } from "svelte";
    import type { PageData } from "./$types";
    import { createRecordingHandler, createRtcHandler } from "$lib/room";
    import Video from "$lib/components/Video.svelte";

    export let data: PageData;
    let userName = data.user?.name ?? "";

    let localStream: MediaStream | undefined;

    const state = { connected: false, recording: false };
    let videos: Record<UUID, MediaStream> = {};

    let handlers = {
        connect: () => {},
        startRecording: () => {},
        stopRecording: () => {},
    };

    async function init(socket: Socket) {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
        });

        const { id } = await fetchJson<{ id: UUID }>(
            `/api/room/${data.roomId}/join`,
            {
                method: "POST",
            }
        );

        await socket.emitWithAck("set_id", { id });

        // Uncomment the next line to log all messages
        // socket.onAny(console.log);

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

        socket.on("connect_to", rtcHandler.connect);
        socket.on("signal", rtcHandler.signal);
        socket.on("disconnect_from", rtcHandler.disconnect);

        handlers.connect = () => {
            state.connected = !state.connected;
            if (state.connected) {
                socket.emit("join_room", {
                    id: data.roomId,
                    name: userName,
                });
            } else {
                socket.emit("leave_room");
                rtcHandler.disconnectAll();
            }
        };

        const recordingHandler = await createRecordingHandler({
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
        });

        handlers.startRecording = () => recordingHandler.start(localStream!);
        handlers.stopRecording = recordingHandler.stop;
    }

    onMount(() => {
        const socket = io();
        init(socket);
        return () => socket.close();
    });
</script>

<nav>
    <a href="/">Zap</a>
</nav>

{#if data.user}
    <div>
        Logged in as {data.user.name} ({data.user.email})
        <a href={data.authURLs.logout}>Log out</a>
    </div>
{:else}
    <div>
        <button
            role="link"
            id="login-button"
            data-login-url={data.authURLs.login}
        >
            Log in
        </button>
    </div>
{/if}

<div>
    <p>Room: {data.roomName}</p>
    <button
        on:click={() => navigator.clipboard.writeText(window.location.href)}
    >
        Copy URL
    </button>
</div>

<div>
    <form on:submit|preventDefault={handlers.connect}>
        {#if !data.user}
            <label for="user-name">Name:</label>
            <input
                id="user-name"
                required
                placeholder="Name"
                bind:value={userName}
            />
        {/if}
        <button type="submit">
            {#if state.connected}
                Disconnect from call
            {:else}
                Connect to call
            {/if}
        </button>
    </form>
</div>

<div id="video" class="hidden">
    <div>
        {#each Object.entries(videos) as [id, stream] (id)}
            <Video {stream} />
        {/each}
    </div>
    {#if localStream}
        <Video stream={localStream} muted />
    {/if}
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
        <a href={`/api/room/${data.roomId}/recording`} target="_blank">
            Download recording
        </a>
        <!-- <a class="button disabled" download="recording.webm">
        Download Recording
    </a> -->
    {/if}
</div>
