// @ts-check

// import { peerInit } from "./peer-connection.js";
import { roomInit } from "./room.js";
import { recordingInit } from "./recording.js";
// @ts-ignore
import { io } from "/socket.io/socket.io.esm.min.js";
import { elements, roomId } from "./utils.js";
import { webrtcInit } from "./webrtc.js";

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
    await roomInit();
    const { localStream } = await mediaInit();

    // Wait for user interaction
    // @ts-ignore
    await new Promise((resolve) => elements.connectButton.addEventListener("click", () => resolve()));
    elements.connectButton.disabled = true;

    /** @type {import("socket.io").Socket} */
    const socketio = io();

    webrtcInit(socketio, localStream);
    socketio.emit("/room/join", { roomId });
    await recordingInit(socketio, localStream);

    console.log("here ahfsd");

    socketio.on("/room/peer-join", (peer) => console.log("peer-join", peer));
    socketio.on("/room/peer-leave", (peer) => console.log("peer-leave", peer));
    // await main(roomInfo, socketio, peerHandlers);
    await loginInit();
}

document.addEventListener("DOMContentLoaded", init);
