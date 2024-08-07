import type { Database } from "./database.js";
import type { Publisher, Subscriber } from "./publisher.js";
import type { PublisherEvents } from "./types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export function getUploadPath(uploadDir: string, id: string): string {
    return path.join(uploadDir, id);
}

export function createUploadSubscriber(
    db: Database,
    pub: Publisher<PublisherEvents>,
    uploadDir: string
): Subscriber<"upload", PublisherEvents> {
    if (!path.isAbsolute(uploadDir))
        throw new Error(
            `Expected uploadDir to be absolute. Got "${uploadDir}"`
        );

    return pub.subscribe("upload", {
        async chunk(from, id, data) {
            if (await db.isRecordingOwner(from, id)) {
                const fp = getUploadPath(uploadDir, id.id as string);
                try {
                    await fs.appendFile(fp, data);
                } catch (err) {
                    if (
                        err instanceof Error &&
                        err.message.includes("ENOENT")
                    ) {
                        await fs.mkdir(path.dirname(fp));
                        await fs.appendFile(fp, data);
                    } else {
                        throw err;
                    }
                }
            }
        },
    });
}
