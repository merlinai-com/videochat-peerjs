import cookieParser from "cookie-parser";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Namespace, Server } from "socket.io";
import msgpackParser from "socket.io-msgpack-parser";
import { SSO } from "sso";
import type { HttpServer } from "vite";
import { Database, get } from "./lib/database.js";
import {
    MessageClientToServerEvents,
    MessageServerToClientEvents,
    RoomSocketData,
    type InterServerEvents,
    type PublisherEvents,
    type RoomClientToServerEvents,
    type RoomServerToClientEvents,
    type SocketData,
} from "./lib/types.js";
import { initMessageNamespace } from "./message.js";
import { Publisher } from "./publisher.js";
import { initRoomNamespace } from "./room.js";
import { ssoMiddleware } from "./sso.js";
import { createUploadSubscriber } from "./upload.js";

export async function injectSocketIO(
    server: HttpServer,
    env: Record<string, string | undefined>
) {
    const db = await Database.init(env);
    const uploadDir = path.resolve(env.UPLOAD_DIRECTORY ?? "./uploads");

    const sso = new SSO(get(env, "SSO_ORIGIN"), {
        auth: { id: get(env, "SSO_ID"), key: get(env, "SSO_KEY") },
    });

    try {
        await fs.mkdir(uploadDir, { recursive: true });
    } catch (err) {
        console.error("Error creating upload directory:", err);
    }

    const pub = new Publisher<PublisherEvents>();

    createUploadSubscriber(db, pub, uploadDir);

    // Initialise socket.io server
    const socketIO = new Server<{}, {}, InterServerEvents, SocketData>(server, {
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000,
        },
        parser: msgpackParser,
    });

    socketIO.engine.use(cookieParser());

    const roomNs: Namespace<
        RoomClientToServerEvents,
        RoomServerToClientEvents,
        InterServerEvents,
        SocketData
    > = socketIO.of("/room");

    roomNs.use(ssoMiddleware(sso, db));
    initRoomNamespace(roomNs, pub, db);

    const messageNs: Namespace<
        MessageClientToServerEvents,
        MessageServerToClientEvents,
        InterServerEvents,
        RoomSocketData
    > = socketIO.of("/message");

    messageNs.use(ssoMiddleware(sso, db));
    initMessageNamespace(messageNs, pub, db);
}
