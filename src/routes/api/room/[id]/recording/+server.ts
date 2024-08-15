import { compressionLevel, database, uploadDir } from "$lib/server";
import { error } from "@sveltejs/kit";
import {
    Database,
    type Group,
    type JsonSafe,
    type Recording,
    type Room,
    type UserId,
} from "backend/lib/database";
import { getUploadPath } from "backend/upload";
import JSZip from "jszip";
import * as fs from "node:fs/promises";
import type { RequestHandler } from "./$types";
import { enumerate, uniq } from "backend/lib/utils";
import { sso } from "$lib/server/sso";
import { getUserNames } from "backend/lib/login";
import type { SSO } from "sso";

/** Return the path to put the recording in the zip archive */
function getZipPath(
    recording: Recording,
    nameCache: Record<JsonSafe<UserId>, string | undefined>,
    { index, digits }: { index: number; digits: number }
): string {
    let extension = "";
    if (recording.mimeType.startsWith("video/webm")) extension = ".webm";
    else if (recording.mimeType.startsWith("video/ogg")) extension = ".ogg";
    else if (recording.mimeType.startsWith("video/mp4")) extension = ".mp4";
    else console.warn(`Unrecognised MIME type: ${recording.mimeType}`);

    const name = nameCache[Database.jsonSafe(recording.user)] ?? "Unknown";

    const idx = index.toString().padStart(digits, "0");
    const time = recording.startTime.toISOString().replace(":", ".");
    return `${idx} ${name} ${time}${extension}`;
}

async function createZipFile(
    db: Database,
    sso: SSO,
    room: Room<Group, Recording>
): Promise<JSZip> {
    const zip = new JSZip();
    const digits = Math.floor(Math.log10(room.recordings.length)) + 1;

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
        zip.file(
            getZipPath(recording, nameCache, {
                index: index + 1,
                digits,
            }),
            fs.readFile(getUploadPath(uploadDir, recording.id.id as string))
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

    const zip = await createZipFile(database, sso, room);

    const zipStream = zip.generateInternalStream({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: {
            level: compressionLevel,
        },
    });
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            zipStream.on("data", (data) => {
                controller.enqueue(data);
                zipStream.pause();
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
            "Content-Disposition": `attachment; filename=${room.group.name} recordings.zip`,
        },
    });
};
