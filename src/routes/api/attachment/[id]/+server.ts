import { Database } from "backend/lib/database";
import type { RequestHandler } from "./$types";
import { database } from "$lib/server";
import { fileStore } from "$lib/server/file";
import { error } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ params }) => {
    const id = Database.parseRecord("attachment", params.id);
    const attachment = await database.select(id);

    const { stream, length } = await fileStore.readableStream(
        attachment.file_id
    );

    if (stream == undefined || length == undefined)
        throw error(404, "Attachment not found");

    return new Response(stream, {
        headers: {
            "Content-Type": attachment.mime_type,
            "Content-Disposition": `attachment; filename=${attachment.name}`,
            "Content-Length": length.toString(),
        },
    });
};
