import { io, type Socket } from "socket.io-client";
import type { RoomSocket, MessageSocket } from "backend/lib/types";
import msgpackParser from "socket.io-msgpack-parser";
import { browser } from "$app/environment";

function initLogging(socket: Socket) {
    if (browser && localStorage.getItem("debug")) {
        socket.onAny((...args) => console.debug("recv", args));
        socket.onAnyOutgoing((...args) => console.debug("emit", args));
    }
}

export function room(): RoomSocket {
    const socket = io("/room", { parser: msgpackParser });
    initLogging(socket);
    return socket;
}

export function message(): MessageSocket {
    const socket = io("/message", { parser: msgpackParser });
    initLogging(socket);
    return socket;
}
