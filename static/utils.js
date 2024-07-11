// @ts-check

// @ts-ignore
import { io } from "/socket.io/socket.io.esm.min.js";

/** The current room ID @type {string | null} */
export const roomID = new URL(window.location.href).searchParams.get("room");
/** The current peer ID @type {{peerID?: string}} */
export let peerID = {};

/**
 * Get information about a room
 * @param {string} roomID
 * @param {string} userID
 * @returns {Promise<{name: string, peers: string[]} | null>}
 */
export async function connectToRoom(roomID, userID) {
    const res = await fetch(`/room/connect/${roomID}/${userID}`, { method: "POST" });
    if (res.status === 404) {
        // Room not found
        console.warn(`Room ${roomID} not found`);
        return null;
    } else if (!res.ok) {
        console.error(`Unexpected error: ${res.status} ${res.statusText}`);
        console.debug(res);
        return null;
    } else {
        return await res.json();
    }
}

/**
 * @template T
 * @param {string} id
 * @param {new (...args) => T} cls
 * @returns {T}
 */
function getElementById(id, cls) {
    const el = document.getElementById(id);
    if (el === null) throw new Error(`No element with id "${id}" exists`);
    if (!(el instanceof cls)) throw new Error(`Element ${id} is has the wrong class. Expected ${cls.name}, got ${el.constructor.name}`);
    return el;
}

/** Interactive elements */
export const elements = Object.freeze({
    // Connecting
    myPeerId: getElementById("my-peer-id", HTMLElement),
    roomName: getElementById("room-name", HTMLInputElement),
    createRoom: getElementById("create-room", HTMLButtonElement),
    roomUrlReadout: getElementById("room-url", HTMLElement),
    copyUrlButton: getElementById("copy-url", HTMLButtonElement),

    // Playback
    remoteVideos: getElementById("remote-videos", HTMLElement),

    // Recording
    startRecord: getElementById("start-record", HTMLButtonElement),
    stopRecord: getElementById("stop-record", HTMLButtonElement),
    saveRecord: getElementById("save-record", HTMLButtonElement),
    deleteRecord: getElementById("delete-record", HTMLButtonElement),
    uploadRecord: getElementById("upload-record", HTMLButtonElement),
});

/** @type {import("socket.io").Socket} */
export const socketio = io();
