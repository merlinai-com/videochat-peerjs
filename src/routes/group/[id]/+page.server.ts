import { isUUID } from "backend/lib/types";
import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { db } from "$lib/server";
import { RecordId } from "surrealdb.js";
import { Database } from "backend/lib/database";

export const load: PageServerLoad = async ({ params }) => {
    if (!isUUID(params.id)) throw error(422, "Group id is not a UUID");

    const group = await db.queryGroup(new RecordId("group", params.id));

    return {
        group: Database.jsonSafe(group),
    };
};
