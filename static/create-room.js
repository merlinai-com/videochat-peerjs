// based on peerjs-frontend/js/index-rooms.js  jd & chatgpt4o  7-8 july 2024

import { elements } from "./utils.js";

document.getElementById('create-room').addEventListener('click', async () => {
    const roomName = elements.roomName.value;
    const res = await fetch("/room/create?" + new URLSearchParams({ name: roomName }).toString(), { method: "POST" });
    if (!res.ok) {
        console.error(`Unable to create room: ${res.status} ${res.statusText}`);
        console.debug(res);
        // TODO: show user the error
    }
    /** @type {{ name: string }} */
    const { id: roomID } = await res.json();

    // Generate room URL
    const roomURL = new URL(window.location);
    roomURL.searchParams.set("room", roomID);

    // Display the room URL
    elements.roomUrlReadout.innerText = roomURL;

    // Show the copy button
    elements.copyUrlButton.classList.remove("hidden");

    // Save the room URL in the button's data attribute for easy access
    elements.copyUrlButton.setAttribute('data-url', roomURL);

    // Update URL to include roomID
    // TODO: use history.pushState to avoid page reload
    window.location = roomURL;
});

document.getElementById('copy-url').addEventListener('click', async () => {
    const roomURL = document.getElementById('copy-url').getAttribute('data-url');
    try {
        await navigator.clipboard.writeText(roomURL)
        console.log(`Room URL ${roomURL} copied to clipboard`);
    } catch {
        console.error('Failed to copy room URL', err);
    }
});
