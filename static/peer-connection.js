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
                console.log("connectToPeer, reply to request-stream")
                const call = peer.call(otherID, localStream);
                handleCall(connections, call);
            }
        });
        connections[otherID] = conn;
    }
    return connections[otherID];
}


/**
 * @param {import("socket.io").Socket} socketio
 * @returns {Promise<{
 *  localStream: MediaStream,
 *  peerHandlers: PeerHandlers,
 *  peerID: string,
 * }>}
 */
export async function peerInit(socketio) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true } });
    elements.localVideo.srcObject = stream;

    /** @type {import("peerjs").PeerOptions} */
    const peerOptions = {
        host: window.location.hostname,
        port: window.location.port ? parseInt(window.location.port) : 443,
        path: "/peerjs",
        secure: window.location.protocol === "https:",
        config: {
            iceServers: [
                { urls: ['stun:videochat-dev.getzap.co:5349'] },
                { urls: ['turn:videochat-dev.getzap.co:5349'], username: "dev", credential: "dev" },
            ]
        },
        debug: 2,
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
        call.answer(stream);
        handleCall(connections, call);
    });

    peer.on('connection', conn => {
        conn.on('data', data => {
            if (data === 'request-stream') {
                const call = peer.call(conn.peer, stream);
                handleCall(connections, call);
            }
        });
    });

    const peerID = await peerReady;

    return {
        localStream: stream,
        peerHandlers: {
            peerJoin: (otherID) => connectToPeer(peer, connections, stream, otherID),
            peerLeave: (otherID) => { delete connections[otherID] },
        },
        peerID,
    }
}
