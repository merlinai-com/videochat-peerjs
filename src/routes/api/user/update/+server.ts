import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { database } from "$lib/server";

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401, "Not logged in");
    const data = await request.json();
    if (typeof data != "object") throw error(422, "Expected object");
    if ("allow_recording" in data && typeof data.allow_recording != "boolean")
        throw error(422, "Expected allow_recording to be a boolean");

    await database.merge(locals.user.id, {
        allow_recording: data.allow_recording,
    });

    return json({});
};
