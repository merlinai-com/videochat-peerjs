import { database } from "$lib/server";
import { error, redirect } from "@sveltejs/kit";
import { Database } from "backend/lib/database";
import { ResponseError } from "surrealdb.js";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
    const group = await database.queryGroup(
        Database.parseRecord("group", params.id)
    );

    return {
        group: Database.jsonSafe(group),
    };
};

export const actions: Actions = {
    join: async ({ params, locals }) => {
        if (!locals.ssoUser)
            throw error(401, "You must be logged in to join a group");
        const user = await database.getUser(locals.ssoUser.id, true);

        try {
            await database.joinGroup(
                Database.parseRecord("group", params.id),
                user.id
            );
        } catch (error) {
            // TODO: check error is "already joined"
            if (!(error instanceof ResponseError)) {
                throw error;
            }
        }

        throw redirect(303, "/");
    },
};
