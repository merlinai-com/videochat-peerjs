// @ts-check
import {
    getElementById,
    getOptElementById,
    getRoomURL,
    RoomNotFound,
} from "../common.js";

/** The current room ID @type {string | null} */
export const roomId = new URL(window.location.href).searchParams.get("room");

/** Interactive elements */
export const elements = {
    // SSO
    loginButton: getOptElementById("login-button", HTMLButtonElement),

    // Connecting
    roomName: getElementById("room-name", HTMLElement),
    roomUrlReadout: getElementById("room-url", HTMLElement),
    copyUrlButton: getElementById("copy-url", HTMLButtonElement),
    userName: getElementById("user-name", HTMLInputElement),
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

/**
 * @param {string} roomId
 */
export async function joinRoom(roomId) {
    const res = await fetch(`/room/${roomId}/info`);
    if (!res.ok) {
        if (
            res.status === 404 &&
            (await res.text()).includes("Room not found")
        ) {
            throw new RoomNotFound(roomId);
        } else {
            throw new Error(
                `Unable to get room info: ${res.status} ${res.statusText}`
            );
        }
    } else {
        const { name: roomName, hasRecordings } = await res.json();

        const roomURL = getRoomURL(roomId, roomName);

        return { roomId, roomURL, roomName, hasRecordings };
    }
}

/** Initial room related UI */
export async function roomInit() {
    if (!roomId) throw new Error("roomId is null");

    elements.copyUrlButton.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            console.log(`Room URL ${window.location.href} copied to clipboard`);
        } catch (err) {
            console.error("Failed to copy room URL", err);
        }
    });

    try {
        const { roomURL, roomName, hasRecordings } = await joinRoom(roomId);

        elements.roomName.innerText = roomName;
        elements.roomUrlReadout.innerHTML = roomURL;
        if (hasRecordings) {
            elements.downloadRecord.href = `/room/${roomId}/recordings`;
            elements.downloadRecord.classList.remove("disabled");
        }

        elements.connectButton.classList.remove("hidden");
        elements.connectButton.disabled = false;
        elements.videoDiv.classList.remove("hidden");
    } catch (e) {
        if (e instanceof RoomNotFound) {
            window.location.href =
                "/?" + new URLSearchParams({ roomNotFound: "" });
        } else {
            throw e;
        }
    }
}
