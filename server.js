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
import * as https from "https";
import * as http from "http";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get server configuration
const port = process.env.PORT && parseInt(process.env.PORT);
const host = process.env.HOST ?? "0.0.0.0";
const trust_proxy = !!process.env.TRUST_PROXY;
const ssoDomain = process.env.SSO_DOMAIN;
/** The directory to upload files to (without trailing slash) */
const uploadDirectory = (process.env.UPLOAD_DIRECTORY ?? "./uploads").replace(
    /\/$/,
    ""
);
if (!port || isNaN(port)) throw new Error("Set $PORT to a number");
if (!ssoDomain) throw new Error("Set $SSO_ORIGIN");

// TLS configuration
const httpsCertFile = process.env.HTTPS_CERT_FILE;
const httpsKeyFile = process.env.HTTPS_KEY_FILE;

// Warn if only one of cert file and cert key are set
if (!!httpsCertFile != !!httpsKeyFile) {
    console.error(
        "Only one of HTTPS_CERT_FILE and HTTPS_CERT_KEY are set. Both are required to use https"
    );
}

// Debugging configuration
const logRequests = !!process.env.LOG_REQUESTS;

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
};

/** @type {RTCIceServer[]} */
const defaultIceServer = [
    { urls: "stun:darley.dev:3478" },
    { urls: "turn:darley.dev:3478", username: "test", credential: "test" },
];

/**
 * @typedef {{ name: string, peers: Set<PeerInfo>, recordings: Map<string, string> }} Room
 * @typedef {string} PeerId
 * @typedef {string} RoomId
 * @typedef {{
 *  id: PeerId,
 *  locals?: import("./sso.js").Locals,
 *  room?: Room,
 *  socket: SocketIO,
 *  upload?: {
 *      uuid: string,
 *      file: import("fs/promises").FileHandle,
 *  }
 *  connected: boolean,
 * }} PeerInfo
 */

const app = express();

// SSO
app.use(cookieParser());
const sso = new SSO(ssoDomain, undefined, false);

app.use(ssoMiddleware(sso));

if (trust_proxy) app.set("trust proxy", true);

// Debug configuration

// Log all headers
if (logRequests) {
    console.warn("LOG_REQUESTS is set - do not use this in production");
    app.use((req, res, next) => {
        console.group(`Request: ${req.path}`);
        console.debug(req.headers);
        console.debug({ ip: req.ip });
        console.groupEnd();
        next();
    });
}

/**
 * Information about a client
 * @type {Map<PeerId, PeerInfo>}
 */
const peerInfo = new Map();

/** All the rooms @type {Map<RoomId, Room>} */
const roomByRoomID = new Map();

// Set up CORS middleware
app.use(cors());

// Set up static files
app.use(
    express.static(path.join(__dirname, "static"), { extensions: ["html"] })
);

// Set up templating engine
app.set("view engine", "hbs");

// Log in
app.get("/auth/login", (req, res) => {
    res.render("login.hbs", {
        loginUrl: sso.loginURL(getRedirectUrl(req, "/auth/complete-login"))
            .href,
        logoutUrl: sso.logoutURL(getRedirectUrl(req, "/auth/complete-login"))
            .href,
    });
});

app.get("/", (req, res) => {
    /** @type {{user: import("sso").User, session: import("sso").Session}} */
    // @ts-ignore
    const { user, session } = req.locals;
    res.render("index.hbs", {
        cache: false,
        user,
        session,
        loginUrl: sso.loginURL(getRedirectUrl(req, "/auth/complete-login"))
            .href,
        logoutUrl: sso.logoutURL(getRedirectUrl(req, "/auth/complete-login"))
            .href,
    });
});

app.post("/room/create", (req, res) => {
    const { name } = req.query;
    if (typeof name !== "string")
        return res
            .status(422)
            .send("Expected `name` query parameter to be a string");

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
            zip.file(
                `${name}.webm`,
                fs.readFile(`${uploadDirectory}/${recordings[0]}.webm`)
            );
        } else {
            recordings.forEach((recording, index) => {
                zip.file(
                    `${name}-${index}.webm`,
                    fs.readFile(`${uploadDirectory}/${recording}.webm`),
                    { binary: true }
                );
            });
        }
    }
    res.header("Content-Type", "application/zip");
    res.header(
        "Content-Disposition",
        `attachment; filename="${room.name} recordings.zip"`
    );
    zip.generateNodeStream({
        compression: "DEFLATE",
        compressionOptions: {
            level: compressionLevel,
        },
    }).pipe(res);
});

app.get("/api/ice-servers.js", async (_req, res) => {
    let json;
    try {
        json = (
            await fs.readFile("./iceServers.json", { encoding: "utf8" })
        ).trim();
    } catch {
        json = JSON.stringify(defaultIceServer);
    }
    const file = `export default ${json};`;
    res.type("text/javascript").send(file);
});

// Start the express server
let server;
if (httpsCertFile && httpsKeyFile) {
    const httpsCert = readFileSync(httpsCertFile);
    const httpsKey = readFileSync(httpsKeyFile);
    server = https.createServer({ cert: httpsCert, key: httpsKey }, app);
} else {
    server = http.createServer({}, app);
}

server.listen(port, host, () => {
    console.log(`Listening on ${host}:${port}`);
});

// Initialise socket.io server
const socketIO = new SocketIOServer(server);

socketIO.engine.use(cookieParser());
socketIO.engine.use(ssoMiddleware(sso));

socketIO.on("connect", async (socket) => {
    const peerId = randomUUID();
    /** @type {PeerInfo} */
    const info = {
        id: peerId,
        /** @type {import("./sso.js").Locals} */
        // @ts-ignore
        locals: socket.request.locals,
        socket,
        connected: false,
    };
    peerInfo.set(peerId, info);

    const leaveRoom = () => {
        if (info.room) {
            info.room.peers.delete(info);
            for (const peer of info.room.peers) {
                peer.socket.emit("/room/peer-leave", { id: peerId });
            }
        }
    };

    socket.on("disconnect", () => {
        leaveRoom();
        peerInfo.delete(peerId);
    });

    socket.on("/room/video", ({ message }) => {
        const room = info.room;
        if (!room)
            return void socket.emit("error", errors.roomNotFound.message);

        for (const peer of room.peers) {
            if (peer !== info) {
                peer.socket.emit("/room/video", {
                    sender: peerId,
                    message,
                });
            }
        }
    });

    socket.on("/room/join", ({ roomId }) => {
        const room = roomByRoomID.get(roomId);
        if (!room)
            return void socket.emit("error", errors.roomNotFound.message);
        for (const other of room.peers) {
            if (other !== info) {
                other?.socket.emit("/room/peer-join", {
                    id: peerId,
                    polite: true,
                });
                socket.emit("/room/peer-join", { id: other.id, polite: false });
            }
        }
        room.peers.add(info);
        info.room = room;
        info.connected = true;
    });

    socket.on("/room/leave", () => {
        leaveRoom();
        info.connected = false;
    });

    // Streaming upload handlers
    socket.on("/upload/start", async (callback) => {
        const uploadId = randomUUID();
        const file = await fs.open(
            `${uploadDirectory}/${uploadId}.webm`,
            "w",
            0o664
        );
        info.upload = {
            uuid: uploadId,
            file,
        };
        if (info.room)
            info.room.recordings.set(
                uploadId,
                info.locals?.user?.name ?? "Unknown"
            );
        callback(uploadId);
    });

    socket.on("/upload/chunk", async (chunk) => {
        if (!info.upload) return;
        await info.upload.file.write(chunk);
    });

    socket.on("/upload/stop", async () => {
        if (!info.upload) return;
        const { file } = info.upload;
        info.upload = undefined;
        await file.close();
    });

    // Signalling
    socket.on("/signal/desc", ({ id, desc }) => {
        const peer = peerInfo.get(id);
        if (!peer || !peer.connected) {
            socket.emit("/signal/error", {
                status: 404,
                message: "Peer not found",
            });
            return;
        }

        peer.socket.emit("/signal/desc", { id: peerId, desc });
    });

    socket.on("/signal/candidate", ({ id, candidate }) => {
        const peer = peerInfo.get(id);
        if (!peer || !peer.connected) {
            socket.emit("/signal/error", {
                status: 404,
                message: "Peer not found",
            });
            return;
        }

        peer.socket.emit("/signal/candidate", { id: peerId, candidate });
    });
});
