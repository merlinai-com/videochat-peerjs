import * as fs from "node:fs/promises";
import { Namespace } from "socket.io";
import { RecordId } from "surrealdb.js";
import { Database, type JsonSafe, type RoomId } from "./lib/database.js";
import type {
    SignalId,
    InterServerEvents,
    PublisherEvents,
    RoomClientToServerEvents,
    RoomServerToClientEvents,
    SocketData,
} from "./lib/types.js";
import { Publisher, type Listeners, type Subscriber } from "./publisher.js";

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
                    pub.publish(peerId, "connect_to", {
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

        const userListeners: Listeners<SignalId, PublisherEvents> = {
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

        const userSub = pub.subscribe(socket.data.signalId, userListeners);

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
            const id = await db.createRecording({
                user: socket.data.userId,
                owner: signalId,
                userName: socket.data.userName,
                mimeType,
                room: socket.data.roomId,
            });
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
