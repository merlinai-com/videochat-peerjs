import { db, iceServers } from "$lib/server";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { isUUID } from "backend/lib/types";
import { RecordId } from "surrealdb.js";

export const load: PageServerLoad = async ({ params, locals }) => {
    const room = await db.queryRoom(new RecordId("room", params.id));
    if (!isUUID(params.id)) throw error(422, "Room id is not a UUID");
    if (!room) throw error(404, "Room not found");
    return {
        roomName: room.group.name,
        roomId: params.id,
        iceServers,
        isOwner: !!locals.user && room.owner.email == locals.user.email,
    };
};
