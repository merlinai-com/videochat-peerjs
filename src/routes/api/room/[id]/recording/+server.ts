import { compressionLevel, database } from "$lib/server";
import { fileStore } from "$lib/server/file";
import { sso } from "$lib/server/sso";
import { error } from "@sveltejs/kit";
import {
    Database,
    type Group,
    type JsonSafe,
    type Recording,
    type Room,
    type UserId,
} from "backend/lib/database";
import { getZipPath, type FileStore } from "backend/lib/file";
import { getUserNames } from "backend/lib/login";
import { enumerate, formatPathDate, uniq } from "backend/lib/utils";
import JSZip from "jszip";
import type { SSO } from "sso";
import type { RequestHandler } from "./$types";

async function createZipFile(
    db: Database,
    sso: SSO,
    fileStore: FileStore,
    room: Room<Group, Recording>
): Promise<JSZip> {
    const zip = new JSZip();

    const names = await getUserNames(
        db,
        sso,
        uniq(room.recordings.map(({ user }) => user))
    );
    const nameCache: Record<
        JsonSafe<UserId>,
        string | undefined
    > = Object.fromEntries(
        names.map(({ id, name }) => [Database.jsonSafe(id), name])
    );

    for (const { value: recording, index } of enumerate(room.recordings)) {
        const file = await fileStore.readableNodeStream(recording.file_id);
        if (!file) {
            console.warn(
                `File not found for recording ${recording.id} - missing file id: ${recording.file_id}`
            );
            continue;
        }
        zip.file(getZipPath(recording, nameCache, index), file);
    }

    return zip;
}

export const GET: RequestHandler = async ({ params, locals }) => {
    // TODO: check the user has permission to download this recording

    const room = await database.queryRoom(
        Database.parseRecord("room", params.id)
    );
    if (!room) throw error(404, "Room not found");
    if (room.recordings.length === 0) throw error(404, "No recordings found");

    let zip;
    try {
        zip = await createZipFile(database, sso, fileStore, room);
    } catch (err) {
        console.error(`While creating zip download for ${params.id}:`, err);
        return error(500, "Internal error");
    }

    const zipStream = zip.generateInternalStream({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: {
            level: compressionLevel,
        },
    });
    zipStream.pause();
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            zipStream.on("data", (data) => {
                controller.enqueue(data);
                zipStream.pause();
            });
            zipStream.on("error", (error) => {
                console.error(
                    `While creating zip download for ${params.id}:`,
                    error
                );
                controller.close();
            });
            zipStream.on("end", () => controller.close());
        },
        pull() {
            zipStream.resume();
        },
        cancel() {
            zipStream.pause();
        },
        type: "bytes",
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename=${
                room.group.name
            } recordings ${formatPathDate(new Date())}.zip`,
        },
    });
};
