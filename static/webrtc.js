// @ts-check
import { elements } from "./utils.js";

/**
 * Get supported video codecs in order of preference
 * @returns {RTCRtpCodecCapability[]}
 */
function getSortedCodecs() {
    /**
    * @param {RTCRtpCodecCapability[]} codecs
    * @param {string[]} preferredOrder
    * @returns {RTCRtpCodecCapability[]}
    */
    function sortByMimeTypes(codecs, preferredOrder) {
        return codecs.sort((a, b) => {
            const indexA = preferredOrder.indexOf(a.mimeType);
            const indexB = preferredOrder.indexOf(b.mimeType);
            const orderA = indexA >= 0 ? indexA : Number.MAX_VALUE;
            const orderB = indexB >= 0 ? indexB : Number.MAX_VALUE;
            return orderA - orderB;
        });
    }

    const supported = RTCRtpReceiver.getCapabilities("video")?.codecs;
    if (!supported) throw new Error("Unable to get supported codecs");
    const preferredCodecs = ["video/VP9", "video/VP8", "video/H264"];
    return sortByMimeTypes(supported, preferredCodecs);
}

let sortedCodecs = getSortedCodecs();

/**
 * @typedef {{
 *  conn: RTCPeerConnection,
 *  polite: boolean
 *  makingOffer: boolean,
 *  ignoreOffer: boolean,
 * }} PeerState
 */

/** @type {RTCConfiguration} */
const rtcConfig = {
    iceServers: [
        { urls: "stun:darley.dev:3478" },
        { urls: "turn:darley.dev:3478", username: "test", credential: "test" },
    ]
};

/**
 * Ensure a MediaStream is being output
 * @param {string} id
 * @param {MediaStream} stream
 */
function ensureVideoOutput(id, stream) {
    if (!document.getElementById(id)) {
        const video = document.createElement("video");
        video.id = id;
        video.srcObject = stream;
        video.autoplay = true;
        elements.remoteVideos.appendChild(video);
    }
}

/**
 * @param {import("socket.io").Socket} socketio
 * @param {string} id
 * @param {MediaStream} localStream
 * @param {Record<string, PeerState>} peerConnections
 * @param {boolean} polite
 */
export async function connectToPeer(socketio, localStream, peerConnections, id, polite) {
    const pc = (peerConnections[id] ??=
        { conn: new RTCPeerConnection(rtcConfig), polite, makingOffer: false, ignoreOffer: false });

    for (const track of localStream.getTracks()) {
        pc.conn.addTrack(track, localStream);
    }

    // try {
    //     pc.conn.getTransceivers().forEach(t => t.setCodecPreferences(sortedCodecs))
    // } catch (err) {
    //     console.error("While setting codec preference:", err);
    // }

    pc.conn.addEventListener("track", ({ track, streams }) => {
        console.log("track", { track, streams });
        track.addEventListener("unmute", () => {
            ensureVideoOutput(id, streams[0]);
        });
    });

    pc.conn.addEventListener("negotiationneeded", async () => {
        try {
            pc.makingOffer = true;
            await pc.conn.setLocalDescription();
            socketio.emit("/signal/desc", { id, desc: pc.conn.localDescription });
        } catch (err) {
            console.error(err);
        } finally {
            pc.makingOffer = false;
        }
    });

    pc.conn.addEventListener("icecandidate", ({ candidate }) => {
        console.debug("icecandidate");
        socketio.emit("/signal/candidate", { id, candidate });
    });
}

/**
 * @param {import("socket.io").Socket} socketio
 * @param {MediaStream} localStream
 */
export function webrtcInit(socketio, localStream) {
    /** @type {Record<string, PeerState>} */
    const peerConnections = {};

    socketio.on("/signal/desc",
        /** @param {{ id: string, desc: RTCSessionDescription }} arg */async ({ id, desc }) => {
            const pc = peerConnections[id];
            if (!pc) {
                console.error(`RTCPeerConnection not initialised for ${id}`);
                return;
            }

            const offerCollision = desc.type === "offer" && (pc.makingOffer || pc.conn.signalingState !== "stable");
            pc.ignoreOffer = offerCollision && !pc.polite;
            if (pc.ignoreOffer) return;

            await pc.conn.setRemoteDescription(desc);
            if (desc.type === "offer") {
                await pc.conn.setLocalDescription();
                socketio.emit("/signal/desc", { id, desc: pc.conn.localDescription });
            }
        });

    socketio.on("/signal/candidate", /** @param {{ id: string, candidate: RTCIceCandidate }} arg */ async ({ id, candidate }) => {
        const pc = peerConnections[id];
        if (!pc) return;
        // if (!pc || pc.ignoreOffer) return;
        try {
            await pc.conn.addIceCandidate(candidate);
        } catch (err) {
            if (!pc.ignoreOffer) console.error(err);
        }
    });

    socketio.on("/room/peer-join", ({ id, polite }) => {
        connectToPeer(socketio, localStream, peerConnections, id, polite);
    });

    socketio.on("/room/peer-leave", ({ id }) => {
        try {
            peerConnections[id]?.conn.close();
        } catch (err) {
            console.error("While closing peer connection:", err);
        } finally {
            document.getElementById(id)?.remove();
            delete peerConnections[id];
        }
    });

    socketio.on("/signal/error", (error) => console.error(error));
}

