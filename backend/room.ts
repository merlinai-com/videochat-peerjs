import cookieParser from "cookie-parser";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Namespace, Server } from "socket.io";
import msgpackParser from "socket.io-msgpack-parser";
import { Cookies, SSO } from "sso";
import { RecordId } from "surrealdb.js";
import type { HttpServer } from "vite";
import { Database, get, JsonSafe, RoomId } from "./lib/database.js";
import { Publisher, type Listeners, type Subscriber } from "./publisher.js";
import {
    Email,
    type RoomClientToServerEvents,
    type InterServerEvents,
    type PublisherEvents,
    type RoomServerToClientEvents,
    type SocketData,
    type UUID,
} from "./lib/types.js";
import { createUploadSubscriber } from "./upload.js";

export function initRoomNamespace(
    ns: Namespace<
        RoomClientToServerEvents,
        RoomServerToClientEvents,
        InterServerEvents,
        SocketData
    >,
    pub: Publisher<PublisherEvents>,
    db: Database
) {
    ns.on("connect", async (socket) => {
        // socket.data.signalId = socket.data.user
        //     ? Database.asUUID(socket.data.user.id)
        //     : crypto.randomUUID();
        const signalId =
            socket.data.signalId || `signal:${crypto.randomUUID()}`;
        socket.data.signalId = signalId;

        let roomSub: Subscriber<JsonSafe<RoomId>, PublisherEvents> | undefined;
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

        const roomListeners: Listeners<JsonSafe<RoomId>, PublisherEvents> = {
            join(peerId) {
                if (!socket.data.signalId) return;
                if (socket.data.signalId !== peerId) {
                    socket.emit("connect_to", { id: peerId, polite: true });
                    pub.publish(`signal:${peerId}`, "connect_to", {
                        id: socket.data.signalId,
                        polite: false,
                    });
                }
            },
            leave(peerId) {
                if (socket.data.signalId !== peerId) {
                    socket.emit("disconnect_from", { id: peerId });
                }
            },
            recording(act) {
                if (act.from !== socket.data.signalId)
                    socket.emit("recording", act);
            },
        };

        const userListeners: Listeners<`signal:${UUID}`, PublisherEvents> = {
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

        const userSub = pub.subscribe(
            `signal:${socket.data.signalId}`,
            userListeners
        );
        if (socket.data.roomId) {
            roomSub = pub.subscribe(
                Database.jsonSafe(socket.data.roomId),
                roomListeners
            );
        }

        const leaveRoom = () => {
            if (socket.data.signalId)
                roomSub?.publish("leave", socket.data.signalId);
            roomSub?.unsubscribe();
        };

        socket.on("disconnect", () => {
            leaveRoom();
            userSub.unsubscribe();
            closeUploadFile();
        });

        socket.on("join_room", (roomId) => {
            roomSub = pub.subscribe(roomId, roomListeners);
            socket.data.roomId = Database.parseRecord("room", roomId);
            roomSub.publish("join", signalId);
        });

        socket.on("leave_room", () => {
            leaveRoom();
        });

        socket.on("recording", (arg) => roomSub?.publish("recording", arg));

        socket.on("signal", ({ to, desc, candidate }) => {
            pub.publish(to, "signal", {
                from: signalId,
                desc,
                candidate,
            });
        });

        socket.on("upload_start", async ({ mimeType }, callback) => {
            if (!socket.data.roomId)
                return callback({ error: "join_room has not been called" });
            const id = await db.createRecording(
                socket.data.user?.id,
                signalId,
                socket.data.userName,
                mimeType,
                socket.data.roomId
            );
            callback({ id: Database.jsonSafe(id) });
            pub.publish("upload", "start", signalId, id, mimeType);
        });

        socket.on("upload_chunk", (id, data) => {
            pub.publish(
                "upload",
                "chunk",
                signalId,
                new RecordId("recording", id),
                data as Buffer
            );
        });

        socket.on("upload_stop", async (id) => {
            pub.publish(
                "upload",
                "stop",
                signalId,
                new RecordId("recording", id)
            );
            await db.finishRecording(signalId, new RecordId("recording", id));
        });
    });
}
