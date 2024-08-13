import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { db, getUserId } from "$lib/server";
import { isEmail, isUUID } from "backend/lib/types";
import { Database } from "backend/lib/database";
import { RecordId } from "surrealdb.js";
import { sso } from "$lib/server/sso";

export const load: PageServerLoad = async ({ locals, cookies }) => {
    const user = await getUserId(db, locals.user, cookies);

    if (locals.user)
        console.log(await sso.getUsers({ emails: [locals.user.email] }));

    if (user) {
        const groups = await db.getGroups(user);

        return {
            groups: groups && groups.map((g) => Database.jsonSafe(g)),
        };
    }
};

export const actions: Actions = {
    /** Create a group, then create a room from it */
    create_room: async ({ request, locals }) => {
        const user = await getUserId(db, locals.user);
        if (!user) throw error(401, "You must be logged in to create a room");

        const data = await request.formData();
        const name = data.get("name");
        if (typeof name !== "string") throw error(422);

        const group = await db.createGroup(name, user);
        const room = await db.createRoom(group, user);

        throw redirect(303, `/room/${room.id}`);
    },

    /** Create a group  */
    call_group: async ({ request, locals }) => {
        const user = await getUserId(db, locals.user, undefined, true);
        if (!user) throw error(401, "You must be logged in to create a group");

        const data = await request.formData();
        const group = data.get("group");
        if (typeof group !== "string" || !isUUID(group))
            throw error(422, `Invalid group: ${group}`);

        const room = await db.createRoom(new RecordId("group", group), user);

        throw redirect(303, `/room/${room.id}`);
    },

    create_group: async ({ request, locals }) => {
        const user = await getUserId(db, locals.user, undefined, true);
        if (!user) throw error(401, "You must be logged in to create a group");

        const data = await request.formData();
        const name = data.get("name");
        if (typeof name !== "string")
            throw error(422, "`name` must be a string");

        const id = await db.createGroup(name, user);

        return { action: "create_group" as const, id: Database.jsonSafe(id) };
    },

    create_p2p_group: async ({ request, locals }) => {
        const user = await getUserId(db, locals.user);
        if (!user) throw error(401, "You must be logged in to create a group");

        const data = await request.formData();
        const email = data.get("email");
        if (typeof email !== "string" || !isEmail(email))
            throw error(422, "`email` must be an email");

        // TODO
        const id = await db.getOrCreateP2PGroup(user, email);
        return {
            action: "create_p2p_group" as const,
            id: Database.jsonSafe(id),
        };
    },
};
