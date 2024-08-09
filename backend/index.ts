import * as fs from "node:fs/promises";
import { Server } from "socket.io";
import { Publisher, type Listeners, type Subscriber } from "./publisher.js";
import type { HttpServer } from "vite";
import type {
    ServerToClientEvents,
    ClientToServerEvents,
    InterServerEvents,
    PublisherEvents,
    SocketData,
    UUID,
} from "./types.js";
import * as path from "node:path";
import { Database } from "./database.js";
import { RecordId } from "surrealdb.js";
import { createUploadSubscriber } from "./upload.js";

/** Error messages */
const errors = {
    roomNotFound: { status: "error", message: "Room not found" },
    notRegistered: { status: "error", message: "Not registered" },
    peerNotFound: { status: "error", message: "Peer not found" },
    notLoggedIn: { status: "error", message: "Not logged in" },
};

export async function injectSocketIO(
    server: HttpServer,
    env: Record<string, string | undefined>
) {
    const db = await Database.init(env);
    const uploadDir = path.resolve(env.UPLOAD_DIRECTORY ?? "./uploads");

    try {
        await fs.mkdir(uploadDir, { recursive: true });
    } catch (err) {
        console.error("Error creating upload directory:", err);
    }

    const pub = new Publisher<PublisherEvents>();

    createUploadSubscriber(db, pub, uploadDir);

    // Initialise socket.io server
    const socketIO = new Server<
        ClientToServerEvents,
        ServerToClientEvents,
        InterServerEvents,
        SocketData
    >(server, {
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000,
        },
    });

    socketIO.engine.on("connection", (rawSocket) => {
        rawSocket.request = undefined;
    });

    socketIO.on("connect", async (socket) => {
        let roomSub: Subscriber<`room/${string}`, PublisherEvents> | undefined;
        let userSub: Subscriber<`user/${UUID}`, PublisherEvents> | undefined;
        let uploadFile: fs.FileHandle | undefined;

        const closeUploadFile = async () => {
            if (uploadFile) {
                const file = uploadFile;
                uploadFile = undefined;
                try {
                    await file.close();
                } catch (err) {
                    console.error("Error closing uploadFile:", err);
                }
            }
        };

        // Uncomment the next line to log all messages
        // socket.onAny(console.log);

        const roomListeners: Listeners<`room/${string}`, PublisherEvents> = {
            join({ id: peerId }) {
                if (!socket.data.signalId) return;
                if (socket.data.signalId !== peerId) {
                    socket.emit("connect_to", { id: peerId, polite: true });
                    pub.publish(`user/${peerId}`, "connect_to", {
                        id: socket.data.signalId,
                        polite: false,
                    });
                }
            },
            leave({ id: peerId }) {
                if (socket.data.signalId !== peerId) {
                    socket.emit("disconnect_from", { id: peerId });
                }
            },
            recording(act) {
                if (act.from !== socket.data.signalId)
                    socket.emit("recording", act);
            },
        };

        const userListeners: Listeners<`user/${UUID}`, PublisherEvents> = {
            signal(arg) {
                socket.emit("signal", arg);
            },
            connect_to(arg) {
                socket.emit("connect_to", arg);
            },
            disconnect_from(arg) {
                socket.emit("disconnect_from", arg);
            },
            recording(arg) {
                socket.emit("recording", arg);
            },
        };

        if (socket.data.signalId) {
            userSub = pub.subscribe(
                `user/${socket.data.signalId}`,
                userListeners
            );
        }
        if (socket.data.roomId) {
            roomSub = pub.subscribe(
                `room/${socket.data.roomId}`,
                roomListeners
            );
        }

        const leaveRoom = () => {
            if (socket.data.signalId)
                roomSub?.publish("leave", { id: socket.data.signalId });
            roomSub?.unsubscribe();
        };

        socket.on("set_id", async ({ id: newId }, callback) => {
            try {
                const user = await db.getUserByCurrentId(newId);
                if (user) {
                    socket.data.userId = user.id;
                }
                socket.data.signalId = newId;
                userSub = pub.subscribe(
                    `user/${socket.data.signalId}`,
                    userListeners
                );
                callback();
            } catch (err) {
                callback();
            }
        });

        socket.on("disconnect", () => {
            leaveRoom();
            userSub?.unsubscribe();
            closeUploadFile();
        });

        socket.on("join_room", ({ id: roomId, name }) => {
            if (!socket.data.signalId) return;
            roomSub = pub.subscribe(`room/${roomId}`, roomListeners);
            socket.data.userName = name;
            socket.data.roomId = roomId;
            roomSub.publish("join", { id: socket.data.signalId });
        });

        socket.on("leave_room", () => {
            leaveRoom();
        });

        socket.on("recording", (arg) => roomSub?.publish("recording", arg));

        socket.on("signal", ({ to, desc, candidate }) => {
            if (!socket.data.signalId) return;
            pub.publish(`user/${to}`, "signal", {
                from: socket.data.signalId,
                desc,
                candidate,
            });
        });

        socket.on("upload_start", async ({ mimeType }, callback) => {
            if (!socket.data.signalId)
                return callback({ error: "set_id has not been called" });
            if (!socket.data.roomId)
                return callback({ error: "join_room has not been called" });
            const id = await db.createRecording(
                socket.data.userId,
                socket.data.signalId,
                socket.data.userName,
                mimeType,
                new RecordId("room", socket.data.roomId)
            );
            callback({ id: id.id as UUID });
            pub.publish("upload", "start", socket.data.signalId, id, mimeType);
        });

        socket.on("upload_chunk", (id, data) => {
            if (!socket.data.signalId) return;
            pub.publish(
                "upload",
                "chunk",
                socket.data.signalId,
                new RecordId("recording", id),
                data as Buffer
            );
        });

        socket.on("upload_stop", async (id) => {
            if (!socket.data.signalId) return;
            pub.publish(
                "upload",
                "stop",
                socket.data.signalId,
                new RecordId("recording", id)
            );
            await db.finishRecording(
                socket.data.signalId,
                new RecordId("recording", id)
            );
        });
    });
}
