import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server";
import type { Room, User } from "backend/database";

function isUser(val: User | Room): val is User {
    return val.id.tb === "user";
}

export const load: PageServerLoad = async ({ locals }) => {
    if (locals.user) {
        const { sent_to, recv_from } = await db.getContacts(locals.user.email);

        return {
            user: locals.user,
            sent_to: sent_to
                .filter(isUser)
                .map(({ email, id }) => ({ email, id: id.id })),
            recv_from: recv_from.map(({ email, id }) => ({ email, id: id.id })),
        };
    } else {
        return { user: null };
    }
};

export const actions: Actions = {
    create_room: async ({ request, locals }) => {
        if (!locals.user)
            throw error(401, "You must be logged in to create a room");
        const data = await request.formData();
        const name = data.get("name");
        if (typeof name !== "string") throw error(422);

        const id = await db.createRoom(name, locals.user.email);

        throw redirect(303, `/room/${id.id}`);
    },
};
