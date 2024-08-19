import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { database } from "$lib/server";
import { Database } from "backend/lib/database";
import { fileStore } from "$lib/server/file";

// TODO: santizie file name and mime type
export const POST: RequestHandler = async ({ request }) => {
    const data = await request.formData();
    const file = data.get("file");
    const group = data.get("group");
    if (!(file instanceof File))
        throw error(422, "Expected `file` to be a file");
    if (typeof group !== "string" || !Database.isRecord("group", group))
        throw error(422, "Expected `group` to be a group id");

    const file_id = crypto.randomUUID();

    await fileStore.appendStream(file_id, file.stream());

    const attachmentId = await database.createAttachment(
        file_id,
        file.name,
        file.type,
        Database.parseRecord("group", group)
    );

    return json(Database.jsonSafe(attachmentId));
};
