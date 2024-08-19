import { UUID } from "./types.js";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import TTLCache from "@isaacs/ttlcache";
import { Writable, Readable } from "node:stream";
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

    private async openFile(id: UUID): Promise<fs.FileHandle> {
        let handle;
        try {
            handle = await fs.open(this.filePath(id), "a+");
        } catch (error) {
            if (error instanceof Error && error.message.includes("ENOENT")) {
                await fs.mkdir(this.uploadDir);
                handle = await fs.open(this.filePath(id));
            } else {
                throw error;
            }
        }

        return handle;
    }

    async appendChunk(id: UUID, data: Uint8Array): Promise<void> {
        const handle = await this.openFile(id);
        await handle.writeFile(data);
        await handle.close();
    }

    async appendStream(
        id: UUID,
        stream: ReadableStream<Uint8Array>
    ): Promise<void> {
        const handle = await this.openFile(id);
        const write = handle.createWriteStream();
        await stream.pipeTo(Writable.toWeb(write));
    }

    async readableStream(id: UUID): Promise<ReadableStream> {
        const handle = await this.openFile(id);
        const stream = handle.readableWebStream({
            type: "bytes",
        }) as ReadableStream;
        return stream.pipeThrough(
            trackingStream({
                async done() {
                    console.log("close");
                    await handle.close();
                },
            })
        );
    }
}
