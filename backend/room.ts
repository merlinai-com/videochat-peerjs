import { Namespace } from "socket.io";
import { SSO } from "sso";
import { injectErrorHandler, UserError } from "./errorHandler.js";
import {
    Database,
    type JsonSafe,
    type RecordingId,
    type RoomId,
    type UserId,
} from "./lib/database.js";
import { getZipPath } from "./lib/file.js";
import { getUserNames } from "./lib/login.js";
import {
    isSignalId,
    type InterServerEvents,
    type PublisherEvents,
    type RoomClientToServerEvents,
    type RoomServerToClientEvents,
    type RoomSocketData,
    type SignalId,
} from "./lib/types.js";
import { omit } from "./lib/utils.js";
import { sendMessage } from "./message.js";
import { Publisher, type Listeners, type Subscriber } from "./publisher.js";

async function finishAndSendRecording(
    pub: Publisher<PublisherEvents>,
    db: Database,
    sso: SSO,
    id: RecordingId
): Promise<void> {
    await db.finishRecording(id);
    const recording = await db.select(id);
    const nameCache = await getUserNames(db, sso, [recording.user]);
    const attachment = await db.createAttachment(
        recording.file_id,
        getZipPath(
            recording,
            Object.fromEntries(
                nameCache.map(({ id, name }) => [Database.jsonSafe(id), name])
            )
        ),
        recording.mimeType,
        recording.group
    );
    await sendMessage(
        db,
        pub,
        recording.user,
        recording.group,
        recording.is_screen ? "recording (Screen Share)" : "recording",
        [attachment],
        true
    );
}

async function assertIsRecordingOwner(
    db: Database,
    user: UserId,
    recording: RecordingId
): Promise<void> {
    if (!db.isRecordingOwner(user, recording))
        throw new UserError("Not recording owner");
}

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
            connected(peerId, user) {
                if (connected && signalId !== peerId) {
                    socket.emit("connect_to", { id: peerId, polite: true });
                    pub.publish(peerId, "connect_to", {
                        id: signalId,
                        polite: false,
                        user,
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

        const userSub = pub.subscribe(signalId, { listeners: userListeners });

        if (socket.data.roomId) {
            roomSub = pub.subscribe(Database.jsonSafe(socket.data.roomId), {
                listeners: roomListeners,
            });
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
                    await finishAndSendRecording(
                        pub,
                        db,
                        sso,
                        Database.parseRecord("recording", id)
                    );
                }
                if (socket.data.roomId) await updateRoom("recordings");
            }
        });

        socket.on("join_room", async (roomId) => {
            if (!Database.isRecord("room", roomId))
                throw new UserError(`Not a room ID: ${roomId}`);

            socket.data.roomId = Database.parseRecord("room", roomId);

            const room = await db.queryRoom(socket.data.roomId);
            if (!room) throw new UserError(`Unknown room: ${roomId}`);

            roomSub = pub.subscribe(Database.jsonSafe(socket.data.roomId), {
                listeners: roomListeners,
            });
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
            roomSub?.publish(
                "connected",
                signalId,
                socket.data.user && Database.jsonSafe(socket.data.user.id)
            );
            connected = true;
        });

        socket.on("disconnect_from", () => {
            connected = false;
            if (!socket.data.roomId) throw new UserError("Not in a room");
            roomSub?.publish("disconnected", signalId);
        });

        socket.on("recording", (arg, callback) => {
            callback();
            if (!roomSub) throw new Error("roomSub is not set");
            roomSub.publish("recording", { ...arg, from: signalId });
        });

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

        /* =======
        Recordings
        ======= */

        const seenChunks: Record<
            JsonSafe<RecordingId>,
            { nextIndex: number }
        > = {};

        socket.on(
            "upload_start",
            async ({ mimeType, is_screen, startTime }, callback) => {
                if (!socket.data.user)
                    return callback({ error: "Not logged in" });
                if (!socket.data.roomId)
                    return callback({ error: "join_room has not been called" });

                const id = await db.createRecording({
                    user: socket.data.user.id,
                    mimeType,
                    room: socket.data.roomId,
                    is_screen,
                    startTime,
                });
                recordings.add(Database.jsonSafe(id));
                seenChunks[Database.jsonSafe(id)] = { nextIndex: 0 };
                callback({ id: Database.jsonSafe(id) });
                pub.publish(
                    "upload",
                    "start",
                    Database.jsonSafe(socket.data.user.id),
                    Database.jsonSafe(id),
                    mimeType
                );
                await updateRoom("recordings");
            }
        );

        socket.on("upload_chunk", async (id, data, index) => {
            if (!socket.data.user) throw new UserError("Not logged in");

            seenChunks[id] ??= { nextIndex: index };
            if (seenChunks[id].nextIndex > index) {
                // We have already got this chunk, so ignore it
                return;
            } else if (seenChunks[id].nextIndex < index) {
                // We have missed some chunks
                socket.emit(
                    "request_upload_chunk",
                    id,
                    seenChunks[id].nextIndex,
                    index
                );
                return;
            }

            seenChunks[id].nextIndex += 1;

            await assertIsRecordingOwner(
                db,
                socket.data.user.id,
                Database.parseRecord("recording", id)
            );

            pub.publish(
                "upload",
                "chunk",
                Database.jsonSafe(socket.data.user.id),
                id,
                data
            );
        });

        socket.on("upload_stop", async (id) => {
            if (!socket.data.user) throw new UserError("Not logged in");
            await assertIsRecordingOwner(
                db,
                socket.data.user.id,
                Database.parseRecord("recording", id)
            );

            pub.publish(
                "upload",
                "stop",
                Database.jsonSafe(socket.data.user.id),
                id
            );
            recordings.delete(id);

            await finishAndSendRecording(
                pub,
                db,
                sso,
                Database.parseRecord("recording", id)
            );
        });
    });
}
