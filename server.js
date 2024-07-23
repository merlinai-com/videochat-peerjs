// @ts-check
import cookieParser from "cookie-parser";
import cors from "cors";
import { randomUUID } from "crypto";
import express from "express";
import JSZip from "jszip";
import * as fs from "node:fs/promises";
import * as path from "path";
import { dirname } from "path";
import { Socket as SocketIO, Server as SocketIOServer } from "socket.io";
import { SSO } from "sso";
import { fileURLToPath } from "url";
import { getRedirectUrl, ssoMiddleware } from "./sso.js";
// import hbs from "hbs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get server configuration
const port = process.env.PORT && parseInt(process.env.PORT);
const host = process.env.HOST ?? "0.0.0.0";
const trust_proxy = !!process.env.TRUST_PROXY ?? false;
const ssoDomain = process.env.SSO_DOMAIN;
/** The directory to upload files to (without trailing slash) */
const uploadDirectory = (process.env.UPLOAD_DIRECTORY ?? "./uploads").replace(/\/$/, "");
if (!port || isNaN(port)) throw new Error("Set $PORT to a number");
if (!ssoDomain) throw new Error("Set $SSO_ORIGIN");

// Some constants
/**
 * The compression level to use when zip compressing uploaded files.
 * Between 1 (best speed) and 9 (best compression)
 * @type {number}
 */
const compressionLevel = 6;

/** Error messages */
const errors = {
    roomNotFound: { status: "error", message: "Room not found" },
    notRegistered: { status: "error", message: "Not registered" },
}

/**
 * @typedef {{ name: string, peers: Set<PeerID>, recordings: Map<string, string> }} Room
 * @typedef {string} PeerID
 * @typedef {string} RoomID
 * @typedef {{
 *  locals?: import("./sso.js").Locals,
 *  room?: Room,
 *  socket: SocketIO,
 *  upload?: {
 *      uuid: string,
 *      file: import("fs/promises").FileHandle,
 *  }
 * }} PeerInfo
 */

const app = express();

// SSO
app.use(cookieParser());
const sso = new SSO(ssoDomain, undefined, false);

app.use(ssoMiddleware(sso));

if (trust_proxy) app.set("trust proxy", true);

/**
 * Information about a client
 * @type {Map<PeerID, PeerInfo>}
 */
const peerInfo = new Map();

/** All the rooms @type {Map<RoomID, Room>} */
const roomByRoomID = new Map();

// Set up CORS middleware
app.use(cors());

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

app.get("/", (req, res) => {
    /** @type {{user: import("sso").User, session: import("sso").Session}} */
    // @ts-ignore
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
    const roomID = randomUUID();
    roomByRoomID.set(roomID, {
        name,
        peers: new Set(),
        recordings: new Map(),
    });
    res.json({ id: roomID });
});

app.get("/room/:roomID/info", (req, res) => {
    const { roomID } = req.params;
    const room = roomByRoomID.get(roomID);
    if (!room) return res.status(404).send(errors.roomNotFound);
    res.json({
        name: room.name,
    });
});

app.get("/room/:roomID/recordings", (req, res) => {
    const { roomID } = req.params;
    const room = roomByRoomID.get(roomID);
    if (!room) return res.status(404).send(errors.roomNotFound);
    const zip = new JSZip();

    /** @type {Record<string, string[]>} */
    const byUser = {};
    for (const [recording, name] of room.recordings.entries()) {
        byUser[name] ??= [];
        byUser[name].push(recording);
    }
    for (const [name, recordings] of Object.entries(byUser)) {
        if (recordings.length === 1) {
            zip.file(`${name}.webm`, fs.readFile(`${uploadDirectory}/${recordings[0]}.webm`));
        } else {
            recordings.forEach((recording, index) => {
                zip.file(`${name}-${index}.webm`, fs.readFile(`${uploadDirectory}/${recording}.webm`), { binary: true });
            });
        }
    }
    res.header("Content-Type", "application/zip");
    res.header("Content-Disposition", `attachment; filename="${room.name} recordings.zip"`)
    zip.generateNodeStream({
        compression: "DEFLATE",
        compressionOptions: {
            level: compressionLevel,
        }
    }).pipe(res);
})

// Start the express server
const server = app.listen(port, host, () => console.log(`Listening on ${host}:${port}`));

// Initialise socket.io server
const socketIO = new SocketIOServer(server);

socketIO.engine.use(cookieParser());
socketIO.engine.use(ssoMiddleware(sso));

socketIO.on("connect", async (socket) => {
    const peerId = randomUUID();
    /** @type {PeerInfo} */
    const info = {
        /** @type {import("./sso.js").Locals} */
        // @ts-ignore
        locals: socket.request.locals,
        socket,
    };
    peerInfo.set(peerId, info);

    socket.on("disconnect", () => {
        if (info.room) {
            info.room.peers.delete(peerId);
            for (const peer of info.room.peers) {
                peerInfo.get(peer)?.socket.emit("/room/peer-leave", { peerID: peerId });
            }
        }
    });

    socket.on("/room/video", ({ message }) => {
        const room = info.room;
        if (!room) return void socket.emit("error", errors.roomNotFound.message);

        for (const peer of room.peers) {
            if (peer !== peerId) {
                const sock = peerInfo.get(peer)?.socket;
                if (sock) sock.emit("/room/video", ({ sender: peerId, message }));
            }
        }
    });

    socket.on("/room/join", ({ roomId }) => {
        const room = roomByRoomID.get(roomId);
        if (!room) return void socket.emit("error", errors.roomNotFound.message);
        for (const otherID of room.peers) {
            if (otherID !== peerId) {
                peerInfo.get(otherID)?.socket.emit("/room/peer-join", { id: peerId, polite: true });
                socket.emit("/room/peer-join", { id: otherID, polite: false });
            }
        }
        room.peers.add(peerId);
        const info = peerInfo.get(peerId);
        if (!info) return;
        info.room = room;
    });

    // Streaming upload handlers
    socket.on("/upload/start", async (callback) => {
        const uploadId = randomUUID();
        const file = await fs.open(`${uploadDirectory}/${uploadId}.webm`, "w", 0o664);
        info.upload = {
            uuid: uploadId,
            file,
        };
        if (info.room) info.room.recordings.set(uploadId, info.locals?.user?.name ?? "Unknown");
        callback(uploadId);
    });

    socket.on("/upload/chunk", async (chunk) => {
        if (!info.upload) return;
        await info.upload.file.write(chunk);
    });

    socket.on("/upload/stop", async () => {
        if (!info.upload) return;
        const { file } = info.upload
        info.upload = undefined;
        await file.close();
    });

    // Signalling
    socket.on("/signal/desc", ({ id, desc }) => {
        const peer = peerInfo.get(id);
        if (!peer) {
            socket.emit("/signal/error", { status: 404, message: "Peer not found" });
            return;
        }

        peer.socket.emit("/signal/desc", { id: peerId, desc });
    });

    socket.on("/signal/candidate", ({ id, candidate }) => {
        const peer = peerInfo.get(id);
        if (!peer) {
            socket.emit("/signal/error", { status: 404, message: "Peer not found" });
            return;
        }

        peer.socket.emit("/signal/candidate", { id: peerId, candidate });
    });
});

