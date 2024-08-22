import type { JsonSafe, UserId } from "backend/lib/database";
import type { RoomSocket, SignalId } from "backend/lib/types";
import "webrtc-adapter";

interface PeerState {
    conn: RTCPeerConnection;
    polite: boolean;
    makingOffer: boolean;
    ignoreOffer: boolean;
    settingRemoteAnswer: boolean;
    senders: Map<MediaStreamTrack, RTCRtpSender>;
    user?: JsonSafe<UserId>;
}

const mediaTypes = ["video", "audio", "screen"] as const;
export type MediaType = (typeof mediaTypes)[number];
export type MediaRecord = { local?: MediaStream; screen?: MediaStream };

export interface RtcHandler {
    disconnectAll: () => void;
    removeStream: (stream: MediaStream) => void;
    removeTrack: (track: MediaStreamTrack) => void;
    addStream: (stream: MediaStream) => void;
}

export function createRtcHandler(
    iceServers: RTCIceServer[],
    socket: RoomSocket,
    streams: MediaRecord,
    state: { connected: boolean },
    callbacks: {
        addPeer: (id: SignalId, user?: JsonSafe<UserId>) => void;
        addStream: (id: SignalId, stream: MediaStream) => void;
        removeStream: (id: SignalId, stream: MediaStream) => void;
        removePeer: (id: SignalId) => void;
    }
): RtcHandler {
    const peers: Record<string, PeerState> = {};
    const rtcConfig: RTCConfiguration = { iceServers };

    window.Zap.debug.webrtcStats = async () => {
        const allStats = await Promise.all(
            Object.entries(peers).map(async ([id, peer]) => ({
                id,
                stats: await peer.conn.getStats(),
            }))
        );

        console.group("WebRTC stats");
        for (const { id, stats } of allStats) {
            console.groupCollapsed(id);
            stats.forEach(console.log);
            console.groupEnd();
        }
        console.groupEnd();
    };

    socket.on("signal", async ({ from, desc, candidate }) => {
        if (!state.connected) return;

        const pc = peers[from];
        if (!pc) {
            console.error(`RTCPeerConnection not initialised for ${from}`);
            return;
        }

        if (desc) {
            const readyForOffer =
                !pc.makingOffer &&
                (pc.conn.signalingState === "stable" || pc.settingRemoteAnswer);
            const offerCollision = desc.type === "offer" && !readyForOffer;

            pc.ignoreOffer = offerCollision && !pc.polite;
            if (pc.ignoreOffer) return;

            pc.settingRemoteAnswer = desc.type === "answer";
            await pc.conn.setRemoteDescription(desc);
            pc.settingRemoteAnswer = false;
            if (desc.type === "offer") {
                await pc.conn.setLocalDescription();
                socket.emit("signal", {
                    to: from,
                    desc: pc.conn.localDescription,
                });
            }
        }
        if (candidate) {
            try {
                await pc.conn.addIceCandidate(candidate);
            } catch (err) {
                if (!pc.ignoreOffer) console.error(err);
            }
        }
    });

    socket.on("connect_to", ({ id, polite, user }) => {
        if (!state.connected) return;

        callbacks.addPeer(id, user);

        // Initialise the peer connection
        const pc = (peers[id] ??= {
            conn: new RTCPeerConnection(rtcConfig),
            polite,
            makingOffer: false,
            ignoreOffer: false,
            settingRemoteAnswer: false,
            senders: new Map(),
            user,
        });

        function onRemoveTrack(this: MediaStream, ev: MediaStreamTrackEvent) {
            if (this.active) callbacks.addStream(id, this);
            else callbacks.removeStream(id, this);
        }

        pc.conn.addEventListener("track", ({ track, streams }) => {
            for (const stream of streams) {
                stream.addEventListener("removetrack", onRemoveTrack);
            }
            track.addEventListener("unmute", () => {
                for (const stream of streams) {
                    callbacks.addStream(id, stream);
                }
            });
            track.addEventListener("ended", () => {
                console.log(`${track.kind} track ended`);
                for (const stream of streams) {
                    if (!stream.active) callbacks.removeStream(id, stream);
                }
            });
        });

        pc.conn.addEventListener("negotiationneeded", async () => {
            try {
                pc.makingOffer = true;
                await pc.conn.setLocalDescription();
                socket.emit("signal", {
                    to: id,
                    desc: pc.conn.localDescription,
                });
            } catch (err) {
                console.error(err);
            } finally {
                pc.makingOffer = false;
            }
        });

        pc.conn.addEventListener("icecandidate", ({ candidate }) => {
            socket.emit("signal", { to: id, candidate });
        });

        if (streams.local) handler.addStream(streams.local);
        if (streams.screen) {
            socket.emit("screen_share", { streamId: streams.screen.id });
            handler.addStream(streams.screen);
        }
    });

    const disconnect = ({ id }: { id: SignalId }) => {
        try {
            peers[id]?.conn.close();
        } catch (err) {
            console.error("While closing peer connection:", err);
        } finally {
            callbacks.removePeer(id);
            delete peers[id];
        }
    };

    socket.on("disconnect_from", disconnect);

    const handler: RtcHandler = {
        disconnectAll() {
            for (const id in peers) disconnect({ id: id as SignalId });
        },

        addStream(stream) {
            for (const peer of Object.values(peers)) {
                for (const track of stream.getTracks()) {
                    if (!peer.senders.has(track)) {
                        const sender = peer.conn.addTrack(track, stream);
                        peer.senders.set(track, sender);
                    }
                }
            }
        },

        removeTrack(track) {
            for (const peer of Object.values(peers)) {
                const sender = peer.senders.get(track);
                if (sender) peer.conn.removeTrack(sender);
                peer.senders.delete(track);
            }
            track.stop();
        },

        removeStream(stream) {
            for (const track of stream.getTracks()) {
                handler.removeTrack(track);
            }
        },
    };

    return handler;
}
