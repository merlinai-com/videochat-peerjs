import { debug, type DebugTopic } from "$lib";
import type { EventsMap } from "@socket.io/component-emitter";
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

const ensureEmitOptions = {
    timeoutStart: 1000,
    timeoutStep: 1000,
    timeoutMax: 10000,
};

type AllButLast<T> = T extends [...infer Init, infer _Last] ? Init : T;
type Last<T> = T extends [...infer _Init, infer Last] ? Last : T;
type FirstArg<T> = T extends (
    arg: infer Arg,
    ...args: infer _Rest
) => infer _Result
    ? Arg
    : never;

/**
 * emit with at least once reliability
 */
export async function ensureEmit<
    EmitEvents extends EventsMap,
    Ev extends keyof EmitEvents & (string | symbol)
>(
    socket: Socket<any, EmitEvents>,
    options: Partial<typeof ensureEmitOptions>,
    event: Ev,
    ...args: AllButLast<Parameters<EmitEvents[Ev]>>
): Promise<FirstArg<Last<Parameters<EmitEvents[Ev]>>>> {
    const opts = { ...ensureEmitOptions, ...options };
    let timeout = opts.timeoutStart;
    while (true) {
        try {
            // @ts-ignore
            return await socket.timeout(timeout).emitWithAck(event, ...args);
        } catch (error) {
            console.error(`Unable to emit event ${event.toString()}:`, error);
            timeout = Math.min(timeout + opts.timeoutStep, opts.timeoutMax);
        }
    }
}
