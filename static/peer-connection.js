// @ts-check
// peerjs-frontend/js/peer-connection.js   jd & chatgpt4o  8 july 2024

import { Peer } from "peerjs";
import { elements } from "./utils.js";

/**
 * @typedef {Record<string, import("peerjs").DataConnection | import("peerjs").MediaConnection>} Connections
 * @typedef {Record<"peerJoin" | "peerLeave", (otherID: string) => void>} PeerHandlers
 */

/**
 * @param {Connections} connections
 * @param {string} otherID
 */
function removePeer(connections, otherID) {
    const video = document.getElementById(otherID);
    if (video) {
        video.remove();
    }
    delete connections[otherID];

}

/**
 * @param {Connections} connections
 * @param {import("peerjs").MediaConnection} call
 */
function handleCall(connections, call) {
    call.on('stream', remoteStream => {
        console.debug("stream");
        remoteStream.addEventListener("addtrack", () => console.debug("addtrack"));
        if (!document.getElementById(call.peer)) {
            const video = document.createElement('video');
            video.id = call.peer;
            video.srcObject = remoteStream;
            video.autoplay = true;
            elements.remoteVideos.appendChild(video);
            connections[call.peer] = call;
        }
    });

    call.on('close', () => {
        removePeer(connections, call.peer);
    });
}


/**
 * @param {Peer} peer
 * @param {Connections} connections
 * @param {MediaStream} localStream
 * @param {string} otherID
 */
function connectToPeer(peer, connections, localStream, otherID) {
    if (!connections[otherID]) {
        const conn = peer.connect(otherID);
        conn.on('open', () => {
            conn.send('request-stream');
        });
        conn.on('data', data => {
            if (data === 'request-stream') {
                console.debug("connectToPeer, reply to request-stream")
                const call = peer.call(otherID, localStream);
                handleCall(connections, call);
            }
        });
        connections[otherID] = conn;
    }
    return connections[otherID];
}

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
/**
 * Get supported video codecs in order of preference
 * @returns {RTCRtpCodecCapability[]}
 */
function getSortedCodecs() {
    const supported = RTCRtpReceiver.getCapabilities("video")?.codecs;
    if (!supported) throw new Error("Unable to get supported codecs");
    const preferredCodecs = ["video/VP9", "video/VP8", "video/H264"];
    return sortByMimeTypes(supported, preferredCodecs);
}

/**
 * @param {import("socket.io").Socket} socketio
 * @param {MediaStream} localStream
 * @returns {Promise<{
 *  peerHandlers: PeerHandlers,
 *  peerID: string,
 * }>}
 */
export async function peerInit(socketio, localStream) {
    const sortedCodecs = getSortedCodecs();

    /** @type {import("peerjs").PeerOptions} */
    const peerOptions = {
        host: window.location.hostname,
        port: window.location.port ? parseInt(window.location.port) : 443,
        path: "/peerjs",
        secure: window.location.protocol === "https:",
        config: {
            iceServers: [
                { urls: ['stun:videochat-dev.getzap.co:5349'] },
                { urls: ['turn:openrelay.metered.ca:80'], username: "openrelayproject", credential: "openrelayproject" },
            ]
        },
        debug: 3,
    }

    const peer = new Peer(peerOptions);

    /** All connections to other peers @type {Record<string, any>} */
    const connections = {};

    const peerReady = new Promise((resolve) => {
        peer.on('open', async peerID => {
            console.log('My peer ID is: ' + peerID);
            socketio.emit("/register", peerID);
            resolve({ peerID })
        });
    });

    peer.on("error", (error) => {
        console.error("PeerJS error:", error);
    });

    peer.on('disconnected', () => {
        console.log('Disconnected from the signalling server');
    });

    peer.on('close', () => {
        console.log('Connection to PeerJS server closed');
    });

    peer.on('call', call => {
        call.answer(localStream);
        handleCall(connections, call);
    });

    peer.on('connection', conn => {
        conn.peerConnection.getTransceivers().forEach(t => t.setCodecPreferences(sortedCodecs));
        console.debug("connection", { conn });
        conn.on('data', data => {
            console.debug("data");
            if (data === 'request-stream') {
                const call = peer.call(conn.peer, localStream);
                handleCall(connections, call);
            }
        });
    });

    console.log("before ready");
    const { peerID } = await peerReady;

    return {
        peerHandlers: {
            peerJoin: (otherID) => connectToPeer(peer, connections, localStream, otherID),
            peerLeave: (otherID) => { delete connections[otherID] },
        },
        peerID,
    }
}
