import { Namespace } from "socket.io";
import { SSO } from "sso";
import { injectErrorHandler, UserError } from "./errorHandler.js";
import {
    Database,
    RecordingId,
    type JsonSafe,
    type RoomId,
} from "./lib/database.js";
import { getUserNames } from "./lib/login.js";
import {
    isSignalId,
    RoomSocketData,
    type InterServerEvents,
    type PublisherEvents,
    type RoomClientToServerEvents,
    type RoomServerToClientEvents,
    type SignalId,
} from "./lib/types.js";
import { omit } from "./lib/utils.js";
import { Publisher, type Listeners, type Subscriber } from "./publisher.js";

export function initRoomNamespace(
    ns: Namespace<
        RoomClientToServerEvents,
        RoomServerToClientEvents,
        InterServerEvents,
        RoomSocketData
    >,
    pub: Publisher<PublisherEvents>,
    db: Database,
    sso: SSO
) {
    ns.use((socket, next) => {
        if (!socket.data.user) next(new Error("Not logged in"));
        else next();
    });

    ns.on("connect", async (socket) => {
        injectErrorHandler(socket, (event, error) => {
            if (error instanceof UserError) {
                socket.emit("error", error.message, event);
            } else {
                console.error(
                    `While handling ${event} for ${socket.id}:`,
                    error
                );
                socket.emit("error", "Internal error", event);
            }
        });

        const signalId =
            socket.data.signalId || `signal:${crypto.randomUUID()}`;
        socket.data.signalId = signalId;

        let roomSub: Subscriber<JsonSafe<RoomId>, PublisherEvents> | undefined;
        let connected = false;
        const recordings = new Set<JsonSafe<RecordingId>>();

        const updateRoom = async (type: "users" | "recordings") => {
            if (!socket.data.roomId) throw new UserError("Not in a room");

            const room = await db.queryRoom(socket.data.roomId);
            if (!room)
                throw new UserError(`Unknown room: ${socket.data.roomId}`);

            if (type === "users") {
                roomSub?.publish(
                    "users",
                    Database.jsonSafe(await getUserNames(db, sso, room.users))
                );
            } else {
                roomSub?.publish(
                    "recordings",
                    Database.jsonSafe(omit(room.recordings, "file_id"))
                );
            }
        };

        const roomListeners: Listeners<JsonSafe<RoomId>, PublisherEvents> = {
            users(us) {
                socket.emit("users", us);
            },
            recordings(rs) {
                socket.emit("recordings", rs);
            },
            connected(peerId) {
                if (connected && signalId !== peerId) {
                    socket.emit("connect_to", { id: peerId, polite: true });
                    pub.publish(peerId, "connect_to", {
                        id: signalId,
                        polite: false,
                    });
                }
            },
            disconnected(peerId) {
                if (connected && signalId !== peerId) {
                    socket.emit("disconnect_from", { id: peerId });
                }
            },
            recording(act) {
                if (act.from !== signalId) socket.emit("recording", act);
            },
            screen_share(arg) {
                if (arg.user !== signalId) socket.emit("screen_share", arg);
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

        const userSub = pub.subscribe(signalId, userListeners);

        if (socket.data.roomId) {
            roomSub = pub.subscribe(
                Database.jsonSafe(socket.data.roomId),
                roomListeners
            );
        }

        const leaveRoom = async () => {
            if (socket.data.roomId) {
                await db.leaveRoom(socket.data.roomId, socket.data.user!.id);
                await updateRoom("users");
            }
            socket.data.roomId = undefined;
            roomSub?.publish("disconnected", signalId);
            roomSub?.unsubscribe();
            connected = false;
        };

        socket.on("disconnect", async () => {
            leaveRoom();
            userSub.unsubscribe();

            if (socket.data.user) {
                for (const id of recordings) {
                    recordings.delete(id);
                    await db.finishRecording(
                        socket.data.user.id,
                        Database.parseRecord("recording", id)
                    );
                }
            }
        });

        socket.on("join_room", async (roomId) => {
            if (!Database.isRecord("room", roomId))
                throw new UserError(`Not a room ID: ${roomId}`);

            socket.data.roomId = Database.parseRecord("room", roomId);

            const room = await db.queryRoom(socket.data.roomId);
            if (!room) throw new UserError(`Unknown room: ${roomId}`);

            roomSub = pub.subscribe(
                Database.jsonSafe(socket.data.roomId),
                roomListeners
            );
            await db.joinRoom(socket.data.roomId, socket.data.user!.id);

            await updateRoom("users");
            socket.emit(
                "recordings",
                Database.jsonSafe(omit(room.recordings, "file_id"))
            );
        });

        socket.on("leave_room", () => {
            leaveRoom();
        });

        socket.on("connect_to", () => {
            if (!socket.data.roomId) throw new UserError("Not in a room");
            roomSub?.publish("connected", signalId);
            connected = true;
        });

        socket.on("disconnect_from", () => {
            connected = false;
            if (!socket.data.roomId) throw new UserError("Not in a room");
            roomSub?.publish("disconnected", signalId);
        });

        socket.on("recording", (arg) =>
            roomSub?.publish("recording", { ...arg, from: signalId })
        );

        socket.on("screen_share", (arg) => {
            roomSub?.publish("screen_share", {
                user: signalId,
                streamId: arg.streamId,
            });
        });

        socket.on("signal", ({ to, desc, candidate }) => {
            if (!isSignalId(to)) throw new UserError(`Not a signal ID: ${to}`);

            pub.publish(to, "signal", {
                from: signalId,
                desc,
                candidate,
            });
        });

        socket.on("upload_start", async ({ mimeType, is_screen }, callback) => {
            if (!socket.data.user) return callback({ error: "Not logged in" });
            if (!socket.data.roomId)
                return callback({ error: "join_room has not been called" });
            const id = await db.createRecording({
                user: socket.data.user.id,
                mimeType,
                room: socket.data.roomId,
                is_screen,
            });
            recordings.add(Database.jsonSafe(id));
            callback({ id: Database.jsonSafe(id) });
            pub.publish(
                "upload",
                "start",
                Database.jsonSafe(socket.data.user.id),
                Database.jsonSafe(id),
                mimeType
            );
            await updateRoom("recordings");
        });

        socket.on("upload_chunk", (id, data) => {
            if (!socket.data.user) throw new UserError("Not logged in");

            pub.publish(
                "upload",
                "chunk",
                Database.jsonSafe(socket.data.user.id),
                id,
                data as Buffer
            );
        });

        socket.on("upload_stop", async (id) => {
            if (!socket.data.user) throw new UserError("Not logged in");

            pub.publish(
                "upload",
                "stop",
                Database.jsonSafe(socket.data.user.id),
                id
            );
            recordings.delete(id);
            await db.finishRecording(
                socket.data.user.id,
                Database.parseRecord("recording", id)
            );
            await updateRoom("recordings");
        });
    });
}
