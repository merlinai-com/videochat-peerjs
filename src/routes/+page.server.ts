import { dev } from "$app/environment";
import { database, getUser } from "$lib/server";
import { sso } from "$lib/server/sso";
import { error, redirect } from "@sveltejs/kit";
import { Database } from "backend/lib/database";
import { isEmail } from "backend/lib/types";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
    if (locals.user) {
        const groups = await database.getGroups(locals.user.id);

        return {
            groups: groups && groups.map((g) => Database.jsonSafe(g)),
        };
    }
};

export const actions: Actions = {
    /** Create a group, then create a room from it */
    create_room: async ({ request, locals }) => {
        const user = await getUser(database, { ssoUser: locals.ssoUser });
        if (!user) throw error(401, "You must be logged in to create a room");

        const data = await request.formData();
        const name = data.get("name");
        if (typeof name !== "string") throw error(422);

        const group = await database.createGroup(name, user.id);
        const room = await database.createRoom(group.id, user.id);

        throw redirect(303, `/room/${room.id}`);
    },

    /** Create a group  */
    call_group: async ({ request, locals }) => {
        const user = await getUser(database, {
            ssoUser: locals.ssoUser,
            create: true,
            secure: !dev,
        });
        if (!user) throw error(401, "You must be logged in to create a group");

        const data = await request.formData();
        const group = data.get("group");
        if (typeof group !== "string")
            throw error(
                422,
                `Expected \`group\` to be a string. Got ${JSON.stringify(
                    group
                )}`
            );

        const room = await database.createRoom(
            Database.parseRecord("group", group),
            user.id
        );

        throw redirect(303, `/room/${room.id}`);
    },

    create_group: async ({ request, locals }) => {
        const user = await getUser(database, {
            ssoUser: locals.ssoUser,
            create: true,
            secure: !dev,
        });
        if (!user) throw error(401, "You must be logged in to create a group");

        const data = await request.formData();
        const name = data.get("name");
        if (typeof name !== "string")
            throw error(422, "`name` must be a string");

        const group = await database.createGroup(name, user.id);

        return {
            action: "create_group" as const,
            group: Database.jsonSafe(group),
        };
    },

    create_p2p_group: async ({ request, locals }) => {
        const user1 = await getUser(database, {
            ssoUser: locals.ssoUser,
            create: true,
            secure: !dev,
        });
        if (!user1) throw error(401, "You must be logged in to create a group");

        const data = await request.formData();
        const email = data.get("email");
        if (typeof email !== "string" || !isEmail(email))
            throw error(422, "`email` must be an email");

        // TODO
        const users = await sso.getUsers({ emails: [email] });
        const ssoUser = users.find((u) => u.email === email);
        if (!ssoUser) return { action: "create_p2p_group" as const };

        const user2 = await database.getSsoUser(ssoUser.id, false);
        if (!user2) throw error(404, "User not found");

        const id = await database.getOrCreateP2PGroup(user1.id, user2.id);
        return {
            action: "create_p2p_group" as const,
            id: Database.jsonSafe(id),
        };
    },

    set_name: async ({ request, locals, cookies }) => {
        const user = await getUser(database, {
            ssoUser: locals.ssoUser,
            cookies: cookies,
            create: true,
        });
        const data = await request.formData();
        const name = data.get("name");
        if (typeof name !== "string")
            throw error(422, "Expected `name` to be a string");
        await database.setUserName(user.id, name);
    },

    clear_name: async ({ locals, cookies }) => {
        const user = await getUser(database, {
            ssoUser: locals.ssoUser,
            create: false,
        });
        if (user) await database.setUserName(user.id, undefined);
    },
};
