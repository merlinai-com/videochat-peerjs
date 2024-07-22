// @ts-check
// peerjs-frontend/js/video-management.js   jd & chatgpt4o   8 july 2024

import { elements, roomID } from "./utils.js";

/**
 * @param {import("socket.io").Socket} socketio
 * @param {MediaStream} localStream
 * @param {string} peerID
 */
export async function recordingInit(socketio, localStream, peerID) {
    const mediaMimeTypes = ["video/webm"];
    let recorderMimeType = mediaMimeTypes.find(MediaRecorder.isTypeSupported);
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
                startRecording(localStream);
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

    request.addEventListener("error", () => {
        console.error('Database error:', request.error);
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
        startRecording(localStream);
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

    /**
     * Start recording
     * @param {MediaStream} stream
     */
    async function startRecording(stream) {
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: recorderMimeType });
        /** Interval to request data regularly */
        const requestDataInterval = setInterval(() => mediaRecorder.requestData(), 1000);

        /** @type {string} */
        const uuid = await socketio.emitWithAck("/upload/start");
        console.log(uuid);
        let sendUploadStop = false;

        // Set up media recorder callbacks
        mediaRecorder.addEventListener("dataavailable", async event => {
            if (event.data.size > 0) {
                const chunk = event.data;
                recorderMimeType = chunk.type;
                recordedChunks.push(chunk);
                socketio.emit("/upload/chunk", await chunk.arrayBuffer());
            }
            if (sendUploadStop) {
                socketio.emit("/upload/stop");
                sendUploadStop = false;
            }
        });
        mediaRecorder.addEventListener("stop", () => {
            elements.startRecord.disabled = false;
            elements.stopRecord.disabled = true;
            elements.saveRecord.disabled = false;
            if (roomID) {
                elements.downloadRecord.classList.remove("disabled");
                elements.downloadRecord.href = `/room/${roomID}/recordings`;
            }
            clearInterval(requestDataInterval);
            sendUploadStop = true;
        });
        mediaRecorder.start();

        // UI updates
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

        request.addEventListener("success", () => {
            console.log('Video recording saved to IndexedDB');
            elements.saveRecord.disabled = true;
            elements.deleteRecord.disabled = false;
        });

        request.addEventListener("error", () => {
            console.error('Error saving recording:', request.error);
        });
    }

    function deleteRecording() {
        const transaction = db.transaction(['videos'], 'readwrite');
        const objectStore = transaction.objectStore('videos');
        const request = objectStore.clear();

        request.onsuccess = function () {
            alert('Recording deleted.');
            elements.deleteRecord.disabled = true;

            // Remove the download link if it exists
            const downloadLink = document.querySelector('a[download="recorded-video.webm"]');
            if (downloadLink) {
                downloadLink.remove();
            }
        };

        request.onerror = function () {
            console.error('Error deleting recording:', request.error);
        };
    }

    function loadRecordedVideo() {
        const transaction = db.transaction(['videos'], 'readonly');
        const objectStore = transaction.objectStore('videos');
        const request = objectStore.getAll();

        request.onsuccess = function () {
            if (request.result.length > 0) {
                elements.deleteRecord.disabled = false;
            }
        };

        request.onerror = function () {
            console.error('Error loading recorded video:', request.error);
        };
    }

    function uploadRecording() {
        const transaction = db.transaction(['videos'], 'readonly');
        const objectStore = transaction.objectStore('videos');
        const request = objectStore.getAll();

        request.addEventListener("success", async function () {
            const videos = request.result;
            if (videos.length > 0) {
                const mostRecentVideo = videos.at(-1).video;
                const uuid = await socketio.emitWithAck("/upload/start");
                socketio.emit("/upload/chunk", mostRecentVideo);
                socketio.emit("/upload/stop");
                // const formData = new FormData();
                // formData.append('file', mostRecentVideo);

                // try {
                //     const response = await fetch('/upload', {
                //         method: 'POST',
                //         body: formData
                //     });
                //     if (response.ok) {
                //         console.log('Upload successful!');
                //     } else {
                //         console.error('Upload failed.');
                //         console.debug(response);
                //     }
                // } catch (error) {
                //     console.error('Error uploading the file:', error);
                // };
            } else {
                console.log('No videos found in IndexedDB');
            }
        });

        request.addEventListener("error", function (event) {
            console.error('Error retrieving videos:', request.error);
        });
    }
}
