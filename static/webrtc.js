// @ts-check

import { elements } from "./utils.js";

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
 * @param {string} id
 * @param {MediaStream} stream
 */
function getOrCreateVideo(id, stream) {
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

    pc.conn.addEventListener("track", ({ track, streams }) => {
        console.log("track", { track, streams });
        track.addEventListener("unmute", () => {
            getOrCreateVideo(id, streams[0]);
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
        peerConnections[id]?.conn.close();
        delete peerConnections[id];
    })

    socketio.on("/signal/error", (error) => console.error(error));
}

