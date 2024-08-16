<script lang="ts">
    import Message from "$lib/components/Message.svelte";
    import VideoGrid from "$lib/components/VideoGrid.svelte";
    import VideoScreenShare from "$lib/components/VideoScreenShare.svelte";
    import { createRecordingHandler, createRtcHandler } from "$lib/room";
    import type { MediaType, RtcHandler } from "$lib/room/webrtc";
    import { room } from "$lib/socket";
    import type { RoomSocket } from "backend/lib/types";
    import { onMount } from "svelte";
    import type { PageData } from "./$types";
    import { debug } from "$lib";
    import Login from "$lib/components/Login.svelte";

    export let data: PageData;

    const streams: { local?: MediaStream; screen?: MediaStream } = {};
    const enabledMedia = { video: false, audio: false, screen: false };

    /** Show group messages */
    let showMessages = false;

    /** The id of the current screen share*/
    let screenShareId: string | undefined;

    const state = { connected: false, recording: false };
    let videos: Record<string, Set<MediaStream>> = {};

    const tap = (f1: () => void, f2: () => void) => () => {
        f1();
        f2();
    };

    let handlers = {
        connect: () => {},
        startRecording: () => {},
        stopRecording: () => {},
        cleanup: () => {
            if (debug()) console.log("cleanup");
        },
        toggleMedia: (_type: MediaType) => {},
    };

    async function handleMediaUpdate(
        socket: RoomSocket,
        rtcHandler: RtcHandler,
        type: keyof typeof streams
    ) {
        switch (type) {
            case "local":
                if (streams.local) {
                    rtcHandler.removeStream(streams.local);
                    streams.local = undefined;
                }

                if (enabledMedia.video || enabledMedia.audio) {
                    try {
                        streams.local =
                            await window.navigator.mediaDevices.getUserMedia({
                                video: enabledMedia.video,
                                audio: enabledMedia.audio,
                            });
                    } catch (error) {
                        console.error("Unable to get user media:", error);
                        return;
                    }

                    rtcHandler.addStream(streams.local);
                }

                break;

            case "screen":
                if (streams.screen) {
                    rtcHandler.removeStream(streams.screen);
                    streams.screen = undefined;
                    screenShareId = undefined;
                }

                if (enabledMedia.screen) {
                    try {
                        streams.screen =
                            await window.navigator.mediaDevices.getDisplayMedia(
                                {
                                    video: true,
                                    audio: true,
                                }
                            );

                        for (const track of streams.screen.getTracks()) {
                            // Add listener for the user ending the stream
                            track.addEventListener("ended", () => {
                                if (streams.screen) {
                                    rtcHandler.removeStream(streams.screen);
                                    streams.screen = undefined;
                                    socket.emit("screen_share", {});
                                }
                            });
                        }
                    } catch (error) {
                        console.error("Unable to get display media:", error);
                        return;
                    }

                    socket.emit("screen_share", {
                        streamId: streams.screen.id,
                    });
                    screenShareId = streams.screen.id;

                    rtcHandler.addStream(streams.screen);
                } else {
                    socket.emit("screen_share", {});
                }

                break;
        }
    }

    async function toggleMedia(
        socket: RoomSocket,
        rtcHandler: RtcHandler,
        type: MediaType
    ) {
        enabledMedia[type] = !enabledMedia[type];
        handleMediaUpdate(
            socket,
            rtcHandler,
            type == "screen" ? "screen" : "local"
        );
    }

    /** Initialise handlers for user actions and socket events */
    async function init(socket: RoomSocket) {
        const ac = new AbortController();
        handlers.cleanup = tap(handlers.cleanup, () => ac.abort());

        handlers.cleanup = tap(handlers.cleanup, () => {
            for (const stream of Object.values(streams)) {
                if (stream) {
                    for (const track of stream.getTracks()) track.stop();
                }
            }
        });

        socket.on("screen_share", (arg) => {
            if (arg && streams.screen) handlers.toggleMedia("screen");
            screenShareId = arg?.streamId;
        });

        const rtcHandler = createRtcHandler(
            data.iceServers,
            socket,
            streams,
            {
                addStream(id, stream) {
                    videos[id] ??= new Set();
                    videos[id].add(stream);
                },
                removeStream(id, stream) {
                    videos[id]?.delete(stream);
                },
                removePeer(id) {
                    delete videos[id];
                    videos = videos;
                },
            },
            state
        );

        handlers.cleanup = tap(handlers.cleanup, rtcHandler.disconnectAll);
        handlers.toggleMedia = (type) => toggleMedia(socket, rtcHandler, type);

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

        handlers.startRecording = () => recordingHandler.start(streams);
        handlers.stopRecording = recordingHandler.stop;
        handlers.cleanup = tap(handlers.cleanup, recordingHandler.stop);

        return { rtcHandler, recordingHandler };
    }

    onMount(() => {
        const socket = room();
        handlers.cleanup = tap(handlers.cleanup, () => socket.close());
        init(socket).then(({ rtcHandler }) => {
            enabledMedia.audio = true;
            enabledMedia.video = true;
            handleMediaUpdate(socket, rtcHandler, "local");
        });

        return () => handlers.cleanup();
    });
</script>

<div class="root overflow-hidden grid gap-3 p-3">
    <div class="flex-row gap-3 span-cols-2">
        <nav>
            <a href="/">Zap</a>
        </nav>

        <p>Room: {data.roomName}</p>
        <button
            on:click={() => navigator.clipboard.writeText(window.location.href)}
        >
            Copy URL
        </button>
        <button on:click={handlers.connect}>
            {#if state.connected}
                Disconnect from call
            {:else}
                Connect to call
            {/if}
        </button>
        <button on:click={() => (showMessages = !showMessages)}>
            {#if showMessages}
                Hide messages
            {:else}
                Show messages
            {/if}
        </button>
        <button on:click={() => handlers.toggleMedia("screen")}>
            {#if streams.screen}
                Stop sharing screen
            {:else}
                Share screen
            {/if}
        </button>
        {#if state.recording}
            Recording
        {/if}

        <Login {data} />
    </div>

    <div class={showMessages ? "min-h-0" : "min-h-0 span-cols-2"}>
        {#if screenShareId}
            <VideoScreenShare peers={videos} {streams} {screenShareId} />
        {:else}
            <VideoGrid peers={videos} {streams} />
        {/if}
    </div>

    <div class={showMessages ? "flex-col min-h-0 justify-end" : "hidden"}>
        <Message user={data.user} selectedGroup={data.group} />
    </div>

    {#if data.isOwner}
        <div class="flex-row gap-3 span-cols-2">
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
        </div>
    {/if}
</div>

<style>
    .root {
        width: 100vw;
        height: 100vh;
        grid-template-columns: 3.5fr minmax(16rem, 1fr);
        grid-template-rows: max-content 1fr max-content;
    }
</style>
