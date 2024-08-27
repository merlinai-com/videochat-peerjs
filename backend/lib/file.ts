import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Writable } from "node:stream";
import {
    Database,
    type JsonSafe,
    type Recording,
    type UserId,
} from "./database.js";
import type { UUID } from "./types.js";
import {
    formatPathDate,
    kebabCase,
    snakeCase,
    trackingStream,
} from "./utils.js";

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

    private async openFile(id: UUID, flags: "a+"): Promise<fs.FileHandle>;
    private async openFile(
        id: UUID,
        flags: "r"
    ): Promise<fs.FileHandle | undefined>;
    private async openFile(
        id: UUID,
        flags: "a+" | "r"
    ): Promise<fs.FileHandle | undefined> {
        try {
            return await fs.open(this.filePath(id), flags);
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes("ENOENT") &&
                flags == "r"
            )
                return undefined;
            else throw error;
        }
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
    ): Promise<{ stream?: ReadableStream; length?: number }> {
        const handle = await this.openFile(id, "r");
        if (!handle) return {};

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

    async readableNodeStream(
        id: UUID
    ): Promise<NodeJS.ReadableStream | undefined> {
        const handle = await this.openFile(id, "r");
        return handle?.createReadStream();
    }
}

/** Return the path to put the recording in the zip archive */
export function getZipPath(
    recording: Recording,
    nameCache: Record<JsonSafe<UserId>, string | undefined>,
    index?: number
): string {
    let extension = "";
    if (recording.mimeType.startsWith("video/webm")) extension = ".webm";
    else if (recording.mimeType.startsWith("video/ogg")) extension = ".ogg";
    else if (recording.mimeType.startsWith("video/mp4")) extension = ".mp4";
    else console.warn(`Unrecognised MIME type: ${recording.mimeType}`);

    const name = nameCache[Database.jsonSafe(recording.user)] ?? "Unknown";
    const time = formatPathDate(recording.startTime);
    const screen = recording.is_screen ? "screenshare" : "";

    const path = [name, screen, time];
    if (index !== undefined) path.push(index.toString());
    return snakeCase(path.map(kebabCase)) + extension;
}
