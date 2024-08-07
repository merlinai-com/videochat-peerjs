import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server";
import { RecordId } from "surrealdb.js";

export const POST: RequestHandler = async ({ request, locals, params }) => {
    const roomId = params.id;
    const id = crypto.randomUUID();

    if (locals.user) {
        await db.joinRoom(locals.user.email, id, new RecordId("room", roomId));
        return json({ id });
    } else {
        return json({ id });
    }
};
