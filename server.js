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
import { SSO } from "sso";
import cookieParser from "cookie-parser";
import { getRedirectUrl, ssoMiddleware } from "./sso.js";
// import hbs from "hbs";
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get server configuration
const port = process.env.PORT && parseInt(process.env.PORT);
const host = process.env.HOST ?? "0.0.0.0";
const trust_proxy = !!process.env.TRUST_PROXY ?? false;
const ssoDomain = process.env.SSO_DOMAIN;
if (!port || isNaN(port)) throw new Error("Set $PORT to a number");
if (!ssoDomain) throw new Error("Set $SSO_ORIGIN");

/** Error messages */
const errors = {
    roomNotFound: { status: "error", message: "Room not found" },
    notRegistered: { status: "error", message: "Not registered" },
}

/**
 * @typedef {{ name: string, peers: Set<string> }} Room
 */

const app = express();

// SSO
app.use(cookieParser());
const sso = new SSO(ssoDomain, undefined, false);

app.use(ssoMiddleware(sso));

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
app.use(express.static(path.join(__dirname, "static"), { extensions: ["html"] }));

// Set up templating engine
app.set("view engine", "hbs");

// Log in
app.get("/auth/login", (req, res) => {
    res.render("login.hbs", {
        cache: false,
        loginUrl: sso.loginURL(getRedirectUrl(req, "/auth/complete-login")).href,
        logoutUrl: sso.logoutURL(getRedirectUrl(req, "/auth/complete-login")).href,
    });
});

// Middleware to attach user info to req
app.use((req, res, next) => {
    const { user, session } = req.locals || {};
    if (user) {
        req.user = user;
    }
    next();
});

// Log User ID on Page Refresh
app.get("/", (req, res, next) => {
    if (req.locals && req.locals.user) {
        console.log("User ID on refresh:", req.locals.user.id);
        console.log("User Name on refresh:", req.locals.user.name);        
    } else {
        console.log("No user ID available.");
    }
    next();
});

app.get("/", (req, res) => {
    /** @type {{user: import("sso").User, session: import("sso").Session}} */
    const { user, session } = req.locals;
    res.render("index.hbs", {
        cache: false, user, session,
        loginUrl: sso.loginURL(getRedirectUrl(req, "/auth/complete-login")).href,
        logoutUrl: sso.logoutURL(getRedirectUrl(req, "/auth/complete-login")).href,
    });
})

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



// UPLOAD RECORDED FILE(S) TO SERVER //
app.post("/upload", upload.single("file"), (req, res) => {
    const userId = req.user ? req.user.id : 'no-id';
    const username = req.user ? req.user.name : 'anon';

    console.log("on upload - User ID: ", userId, " User Name: ", username);  // Print user params to the server console
    
    const oldPath = req.file.path;
    const newPath = path.join(path.dirname(oldPath), `${username}_${path.basename(oldPath)}.webm`);


    // const userId = req.user ? req.user.id : 'anon';
    // const username = req.user ? req.user.name : 'anon';
    // console.log("User ID:", userId);  // Print user ID to the server console

    // const newPath = path.join(__dirname, "uploads", `${username}_${userId}.webm`);


    fs.rename(oldPath, newPath, (err) => {
        if (err) {
            console.error("File renaming failed", err);
            res.status(500).send({ status: "error", message: "File renaming failed" });
        } else {
            console.log("File renamed successfully");
            res.send({ status: "ok", filePath: newPath });
        }
    });
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
