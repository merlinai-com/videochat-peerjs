import { Database } from "./lib/database.js";
import type { Publisher, Subscriber } from "./publisher.js";
import type { PublisherEvents } from "./lib/types.js";
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
        async chunk(from, rawId, data) {
            const id = Database.parseRecord("recording", rawId);
            if (
                await db.isRecordingOwner(
                    Database.parseRecord("user", from),
                    id
                )
            ) {
                const fp = getUploadPath(uploadDir, id.id as string);
                try {
                    await fs.appendFile(fp, data);
                } catch (err) {
                    // If the upload directory doesn't exist, then try to create it
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
            } else {
                console.error("Not owner");
            }
        },

        async error(event, error) {
            console.log(`While handling ${event}:`, error);
        },
    });
}
