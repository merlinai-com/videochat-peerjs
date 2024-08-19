import * as path from "node:path";
import { Database } from "./lib/database.js";
import { FileStore } from "./lib/file.js";
import type { PublisherEvents } from "./lib/types.js";
import type { Publisher, Subscriber } from "./publisher.js";

export function getUploadPath(uploadDir: string, id: string): string {
    return path.join(uploadDir, id);
}

export function createUploadSubscriber(
    db: Database,
    pub: Publisher<PublisherEvents>,
    store: FileStore
): Subscriber<"upload", PublisherEvents> {
    return pub.subscribe("upload", {
        async chunk(from, rawId, data) {
            const id = Database.parseRecord("recording", rawId);
            const recording = await db.select(id);
            if (Database.parseRecord("user", from).id === recording.user.id) {
                await store.appendChunk(recording.file_id, data);
            } else {
                console.error(
                    `Unable to append to recording: User ${id} is not the owner`
                );
            }
        },

        error(event, error) {
            console.log(`While handling ${event}:`, error);
        },
    });
}
