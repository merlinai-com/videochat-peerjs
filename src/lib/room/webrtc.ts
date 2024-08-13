import type { UUID } from "backend/lib/types";

interface PeerState {
    conn: RTCPeerConnection;
    polite: boolean;
    makingOffer: boolean;
    ignoreOffer: boolean;
    settingRemoteAnswer: boolean;
}

export function createRtcHandler(
    iceServers: RTCIceServer[],
    localStream: MediaStream | undefined,
    callbacks: {
        signal: (arg: {
            to: UUID;
            desc?: RTCSessionDescription | null;
            candidate?: RTCIceCandidate | null;
        }) => void;
        addVideoOutput: (id: UUID, stream: MediaStream) => void;
        removeVideoOutput: (id: UUID) => void;
    },
    state: { connected: boolean }
): {
    connect: (arg: { id: UUID; polite: boolean }) => void;
    disconnect: (arg: { id: UUID }) => void;
    disconnectAll: () => void;
    signal: (arg: {
        from: UUID;
        desc?: RTCSessionDescription | null;
        candidate?: RTCIceCandidate | null;
    }) => Promise<void>;
    cleanup: () => void;
} {
    const peers: Record<string, PeerState> = {};
    const rtcConfig: RTCConfiguration = { iceServers };

    const disconnect = ({ id }: { id: UUID }) => {
        try {
            peers[id]?.conn.close();
        } catch (err) {
            console.error("While closing peer connection:", err);
        } finally {
            callbacks.removeVideoOutput(id);
            delete peers[id];
        }
    };

    return {
        connect({ id, polite }) {
            if (!localStream) return;

            const pc = (peers[id] ??= {
                conn: new RTCPeerConnection(rtcConfig),
                polite,
                makingOffer: false,
                ignoreOffer: false,
                settingRemoteAnswer: false,
            });

            for (const track of localStream.getTracks()) {
                pc.conn.addTrack(track, localStream);
            }

            pc.conn.addEventListener("track", ({ track, streams }) => {
                console.log("track", { track, streams });
                track.addEventListener("unmute", () => {
                    callbacks.addVideoOutput(id, streams[0]);
                });
            });

            pc.conn.addEventListener("negotiationneeded", async () => {
                try {
                    pc.makingOffer = true;
                    await pc.conn.setLocalDescription();
                    callbacks.signal({
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
                console.debug("icecandidate");
                callbacks.signal({ to: id, candidate });
            });
        },

        disconnect,

        disconnectAll() {
            for (const id in peers) disconnect({ id: id as UUID });
        },

        async signal({ from, desc, candidate }) {
            if (!state.connected) return;

            const pc = peers[from];
            if (!pc) {
                console.error(`RTCPeerConnection not initialised for ${from}`);
                return;
            }

            if (desc) {
                const readyForOffer =
                    !pc.makingOffer &&
                    (pc.conn.signalingState === "stable" ||
                        pc.settingRemoteAnswer);
                const offerCollision = desc.type === "offer" && !readyForOffer;

                pc.ignoreOffer = offerCollision && !pc.polite;
                if (pc.ignoreOffer) return;

                pc.settingRemoteAnswer = desc.type === "answer";
                await pc.conn.setRemoteDescription(desc);
                pc.settingRemoteAnswer = false;
                if (desc.type === "offer") {
                    await pc.conn.setLocalDescription();
                    callbacks.signal({
                        to: from,
                        desc: pc.conn.localDescription,
                    });
                }
            } else if (candidate) {
                try {
                    await pc.conn.addIceCandidate(candidate);
                } catch (err) {
                    if (!pc.ignoreOffer) console.error(err);
                }
            }
        },

        cleanup() {
            for (const id in peers) disconnect({ id: id as UUID });
            localStream = undefined;
        },
    };
}
