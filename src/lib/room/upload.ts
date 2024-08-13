import type { Socket } from "socket.io-client";
import type {
    ClientToServerEvents,
    ServerToClientEvents,
    UUID,
} from "backend/lib/types";

export class Uploader {
    socket: Socket<ServerToClientEvents, ClientToServerEvents>;
    queue: { id: UUID; blob: Blob }[];

    constructor(socket: Socket<ServerToClientEvents, ClientToServerEvents>) {
        this.socket = socket;
        this.queue = [];
    }

    enqueue(id: UUID, blob: Blob) {
        if (this.queue.push({ id, blob }) === 1) {
            // this.start
        }
    }
}
