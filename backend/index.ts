import cookieParser from "cookie-parser";
import { Namespace, Server } from "socket.io";
import msgpackParser from "socket.io-msgpack-parser";
import { SSO } from "sso";
import type { HttpServer } from "vite";
import { Database, get } from "./lib/database.js";
import { FileStore } from "./lib/file.js";
import type {
    InterServerEvents,
    MessageClientToServerEvents,
    MessageServerToClientEvents,
    PublisherEvents,
    RoomClientToServerEvents,
    RoomServerToClientEvents,
    RoomSocketData,
    SocketData,
} from "./lib/types.js";
import { initMessageNamespace } from "./message.js";
import { Publisher } from "./publisher.js";
import { initRoomNamespace } from "./room.js";
import { loginMiddleware } from "./sso.js";
import { createUploadSubscriber } from "./upload.js";

export async function injectSocketIO(
    server: HttpServer,
    env: Record<string, string | undefined>
) {
    const db = await Database.init(env);
    const fileStore = FileStore.init(env);

    const sso = new SSO(get(env, "SSO_ORIGIN"), {
        auth: { id: get(env, "SSO_ID"), key: get(env, "SSO_KEY") },
    });

    const pub = new Publisher<PublisherEvents>();

    createUploadSubscriber(db, pub, fileStore);

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

    roomNs.use(loginMiddleware(sso, db));
    initRoomNamespace(roomNs, pub, db);

    const messageNs: Namespace<
        MessageClientToServerEvents,
        MessageServerToClientEvents,
        InterServerEvents,
        RoomSocketData
    > = socketIO.of("/message");

    messageNs.use(loginMiddleware(sso, db));
    initMessageNamespace(messageNs, pub, db, sso);

    // Update other users when a user changes their nickname
    db.subscribe("user", async (act, user) => {
        if (act === "UPDATE") {
            let name = user.name;

            if (user.sso_id && !name) {
                const users = await sso.getUsers({ ids: [user.sso_id] });
                if (users.length !== 1) {
                    console.error(
                        "Expected a single user from sso.getUsers. Got",
                        users
                    );
                    return;
                }
                name = users[0].name;
            }

            const groups = await db.getGroups(user.id);
            for (const group of groups ?? []) {
                pub.publish(
                    Database.jsonSafe(group.id),
                    "user",
                    Database.jsonSafe(user.id),
                    name
                );
            }
        }
    });
}
