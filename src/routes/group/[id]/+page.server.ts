import { db, getUserId } from "$lib/server";
import { redirect } from "@sveltejs/kit";
import { Database } from "backend/lib/database";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
    const group = await db.queryGroup(Database.parseRecord("group", params.id));

    return {
        group: Database.jsonSafe(group),
    };
};

export const actions: Actions = {
    join: async ({ params, locals, cookies }) => {
        const user = await getUserId(db, {
            ssoUser: locals.ssoUser,
            cookies,
            create: true,
        });
        await db.joinGroup(Database.parseRecord("group", params.id), user.id);

        throw redirect(303, "/");
    },
};
