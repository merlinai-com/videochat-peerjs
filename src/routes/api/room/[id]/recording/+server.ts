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
import type { FileStore } from "backend/lib/file";
import { getUserNames } from "backend/lib/login";
import { enumerate, kebabCase, snakeCase, uniq } from "backend/lib/utils";
import { format } from "date-fns/format";
import JSZip from "jszip";
import { Readable } from "node:stream";
import type { SSO } from "sso";
import type { RequestHandler } from "./$types";

/** Format a date in a format suitable for a path */
function formatDate(date: Date): string {
    return format(date, "yyyy-MM-dd_HH.mm.ss");
}

/** Return the path to put the recording in the zip archive */
function getZipPath(
    recording: Recording,
    nameCache: Record<JsonSafe<UserId>, string | undefined>,
    index: number
): string {
    let extension = "";
    if (recording.mimeType.startsWith("video/webm")) extension = ".webm";
    else if (recording.mimeType.startsWith("video/ogg")) extension = ".ogg";
    else if (recording.mimeType.startsWith("video/mp4")) extension = ".mp4";
    else console.warn(`Unrecognised MIME type: ${recording.mimeType}`);

    const name = nameCache[Database.jsonSafe(recording.user)] ?? "Unknown";
    const time = formatDate(recording.startTime);
    const screen = recording.is_screen ? "screenshare" : "";

    return (
        snakeCase([name, screen, time, index.toString()].map(kebabCase)) +
        extension
    );
}

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
        const file = await fileStore.readableStream(recording.file_id);
        zip.file(
            getZipPath(recording, nameCache, index),
            Readable.fromWeb(file as any)
        );
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
            } recordings ${formatDate(new Date())}.zip`,
        },
    });
};
