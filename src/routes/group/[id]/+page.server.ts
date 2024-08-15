import { database, getUser } from "$lib/server";
import { redirect } from "@sveltejs/kit";
import { Database } from "backend/lib/database";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
    const group = await database.queryGroup(Database.parseRecord("group", params.id));

    return {
        group: Database.jsonSafe(group),
    };
};

export const actions: Actions = {
    join: async ({ params, locals, cookies }) => {
        const user = await getUser(database, {
            ssoUser: locals.ssoUser,
            cookies,
            create: true,
        });
        await database.joinGroup(Database.parseRecord("group", params.id), user.id);

        throw redirect(303, "/");
    },
};
