// @ts-check

import { getElementById, getOptElementById, getRoomURL } from "./common.js";

/** Interactive elements */
export const elements = {
    // SSO
    loginButton: getOptElementById("login-button", HTMLButtonElement),

    // Connecting
    roomForm: getElementById("room-form", HTMLFormElement),
    roomName: getElementById("room-name", HTMLInputElement),
    createRoom: getElementById("create-room", HTMLButtonElement),
};

export function createRoomInit() {
    elements.roomForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const roomName = elements.roomName.value;
        const res = await fetch(
            "/room/create?" +
                new URLSearchParams({ name: roomName }).toString(),
            { method: "POST" }
        );
        if (!res.ok) {
            console.error(
                `Unable to create room: ${res.status} ${res.statusText}`
            );
            console.debug(res);
            window.alert("Error creating room");
        }
        /** @type {{ id: string }} */
        const { id: roomId } = await res.json();

        // Update URL to include roomID
        // TODO: use history.pushState to avoid page reload
        window.location.href = getRoomURL(roomId, roomName);
    });
}
