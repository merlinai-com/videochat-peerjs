import { io as rawIo, type Socket as RawSocket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "backend/types";
import msgpackParser from "socket.io-msgpack-parser";

export type Socket = RawSocket<ServerToClientEvents, ClientToServerEvents>;

export function io(): Socket {
    return rawIo({
        parser: msgpackParser,
    });
}
