// based on peerjs-frontend/js/index-rooms.js  jd & chatgpt4o  7-8 july 2024

import { roomID, elements, getRoomURL } from "./utils.js";

class RoomNotFound extends Error {
    /** @param {string} roomID  */
    constructor(roomID) {
        super(`Room not found: ${roomID}`);
        this.roomID = roomID;
    }
}

/** @param {string} roomID  */
async function joinRoom(roomID) {
    const res = await fetch(`/room/${roomID}/info`);
    if (!res.ok) {
        if (res.status === 404 && (await res.text()).includes("Room not found")) {
            throw new RoomNotFound(roomID);
        } else {
            throw new Error(`Unable to get room info: ${res.status} ${res.statusText}`);
        }
    } else {
        const { name: roomName } = await res.json();

        const roomURL = getRoomURL(roomID, roomName);

        // Set room name in the UI
        elements.roomName.value = roomName;
        elements.roomName.readOnly = true;
        elements.createRoom.classList.add("hidden");
        elements.roomUrlReadout.innerText = roomURL;
        elements.copyUrlButton.classList.remove("hidden");

        return { roomName, roomID, roomURL };
    }
}

/** Initialise UI related to the current room
 * @returns { Promise<{ roomName: string, roomID: string } | null>}
 */
export async function roomInit() {
    elements.copyUrlButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            console.log(`Room URL ${window.location.href} copied to clipboard`);
        } catch (err) {
            console.error('Failed to copy room URL', err);
        }
    });
    if (roomID) {
        try {
            const { roomName, roomID: id } = await joinRoom(roomID);
            elements.connectButton.classList.remove("hidden");
            elements.connectButton.disabled = false;
            elements.videoDiv.classList.remove("hidden");
            return { roomName, roomID: id };
        } catch (e) {
            if (e instanceof RoomNotFound) {
                window.location.search = new URLSearchParams({ roomNotFound: "" }).toString();
            } else {
                throw e;
            }
        }
    } else {
        elements.roomForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const roomName = elements.roomName.value;
            const res = await fetch("/room/create?" + new URLSearchParams({ name: roomName }).toString(), { method: "POST" });
            if (!res.ok) {
                console.error(`Unable to create room: ${res.status} ${res.statusText}`);
                console.debug(res);
                window.alert("Error creating room");
            }
            /** @type {{ name: string }} */
            const { id: roomID } = await res.json();

            const { roomURL } = await joinRoom(roomID);

            // Update URL to include roomID
            // TODO: use history.pushState to avoid page reload
            window.location = roomURL;
        });

        return null;
    }
}
