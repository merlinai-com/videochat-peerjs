<script lang="ts">
    import GroupView from "$lib/components/GroupView.svelte";
    import Login from "$lib/components/Login.svelte";
    import VideoGrid from "$lib/components/VideoGrid.svelte";
    import VideoGridSelected from "$lib/components/VideoGridSelected.svelte";
    import { createRecordingHandler, createRtcHandler } from "$lib/room";
    import type { MediaType, RtcHandler } from "$lib/room/webrtc";
    import { message, room } from "$lib/socket";
    import {
        createStore,
        createTimeStore,
        createUserNamesStore,
    } from "$lib/stores";
    import type { JsonSafe, Recording, UserId } from "backend/lib/database";
    import type { RoomSocket } from "backend/lib/types";
    import { formatTime } from "backend/lib/utils";
    import { format } from "date-fns/format";
    import { onMount } from "svelte";
    import type { PageData } from "./$types";
    import type { Writable } from "svelte/store";
    import AllowRecordingDialog from "$lib/components/AllowRecordingDialog.svelte";

    const now = createTimeStore(() => new Date(), {
        interval: 100,
    });

    export let data: PageData;

    /** Whether the user allows recordings */
    let allowRecording: Writable<boolean>;
    let requestAllowRecording: () => Promise<void>;

    const streams: { local?: MediaStream; screen?: MediaStream } = {};
    const enabledMedia = { video: false, audio: false, screen: false };

    /** Show group messages */
    let showMessages = true;

    /** The id of the current screen share*/
    let selectedStream: MediaStream | undefined;
    $: ensureSelectedStreamExists(videos);
    function ensureSelectedStreamExists(videos: MediaStream[]) {
        if (selectedStream && !videos.includes(selectedStream))
            selectedStream = undefined;
    }

    const state = {
        /** Is the user currently connected to the call*/
        connected: false,
        /** Is there currently a recording*/
        recording: false,
    };

    /** The start time of the current recording */
    let recordingStartTime = new Date();

    /** A map from peer IDs to media streams */
    let peers: Record<string, Set<MediaStream>> = {};
    $: videos = [
        ...Object.values(peers).flatMap((streams) => [...streams]),
        ...Object.values(streams).filter((stream) => stream),
    ];

    /** The list of users currently in the room */
    let users: JsonSafe<{ id: UserId; name?: string }>[] = [];

    /** The list of recordings */
    let recordings: JsonSafe<Omit<Recording, "file_id">>[] = [];

    let userNameStore = createUserNamesStore();

    const tap = (f1: () => void, f2: () => void) => () => {
        f1();
        f2();
    };

    let handlers = {
        connect: () => {},
        startRecording: () => {},
        stopRecording: () => {},
        cleanup: () => {},
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
                    selectedStream = undefined;
                }

                if (enabledMedia.screen) {
                    try {
                        streams.screen =
                            await window.navigator.mediaDevices.getDisplayMedia(
                                {
                                    video: true,
                                    audio: true,
                                    // @ts-ignore
                                    preferCurrentTab: false,
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
                    selectedStream = streams.screen;

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
            // Disable screen share if another user starts
            if (arg && streams.screen) handlers.toggleMedia("screen");
            selectedStream = Object.values(peers)
                .flatMap((streams) => [...streams])
                .find((stream) => stream.id == arg.streamId);
        });

        socket.on("users", (us) => (users = us));
        socket.on("recordings", (rs) => {
            recordings = rs;
            userNameStore.request(recordings.map((r) => r.user));
        });

        const rtcHandler = createRtcHandler(
            data.iceServers,
            socket,
            streams,
            state,
            {
                addStream(id, stream) {
                    peers[id] ??= new Set();
                    peers[id].add(stream);
                },
                removeStream(id, stream) {
                    peers[id]?.delete(stream);
                },
                removePeer(id) {
                    delete peers[id];
                    peers = peers;
                },
            }
        );

        handlers.cleanup = tap(handlers.cleanup, rtcHandler.disconnectAll);
        handlers.toggleMedia = (type) => toggleMedia(socket, rtcHandler, type);

        handlers.connect = () => {
            state.connected = !state.connected;
            if (state.connected) {
                socket.emit("connect_to");
            } else {
                socket.emit("disconnect_from");
                rtcHandler.disconnectAll();
            }
        };

        const recordingHandler = await createRecordingHandler(
            socket,
            streams,
            ac.signal,
            state,
            {
                afterStart() {
                    state.recording = true;
                    recordingStartTime = new Date();
                    now.resume();
                },
                afterStop() {
                    state.recording = false;
                    now.pause();
                },
            }
        );

        socket.on("recording", async ({ action }) => {
            if (action === "start") {
                if (!$allowRecording) {
                    await requestAllowRecording();
                }
                recordingHandler.start(true);
            } else {
                recordingHandler.stop(false);
            }
        });

        handlers.startRecording = () => {
            $allowRecording = true;
            recordingHandler.start(true);
        };
        handlers.stopRecording = () => recordingHandler.stop(true);
        handlers.cleanup = tap(handlers.cleanup, () =>
            recordingHandler.stop(data.isOwner)
        );

        return { rtcHandler, recordingHandler };
    }

    onMount(() => {
        now.pause();

        const socket = room();
        handlers.cleanup = tap(handlers.cleanup, () => socket.close());

        userNameStore = createUserNamesStore(message());
        allowRecording = createStore(sessionStorage, {
            init: data.user?.allow_recording ?? false,
            version: 1,
            key: "allowRecording",
        });

        init(socket).then(({ rtcHandler }) => {
            enabledMedia.audio = true;
            enabledMedia.video = true;
            handleMediaUpdate(socket, rtcHandler, "local");
        });

        socket.emit("join_room", data.roomId);
        return () => handlers.cleanup();
    });
</script>

<AllowRecordingDialog
    bind:request={requestAllowRecording}
    on:allow={() => ($allowRecording = true)}
    on:deny={() => ($allowRecording = false)}
/>

<div class="root overflow-hidden grid gap-3 p-3">
    <div class="flex-row gap-3 span-cols-2 flex-wrap">
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
        <button on:click={() => handlers.toggleMedia("video")}>
            {#if enabledMedia.video}
                Mute video
            {:else}
                Unmute video
            {/if}
        </button>
        <button on:click={() => handlers.toggleMedia("audio")}>
            {#if enabledMedia.audio}
                Mute mic
            {:else}
                Unmute mic
            {/if}
        </button>
        {#if state.recording}
            <span style="color: red;">
                Recording ({formatTime({
                    start: recordingStartTime,
                    end: $now,
                })})
            </span>
        {/if}

        <Login {data} />

        <div class="flex-row gap-3">
            <h4>Users:</h4>
            <ul class="flex-row gap-3">
                {#each users as user, idx}
                    {@const name =
                        user.id == data.user?.id ? "Me" : user.name ?? "Guest"}
                    <li>
                        {idx == users.length - 1 ? name : name + ","}
                    </li>
                {/each}
            </ul>
        </div>
    </div>

    <div class={showMessages ? "min-h-0" : "min-h-0 span-cols-2"}>
        {#if selectedStream}
            <VideoGridSelected
                {videos}
                {streams}
                {selectedStream}
                on:deselect={() => (selectedStream = undefined)}
                on:select={(ev) => (selectedStream = ev.detail)}
            />
        {:else}
            <VideoGrid
                {videos}
                {streams}
                on:select={(ev) => (selectedStream = ev.detail)}
            />
        {/if}
    </div>

    <div class={showMessages ? "flex-col min-h-0 justify-end" : "hidden"}>
        <GroupView user={data.user} selectedGroup={data.group} />
    </div>

    {#if data.isOwner}
        <!-- Recordings -->
        <div class="flex-row flex-wrap gap-3 span-cols-2">
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
            {#if recordings.length > 0}
                <a
                    class="button"
                    href="/api/room/{data.roomId.replace(
                        'room:',
                        ''
                    )}/recording"
                    target="_blank"
                >
                    Download recording
                </a>
            {:else}
                <span class="button" aria-disabled="true">
                    Download recording
                </span>
            {/if}
            {#if recordings.length > 0}
                <div class="flex-row gap-3 flex-wrap">
                    <h4>Recordings</h4>
                    <ul class="flex-row gap-3 flex-wrap">
                        {#each recordings as recording}
                            <li>
                                {$userNameStore[recording.user] ?? "Unknown"}
                                (Start: {format(
                                    recording.startTime,
                                    "HH:mm:ss"
                                )}, Duration: {formatTime({
                                    start: recording.startTime,
                                    end: recording.endTime ?? $now,
                                })})
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
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
