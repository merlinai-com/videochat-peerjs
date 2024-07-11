// peerjs-frontend/js/peer-connection.js   jd & chatgpt4o  8 july 2024

import "https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js";
import { connectToRoom, roomID, elements, peerID, socketio } from "./utils.js";

const peer = new Peer(null, {
    host: window.location.hostname,
    port: window.location.port,
    path: '/peerjs',
    secure: false,
    config: {
        'iceServers': [
            { urls: ['stun:stun.l.google.com:19302'] }
        ]
    },
    debug: 2 // Enable detailed logging
});

const connections = {};

peer.on('open', async id => {
    console.log('My peer ID is: ' + id);
    elements.myPeerId.textContent = id;
    peerID.peerID = id;
    socketio.emit("/register", id);

    // If this is a room URL, join the room
    if (roomID) {
        const roomInfo = await connectToRoom(roomID, id);
        if (roomInfo === null) {
            // TODO: warn user in the UI
            return;
        };
        const { name: roomName, peers } = roomInfo;

        console.log(`Joined room: ${roomName} (${roomID})`);
        console.log('Current peers in the room:', peers);

        // Set room name in the UI
        elements.roomName.value = roomName;
        elements.roomName.readOnly = true;
        elements.createRoom.classList.add("hidden");
        elements.roomUrlReadout.innerText = window.location.href;
        elements.copyUrlButton.classList.remove("hidden");
        elements.copyUrlButton.setAttribute("data-url", window.location.href);

        // Notify all existing peers about the new peer
        peers.forEach(peerId => {
            if (peerId !== id) {
                const conn = connectToPeer(peerId);
                conn.send({ newPeer: id });
            }
        });
    }
});

peer.on('error', err => {
    console.error('PeerJS error:', err);
});

peer.on('disconnected', () => {
    console.log('Disconnected from the signalling server');
});

peer.on('close', () => {
    console.log('Connection to PeerJS server closed');
});

document.getElementById('connect').addEventListener('click', () => {
    const peerId = document.getElementById('peer-id').value;
    connectToPeer(peerId);
});

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        const localVideo = document.getElementById('local-video');
        localVideo.srcObject = stream;
        window.localStream = stream;

        peer.on('call', call => {
            call.answer(stream);
            handleCall(call);
        });

        peer.on('connection', conn => {
            conn.on('data', data => {
                if (data === 'request-stream') {
                    const call = peer.call(conn.peer, stream);
                    handleCall(call);
                } else if (data.newPeer) {
                    console.log('New peer joined:', data.newPeer); // Log new peer ID
                    connectToPeer(data.newPeer);
                }
            });
        });
    })
    .catch(err => console.error('Failed to get local stream', err));

function connectToPeer(peerId) {
    if (!connections[peerId]) {
        const conn = peer.connect(peerId);
        conn.on('open', () => {
            conn.send('request-stream');
        });
        conn.on('data', data => {
            if (data === 'request-stream') {
                const call = peer.call(peerId, window.localStream);
                handleCall(call);
            }
        });
        connections[peerId] = conn;
    }
    return connections[peerId];
}

function handleCall(call) {
    call.on('stream', remoteStream => {
        if (!document.getElementById(call.peer)) {
            const video = document.createElement('video');
            video.id = call.peer;
            video.srcObject = remoteStream;
            video.autoplay = true;
            elements.remoteVideos.appendChild(video);
            connections[call.peer] = call;
        }
    });

    call.on('close', () => {
        const video = document.getElementById(call.peer);
        if (video) {
            video.remove();
        }
        delete connections[call.peer];
    });
}

// // Override the default console.log behavior to filter ICE candidate messages
// const originalConsoleLog = console.log;
// console.log = function (message, ...optionalParams) {
//     if (typeof message === 'string' && message.includes('ICE candidate')) {
//         return; // Filter out ICE candidate messages
//     }
//     originalConsoleLog.apply(console, [message, ...optionalParams]);
// };
