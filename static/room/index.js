// @ts-check

import { recordingInit } from "./recording.js";
import { elements, roomId, roomInit } from "./utils.js";
import { webrtcInit } from "./webrtc.js";
// @ts-ignore
import { io } from "/socket.io/socket.io.esm.min.js";

function loginInit() {
    const loginUrl = elements.loginButton?.getAttribute("data-login-url");
    elements.loginButton?.addEventListener("click", async () => {
        try {
            // @ts-ignore
            await document.requestStorageAccessFor(new URL(loginUrl).origin);
        } catch (e) {
            console.error("Unable to request storage access:", e);
        } finally {
            window.location.pathname = "/auth/login";
        }
    });
}

async function mediaInit() {
    const localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true },
    });
    elements.localVideo.srcObject = localStream;
    return { localStream };
}

/**
 * Initialise the connect to/disconnect from call button
 * @param {{connected: boolean, name?: string}} state
 * @param {{onconnect?: () => void, ondisconnect?: () => void}} opts
 */
function connectButtonInit(state, opts) {
    elements.connectButton.addEventListener("click", () => {
        if (!state.name) {
            const name = elements.userName.value;
            if (!name) {
                elements.userName.setCustomValidity("Please enter your name");
                elements.userName.form?.reportValidity();
                return;
            }
            elements.userName.setCustomValidity("");
            elements.userName.form?.reportValidity();
            elements.userName.readOnly = true;
            state.name = name;
        }

        state.connected = !state.connected;
        elements.connectButton.innerText = state.connected
            ? "Disconnect from call"
            : "Connect to call";
        if (state.connected) {
            if (opts.onconnect) opts.onconnect();
        } else {
            if (opts.ondisconnect) opts.ondisconnect();
        }
    });
}

/** Initialisation after page load */
async function init() {
    loginInit();
    await roomInit();
    const { localStream } = await mediaInit();

    /** @type {import("socket.io").Socket} */
    const socketio = io();
    // socketio.onAny((...args) => console.log(args));

    /** @type {{connected: boolean, recording: boolean, name?: string }} */
    const state = { connected: false, recording: false };

    const webrtc = webrtcInit(socketio, localStream, state);

    const recording = recordingInit(socketio, localStream, state);

    connectButtonInit(state, {
        onconnect: () => {
            socketio.emit("/room/join", { id: roomId, name: state.name });
        },
        ondisconnect: () => {
            socketio.emit("/room/leave");
            webrtc.disconnectHandler();
            recording.disconnectHandler();
        },
    });
}

document.addEventListener("DOMContentLoaded", init);
