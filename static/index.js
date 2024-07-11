// @ts-check

import { peerInit } from "./peer-connection.js";
import { roomInit } from "./room.js";
import { recordingInit } from "./recording.js";
// @ts-ignore
import { io } from "/socket.io/socket.io.esm.min.js";

/**
 * @param {{roomID: string} | null} roomInfo
 * @param {import("socket.io").Socket} socketio
 * @param {import("./peer-connection.js").PeerHandlers} peerHandlers
 */
async function main(roomInfo, socketio, peerHandlers) {
    socketio.on("/room/peer-join", ({ peerID }) => {
        console.log("/room/peer-join");
        peerHandlers.peerJoin(peerID);
    });
    socketio.on("/room/peer-leave", ({ peerID }) => {
        console.log("/room/peer-leave");
        peerHandlers.peerLeave(peerID);
    });

    if (roomInfo) {
        const { roomID } = roomInfo;
        socketio.emit("/room/join", { roomID });
    }
}

/** Initialisation after page load */
async function init() {
    console.log("init");

    /** @type {import("socket.io").Socket} */
    const socketio = io();

    const roomInfo = await roomInit();
    const { localStream, peerHandlers, peerID } = await peerInit(socketio);
    await recordingInit(socketio, localStream, peerID);

    await main(roomInfo, socketio, peerHandlers);
}

document.addEventListener("DOMContentLoaded", init);
