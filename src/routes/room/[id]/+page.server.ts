import { db, iceServers } from "$lib/server";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
    const room = await db.queryRoom(params.id);
    if (!room) throw error(404, "Room not found");
    return {
        roomName: room.name,
        roomId: params.id,
        iceServers,
        hasOwner: !!room.owner,
        isOwner:
            !!room.owner &&
            !!locals.user &&
            room.owner.email == locals.user?.email,
    };
};
