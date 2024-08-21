import { Namespace } from "socket.io";
import { SSO } from "sso";
import { injectErrorHandler } from "./errorHandler.js";
import { Database, type GroupId, type JsonSafe } from "./lib/database.js";
import { getUserNames } from "./lib/login.js";
import type {
    InterServerEvents,
    MessageClientToServerEvents,
    MessageServerToClientEvents,
    MessageSocketData,
    PublisherEvents,
} from "./lib/types.js";
import { type Listeners, Publisher, Subscriber } from "./publisher.js";

function ensureSub(
    pub: Publisher<PublisherEvents>,
    subs: Map<
        JsonSafe<GroupId>,
        Subscriber<JsonSafe<GroupId>, PublisherEvents>
    >,
    id: JsonSafe<GroupId>,
    listeners: Listeners<JsonSafe<GroupId>, PublisherEvents>
) {
    if (!subs.has(id)) {
        subs.set(
            id,
            pub.subscribe(id, {
                listeners,
                weak: true,
            })
        );
    }
}

export function initMessageNamespace(
    ns: Namespace<
        MessageClientToServerEvents,
        MessageServerToClientEvents,
        InterServerEvents,
        MessageSocketData
    >,
    pub: Publisher<PublisherEvents>,
    db: Database,
    sso: SSO
) {
    ns.on("connection", (socket) => {
        injectErrorHandler(socket, (event, error) => {
            console.error(`While handling ${event} for ${socket.id}:`, error);
            socket.emit("error", event, "Internal error");
        });

        const groupIds = socket.data.groupIds ?? new Set();

        const seenMessages = socket.data.seenMessages ?? new Set();
        let subs = new Map<
            JsonSafe<GroupId>,
            Subscriber<JsonSafe<GroupId>, PublisherEvents>
        >();

        const groupListeners: Listeners<JsonSafe<GroupId>, PublisherEvents> = {
            message(message) {
                socket.emit("messages", [message], false);
            },

            user(id, name) {
                socket.emit("users", [{ id, name }]);
            },
        };

        for (const id of groupIds) ensureSub(pub, subs, id, groupListeners);

        socket.on("disconnect", () => {
            // Remove all subscribers
            subs.forEach((sub) => sub.unsubscribe());
            subs.clear();
        });

        socket.on("subscribe", async (id) => {
            const groupId = Database.parseRecord("group", id);

            groupIds.add(Database.jsonSafe(groupId));
            ensureSub(pub, subs, id, groupListeners);

            const messages = await db.getMessages(groupId);
            socket.emit("messages", Database.jsonSafe(messages), true);
        });

        socket.on("send", async (arg, callback) => {
            // We have already seen this message
            if (seenMessages.has(arg.msgId)) return callback();
            if (!socket.data.user) return callback("Not logged in");

            try {
                const m = await db.sendMessage(
                    socket.data.user.id,
                    Database.parseRecord("group", arg.groupId),
                    arg.content,
                    arg.attachments.map((id) =>
                        Database.parseRecord("attachment", id)
                    )
                );

                pub.publish(
                    Database.jsonSafe(
                        Database.parseRecord("group", arg.groupId)
                    ),
                    "message",
                    Database.jsonSafe(m)
                );

                callback();
            } catch (err) {
                console.debug(`While handling send for ${socket.id}:`, err);
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
