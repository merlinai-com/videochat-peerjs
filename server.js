// @ts-check
import cors from "cors";
import express from "express";
import multer from "multer";
import { ExpressPeerServer } from "peer";
import * as uuid from "uuid";
import { Server as SocketIOServer, Socket as SocketIO } from "socket.io";
import * as path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get server configuration
const port = process.env.PORT && parseInt(process.env.PORT);
const host = process.env.HOST ?? "0.0.0.0";
const trust_proxy = !!process.env.TRUST_PROXY ?? false;
if (!port || isNaN(port)) throw new Error("Set $PORT to a number");

/** Error messages */
const errors = {
    roomNotFound: { status: "error", message: "Room not found" },
    notRegistered: { status: "error", message: "Not registered" },
}

/**
 * @typedef {{ name: string, peers: Set<string> }} Room
 */

const app = express();

if (trust_proxy) app.set("trust proxy", true);

/** All the rooms @type {Map<string, Room>} */
const roomByRoomID = new Map();
/** The rooms by peerID @type {Map<string, Room>} */
const roomByPeerID = new Map();
/** The socket.io socket by peerID @type {Map<string, SocketIO>} */
const socketByPeerID = new Map();
/** The peerID by socket @type {WeakMap<SocketIO, string>} */
const peerIDBySocket = new WeakMap()

// Set up CORS middleware
app.use(cors());

// Set up multer
const upload = multer({
    dest: "./uploads",
});

// Set up static files
app.use(express.static(path.join(__dirname, "static")));

app.post("/room/create", (req, res) => {
    const { name } = req.query;
    if (typeof name !== "string")
        return res.status(422).send("Expected `name` query parameter to be a string");

    // TODO: validate name
    const roomID = uuid.v4();
    roomByRoomID.set(roomID, {
        name,
        peers: new Set(),
    });
    res.json({ id: roomID });
});

app.get("/room/info/:roomID", (req, res) => {
    const { roomID } = req.params;
    const room = roomByRoomID.get(roomID);
    if (!room) return res.status(404).send(errors.roomNotFound);
    res.json({
        name: room.name,
    });
});

app.post("/upload", upload.single("file"), (req, res) => {
    console.log(req.file);
    res.send({ status: "ok" });
});

// Start the express server
const server = app.listen(port, host, () => console.log(`Listening on ${host}:${port}`));

// Initialise socket.io server
const socketIO = new SocketIOServer(server);

socketIO.on("connect", (socket) => {
    socket.on("/register", (peerID) => {
        socketByPeerID.set(peerID, socket);
        peerIDBySocket.set(socket, peerID);
    });

    socket.on("/room/video", ({ roomID, message }) => {
        const room = roomByRoomID.get(roomID);
        const peerID = peerIDBySocket.get(socket);
        if (!room) return void socket.emit("error", errors.roomNotFound.message);
        if (!peerID) return void socket.emit("error", errors.notRegistered);

        for (const peer of room.peers) {
            if (peer !== peerID) {
                const sock = socketByPeerID.get(peer);
                if (sock) sock.emit("/room/video", ({ sender: peerID, message }));
            }
        }
    });

    socket.on("/room/join", ({ roomID }) => {
        const room = roomByRoomID.get(roomID);
        const peerID = peerIDBySocket.get(socket);
        if (!room) return void socket.emit("error", errors.roomNotFound.message);
        if (!peerID) return void socket.emit("error", errors.notRegistered);
        for (const otherID of room.peers) {
            if (otherID !== peerID) {
                socketByPeerID.get(otherID)?.emit("/room/peer-join", { peerID });
                socket.emit("/room/peer-join", { peerID: otherID });
            }
        }
        room.peers.add(peerID);
        roomByPeerID.set(peerID, room);
    })
});

// Start peer.js server
const peerServer = ExpressPeerServer(server, {
    path: "/",
});
app.use("/peerjs", peerServer);

// When a client disconnects, remove their ID from all rooms
peerServer.on("disconnect", (client) => {
    const peerID = client.getId();
    const room = roomByPeerID.get(peerID);
    if (room) {
        room.peers.delete(peerID);
        for (const otherID of room.peers) {
            socketByPeerID.get(otherID)?.emit("/room/peer-leave", { peerID });
        }
    }
    socketByPeerID.delete(peerID);
});
