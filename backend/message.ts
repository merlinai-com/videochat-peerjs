import { Namespace } from "socket.io";
import { SSO } from "sso";
import { RecordId } from "surrealdb.js";
import { Database, type GroupId, type JsonSafe } from "./lib/database.js";
import type {
    InterServerEvents,
    MessageClientToServerEvents,
    MessageServerToClientEvents,
    PublisherEvents,
    RoomSocketData,
} from "./lib/types.js";
import { select } from "./lib/utils.js";
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
            if (seenMessages.has(arg.msgId)) return;

            if (!socket.data.userId) return;

            const m = await db.sendMessage(
                socket.data.userId,
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
            const toSend = [];
            const users = await db.fetchAll(
                userIds.map((id) => Database.parseRecord("user", id))
            );

            // Users with a nickname
            toSend.push(...Database.jsonSafe(select(users, "name")));

            /** Users with sso_id without name */
            const ssoNoNick = select(
                users.filter((user) => !user.name),
                "sso_id"
            );
            const userIdBySsoId = Object.fromEntries(
                ssoNoNick.map(({ sso_id, id }) => [sso_id, id])
            );
            const ssoUsers = await sso.getUsers({
                ids: ssoNoNick.map(({ sso_id }) => sso_id),
            });

            const ssoWithName = select(ssoUsers, "name").map(
                ({ id, name }) => ({
                    id: userIdBySsoId[id],
                    name,
                })
            );
            toSend.push(...Database.jsonSafe(ssoWithName));

            if (toSend.length > 0) socket.emit("users", toSend);
        });
    });
}
