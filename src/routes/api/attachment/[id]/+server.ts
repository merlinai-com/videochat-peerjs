import { Database } from "backend/lib/database";
import type { RequestHandler } from "./$types";
import { database } from "$lib/server";
import { fileStore } from "$lib/server/file";

export const GET: RequestHandler = async ({ params }) => {
    const id = Database.parseRecord("attachment", params.id);
    const attachment = await database.select(id);

    const stream = await fileStore.readableStream(attachment.file_id);

    return new Response(stream, {
        headers: {
            "Content-Type": attachment.mimeType,
            "Content-Disposition": `attachment; filename=${attachment.name}`
        }
    })
};
