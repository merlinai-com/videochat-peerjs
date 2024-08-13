import { Namespace } from "socket.io";
import { RecordId } from "surrealdb.js";
import { Database, GroupId, JsonSafe } from "./lib/database.js";
import {
    InterServerEvents,
    MessageClientToServerEvents,
    MessageServerToClientEvents,
    PublisherEvents,
    RoomSocketData,
    UUID,
} from "./lib/types.js";
import { Listeners, Publisher, Subscriber } from "./publisher.js";
import { SSO } from "sso";

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
            if (seenMessages.has(arg.msgId)) return;

            if (!socket.data.user) return;

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
        });

        socket.on("request_users", async (userIds) => {
            // const
            // const users = await sso.getUsers({ ids: userIds });

        });
    });
}
