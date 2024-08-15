import { Namespace } from "socket.io";
import { SSO } from "sso";
import { RecordId } from "surrealdb.js";
import { Database, type GroupId, type JsonSafe } from "./lib/database.js";
import { getUserNames } from "./lib/login.js";
import type {
    InterServerEvents,
    MessageClientToServerEvents,
    MessageServerToClientEvents,
    PublisherEvents,
    RoomSocketData,
} from "./lib/types.js";
import { type Listeners, Publisher, Subscriber } from "./publisher.js";

export function initMessageNamespace(
    ns: Namespace<
        MessageClientToServerEvents,
        MessageServerToClientEvents,
        InterServerEvents,
        RoomSocketData
    >,
    pub: Publisher<PublisherEvents>,
    db: Database,
    sso: SSO
) {
    ns.on("connection", (socket) => {
        const seenMessages = socket.data.seenMessages ?? new Set();
        let sub: Subscriber<JsonSafe<GroupId>, PublisherEvents> | undefined;

        const groupListeners: Listeners<JsonSafe<GroupId>, PublisherEvents> = {
            message(message) {
                socket.emit("messages", [message]);
            },

            user(id, name) {
                socket.emit("users", [{ id, name }]);
            },
        };

        if (socket.data.groupId)
            sub = pub.subscribe(
                Database.jsonSafe(socket.data.groupId),
                groupListeners
            );

        socket.on("subscribe", async (id) => {
            const groupId = new RecordId("group", id);
            socket.data.groupId = groupId;

            sub = pub.subscribe(
                Database.jsonSafe(socket.data.groupId),
                groupListeners
            );

            const messages = await db.getMessages(groupId);
            socket.emit("messages", Database.jsonSafe(messages));
        });

        socket.on("send", async (arg, callback) => {
            // We have already seen this message
            if (seenMessages.has(arg.msgId)) {
                callback();
                return;
            }

            if (!socket.data.user) {
                callback("Not logged in");
                return;
            }

            try {
                const m = await db.sendMessage(
                    socket.data.user.id,
                    new RecordId("group", arg.groupId),
                    arg.content
                );

                pub.publish(
                    Database.jsonSafe(new RecordId("group", arg.groupId)),
                    "message",
                    Database.jsonSafe(m)
                );

                callback();
            } catch (err) {
                console.debug(err);
                callback("Internal Error");
            }
        });

        socket.on("request_users", async (userIds) => {
            const toSend = await getUserNames(
                db,
                sso,
                userIds.map((id) => Database.parseRecord("user", id))
            );
            if (toSend.length > 0)
                socket.emit("users", Database.jsonSafe(toSend));
        });
    });
}
