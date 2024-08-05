// @ts-check

/** The current room ID @type {string | null} */
export const roomId = new URL(window.location.href).searchParams.get("room");

/**
 * @template T
 * @param {string} id
 * @param {new (...args) => T} cls
 * @returns {T | null}
 */
function getOptElementById(id, cls) {
    const el = document.getElementById(id);
    if (el && !(el instanceof cls))
        throw new Error(
            `Element ${id} is has the wrong class. Expected ${cls.name}, got ${el.constructor.name}`
        );
    return el;
}

/**
 * @template T
 * @param {string} id
 * @param {new (...args) => T} cls
 * @returns {T}
 */
function getElementById(id, cls) {
    const el = getOptElementById(id, cls);
    if (el === null) throw new Error(`No element with id "${id}" exists`);
    return el;
}

/** Interactive elements */
export const elements = {
    // SSO
    loginButton: getOptElementById("login-button", HTMLButtonElement),

    // Connecting
    roomForm: getElementById("room-form", HTMLFormElement),
    roomName: getElementById("room-name", HTMLInputElement),
    createRoom: getElementById("create-room", HTMLButtonElement),
    roomUrlReadout: getElementById("room-url", HTMLElement),
    copyUrlButton: getElementById("copy-url", HTMLButtonElement),
    connectButton: getElementById("connect", HTMLButtonElement),

    // Playback
    videoDiv: getElementById("video", HTMLElement),
    localVideo: getElementById("local-video", HTMLVideoElement),
    remoteVideos: getElementById("remote-videos", HTMLElement),

    // Recording
    startRecord: getElementById("start-record", HTMLButtonElement),
    stopRecord: getElementById("stop-record", HTMLButtonElement),
    saveRecord: getElementById("save-record", HTMLButtonElement),
    deleteRecord: getElementById("delete-record", HTMLButtonElement),
    uploadRecord: getElementById("upload-record", HTMLButtonElement),
    downloadRecord: getElementById("download-record", HTMLAnchorElement),
};

/** Get a URL for a roomID/roomName
 * @param {string} roomID
 * @param {string} roomName
 */
export function getRoomURL(roomID, roomName) {
    const url = new URL(window.location.href);
    url.searchParams.delete("roomNotFound");
    url.searchParams.set("name", roomName);
    url.searchParams.set("room", roomID);
    return url.href;
}
