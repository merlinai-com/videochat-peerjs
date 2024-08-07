import { error, redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";
import { db } from "$lib/server";

export const actions: Actions = {
    create_room: async ({ request, locals }) => {
        const data = await request.formData();
        const name = data.get("name");
        if (typeof name !== "string") throw error(422);

        const id = await db.createRoom(name, locals.user?.email);

        throw redirect(303, `/room/${id.id}`);
    },
};
