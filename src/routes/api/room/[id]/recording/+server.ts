import { compressionLevel, db, uploadDir } from "$lib/server";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import JSZip from "jszip";
import type { Recording } from "backend/database";
import * as fs from "node:fs/promises";
import { getUploadPath } from "backend/upload";
import type { UUID } from "backend/types";

function getZipPath(
    recording: Recording,
    { index, digits }: { index: number; digits: number }
): string {
    let extension = "";
    if (recording.mimeType.startsWith("video/webm")) extension = ".webm";
    else if (recording.mimeType.startsWith("video/ogg")) extension = ".ogg";
    else if (recording.mimeType.startsWith("video/mp4")) extension = ".mp4";
    else console.warn(`Unrecognised MIME type: ${recording.mimeType}`);

    const name = recording.userName ?? "Unknown";
    const idx = index.toString().padStart(digits, "0");
    const time = recording.startTime.toISOString().replace(":", ".");
    return `${idx} ${name} ${time}${extension}`;
}

export const GET: RequestHandler = async ({ params, locals }) => {
    // TODO: check the user has permission to download this recording

    const room = await db.queryRoom(params.id);
    if (!room) throw error(404, "Room not found");
    if (room.recordings.length === 0) throw error(404, "No recordings found");

    const zip = new JSZip();
    const digits = Math.floor(Math.log10(room.recordings.length)) + 1;
    room.recordings.forEach((recording, index) => {
        zip.file(
            getZipPath(recording, { index: index + 1, digits }),
            fs.readFile(getUploadPath(uploadDir, recording.id.id as UUID))
        );
    });

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
            "Content-Disposition": `attachment; filename=${room.name} recordings.zip`,
        },
    });
};
