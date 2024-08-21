import type { RoomSocket } from "backend/lib/types";
import "webrtc-adapter";

interface PeerState {
    conn: RTCPeerConnection;
    polite: boolean;
    makingOffer: boolean;
    ignoreOffer: boolean;
    settingRemoteAnswer: boolean;
    senders: Map<MediaStreamTrack, RTCRtpSender>;
}

const mediaTypes = ["video", "audio", "screen"] as const;
export type MediaType = (typeof mediaTypes)[number];
export type MediaRecord = { local?: MediaStream; screen?: MediaStream };

export interface RtcHandler {
    disconnectAll: () => void;
    removeStream: (stream: MediaStream) => void;
    addStream: (stream: MediaStream) => void;
}

export function createRtcHandler(
    iceServers: RTCIceServer[],
    socket: RoomSocket,
    streams: MediaRecord,
    state: { connected: boolean },
    callbacks: {
        addStream: (id: string, stream: MediaStream) => void;
        removeStream: (id: string, stream: MediaStream) => void;
        removePeer: (id: string) => void;
    }
): RtcHandler {
    const peers: Record<string, PeerState> = {};
    const rtcConfig: RTCConfiguration = { iceServers };

    window.Zap.webrtcStats = async () => {
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

    socket.on("connect_to", ({ id, polite }) => {
        if (!state.connected) return;

        // Initialise the peer connection
        const pc = (peers[id] ??= {
            conn: new RTCPeerConnection(rtcConfig),
            polite,
            makingOffer: false,
            ignoreOffer: false,
            settingRemoteAnswer: false,
            senders: new Map(),
        });

        pc.conn.addEventListener("track", ({ track, streams, receiver }) => {
            for (const stream of streams) {
                stream.addEventListener("removetrack", () => {
                    if (!stream.active) callbacks.removeStream(id, stream);
                });
            }
            track.addEventListener("unmute", () => {
                for (const stream of streams) {
                    callbacks.addStream(id, stream);
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

    const disconnect = ({ id }: { id: string }) => {
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
            for (const id in peers) disconnect({ id });
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

        removeStream(stream) {
            for (const track of stream.getTracks()) {
                for (const peer of Object.values(peers)) {
                    const sender = peer.senders.get(track);
                    if (sender) peer.conn.removeTrack(sender);
                    peer.senders.delete(track);
                }
                track.stop();
            }
        },
    };

    return handler;
}
