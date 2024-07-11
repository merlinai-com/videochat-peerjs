// @ts-check
// peerjs-frontend/js/video-management.js   jd & chatgpt4o   8 july 2024

import { elements, roomID, peerID, socketio } from "./utils.js";

const mediaMimeTypes = ["media/webm"];
const recorderMimeType = mediaMimeTypes.find(MediaRecorder.isTypeSupported);
if (!recorderMimeType) {
    console.warn("No supported mime type");
}

/** @type {MediaRecorder} */
let mediaRecorder;
/** @type {Blob[]} */
let recordedChunks = [];

// Initialize IndexedDB
/** @type {IDBDatabase} */
let db;
const request = indexedDB.open('videoChatDB', 1);

socketio.on("/room/video", ({ message }) => {
    switch (message) {
        case "record/start":
            startRecording(window.localStream);
            break;
        case "record/stop":
            stopRecording();
            break;
        case "record/save":
            saveRecording();
            break;
        case "record/upload":
            uploadRecording();
            break;
    }
});

request.addEventListener("error", (event) => {
    console.error('Database error:', event.target.errorCode);
});

request.addEventListener("success", function () {
    db = request.result;
    console.log('Database initialized.');
    loadRecordedVideo();
});

request.addEventListener("upgradeneeded", function (event) {
    db = request.result;
    db.createObjectStore('videos', { keyPath: 'id', autoIncrement: true });
    console.log('Object store created.');
});

elements.startRecord.addEventListener('click', () => {
    startRecording(window.localStream);
    if (roomID && peerID)
        socketio.emit("/room/video", { roomID, peerID, message: "record/start" });
});

elements.stopRecord.addEventListener('click', () => {
    stopRecording();
    if (roomID && peerID)
        socketio.emit("/room/video", { roomID, peerID, message: "record/stop" });
});

elements.saveRecord.addEventListener('click', () => {
    saveRecording();
    if (roomID && peerID)
        socketio.emit("/room/video", { roomID, peerID, message: "record/save" });
});

elements.deleteRecord.addEventListener('click', () => {
    deleteRecording();
});

elements.uploadRecord.addEventListener('click', () => {
    uploadRecording();
    if (roomID && peerID)
        socketio.emit("/room/video", { roomID, peerID, message: "record/upload" });
});

function startRecording(stream) {
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: recorderMimeType });
    mediaRecorder.addEventListener("dataavailable", event => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    });
    mediaRecorder.addEventListener("stop", () => {
        elements.startRecord.disabled = false;
        elements.stopRecord.disabled = true;
        elements.saveRecord.disabled = false;
    });
    mediaRecorder.start();
    elements.startRecord.disabled = true;
    elements.stopRecord.disabled = false;
}

function stopRecording() {
    mediaRecorder.stop();
}

function saveRecording() {
    const blob = new Blob(recordedChunks, { type: recorderMimeType });
    const transaction = db.transaction(['videos'], 'readwrite');
    const objectStore = transaction.objectStore('videos');
    const request = objectStore.add({ video: blob });

    request.onsuccess = function (event) {
        console.log('Video recording saved to IndexedDB');
        elements.saveRecord.disabled = true;
        elements.deleteRecord.disabled = false;
    };

    request.onerror = function (event) {
        console.error('Error saving recording:', event.target.errorCode);
    };
}

function deleteRecording() {
    const transaction = db.transaction(['videos'], 'readwrite');
    const objectStore = transaction.objectStore('videos');
    const request = objectStore.clear();

    request.onsuccess = function (event) {
        alert('Recording deleted.');
        elements.deleteRecord.disabled = true;

        // Remove the download link if it exists
        const downloadLink = document.querySelector('a[download="recorded-video.webm"]');
        if (downloadLink) {
            downloadLink.remove();
        }
    };

    request.onerror = function (event) {
        console.error('Error deleting recording:', event.target.errorCode);
    };
}

function loadRecordedVideo() {
    const transaction = db.transaction(['videos'], 'readonly');
    const objectStore = transaction.objectStore('videos');
    const request = objectStore.getAll();

    request.onsuccess = function (event) {
        if (event.target.result.length > 0) {
            elements.deleteRecord.disabled = false;
        }
    };

    request.onerror = function (event) {
        console.error('Error loading recorded video:', event.target.errorCode);
    };
}

function uploadRecording() {
    const transaction = db.transaction(['videos'], 'readonly');
    const objectStore = transaction.objectStore('videos');
    const request = objectStore.getAll();

    request.addEventListener("success", async function (event) {
        const videos = event.target.result;
        if (videos.length > 0) {
            const mostRecentVideo = videos.at(-1).video;
            const formData = new FormData();
            formData.append('file', mostRecentVideo);

            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                if (response.ok) {
                    console.log('Upload successful!');
                } else {
                    console.error('Upload failed.');
                    console.debug(response);
                }
            } catch (error) {
                console.error('Error uploading the file:', error);
            };
        } else {
            console.log('No videos found in IndexedDB');
        }
    });

    request.addEventListener("error", function (event) {
        console.error('Error retrieving videos:', event.target.errorCode);
    });
}
