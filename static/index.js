// @ts-check

import { peerInit } from "./peer-connection.js";
import { roomInit } from "./room.js";
import { recordingInit } from "./recording.js";
// @ts-ignore
import { io } from "/socket.io/socket.io.esm.min.js";
import { elements } from "./utils.js";

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

async function loginInit() {
    const loginButton = document.getElementById("login-button");
    const loginUrl = loginButton?.getAttribute("data-login-url");
    if (loginButton instanceof HTMLButtonElement) {
        const callback = async () => {
            try {
                // @ts-ignore
                await document.requestStorageAccessFor(new URL(loginUrl).origin);
            } catch (e) {
                console.error("Unable to request storage access:", e);
            } finally {
                window.location.pathname = "/auth/login";
            }
        }
        loginButton.addEventListener("click", callback);
        loginButton.addEventListener("keypress", ({ key }) => {
            if (key === "Enter") callback();
        });
    }
}

async function mediaInit() {
    const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true } });
    elements.localVideo.srcObject = localStream;
    return { localStream };
}

/** Initialisation after page load */
async function init() {
    console.log("init");

    const roomInfo = await roomInit();
    const { localStream } = await mediaInit();

    // Wait for user interaction
    // @ts-ignore
    await new Promise((resolve) => elements.connectButton.addEventListener("click", () => resolve()));
    elements.connectButton.disabled = true;

    /** @type {import("socket.io").Socket} */
    const socketio = io();

    const { peerHandlers, peerID } = await peerInit(socketio, localStream);
    await recordingInit(socketio, localStream, peerID);

    console.log("here ahfsd");

    await main(roomInfo, socketio, peerHandlers);
    await loginInit();
}

document.addEventListener("DOMContentLoaded", init);
