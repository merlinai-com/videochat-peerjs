import { debug, type DebugTopic } from "$lib";
import type { MessageSocket, RoomSocket } from "backend/lib/types";
import { io, type Socket } from "socket.io-client";
import msgpackParser from "socket.io-msgpack-parser";

function initLogging(socket: Socket, topic: DebugTopic) {
    if (debug(topic)) {
        console.debug(`Added debugging for ${topic}`);
        socket.on("connect", () =>
            console.debug(
                `Socket connected with transport: ${socket.io.engine.transport.name}`
            )
        );
        socket.onAny((...args) => console.debug("recv", args));
        socket.onAnyOutgoing((...args) => console.debug("emit", args));
    }
}

export function room(): RoomSocket {
    const socket: RoomSocket = io("/room", { parser: msgpackParser });
    initLogging(socket, "socket/room");
    socket.on("error", (message, cause) => {
        if (cause) {
            console.error(
                `Error received on socket, in response to ${cause}: ${message}`
            );
        } else {
            console.error(`Error received on socket: ${message}`);
        }
    });
    socket.on("connect_error", (error) => {
        console.error("Unable to connect:", error);
    });
    return socket;
}

export function message(): MessageSocket {
    const socket = io("/message", { parser: msgpackParser });
    initLogging(socket, "socket/message");
    return socket;
}
