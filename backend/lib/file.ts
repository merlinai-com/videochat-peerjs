import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Writable } from "node:stream";
import type { UUID } from "./types.js";
import { trackingStream } from "./utils.js";

export class FileStore {
    /** A cache of file handles */
    private uploadDir: string;

    constructor(uploadDir: string) {
        this.uploadDir = uploadDir;
    }

    static init(env: Record<string, string | undefined>): FileStore {
        const uploadDir = path.resolve(env.UPLOAD_DIRECTORY ?? "./uploads");

        return new FileStore(uploadDir);
    }

    private filePath(id: UUID): string {
        return path.join(this.uploadDir, id);
    }

    private async openFile(
        id: UUID,
        flags: "a+" | "r"
    ): Promise<fs.FileHandle> {
        let handle;
        try {
            handle = await fs.open(this.filePath(id), flags);
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes("ENOENT") &&
                flags === "a+"
            ) {
                await fs.mkdir(this.uploadDir);
                handle = await fs.open(this.filePath(id));
            } else {
                throw error;
            }
        }

        return handle;
    }

    async appendChunk(id: UUID, data: Uint8Array): Promise<void> {
        const handle = await this.openFile(id, "a+");
        await handle.writeFile(data);
        await handle.close();
    }

    async appendStream(
        id: UUID,
        stream: ReadableStream<Uint8Array>
    ): Promise<void> {
        const handle = await this.openFile(id, "a+");
        const write = handle.createWriteStream();
        await stream.pipeTo(Writable.toWeb(write));
    }

    async readableStream(
        id: UUID
    ): Promise<{ stream: ReadableStream; length: number }> {
        const handle = await this.openFile(id, "r");
        const stat = await handle.stat();
        const stream = handle.readableWebStream({
            type: "bytes",
        }) as ReadableStream;
        return {
            stream: stream.pipeThrough(
                trackingStream({
                    async done() {
                        await handle.close();
                    },
                })
            ),
            length: stat.size,
        };
    }

    async readableNodeStream(id: UUID): Promise<NodeJS.ReadableStream> {
        const handle = await this.openFile(id, "r");
        return handle.createReadStream();
    }
}
