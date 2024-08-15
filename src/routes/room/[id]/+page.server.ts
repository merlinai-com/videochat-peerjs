import { database, iceServers } from "$lib/server";
import { error } from "@sveltejs/kit";
import { Database } from "backend/lib/database";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
    const room = await database.queryRoom(Database.parseRecord("room", params.id));
    if (!room) throw error(404, "Room not found");
    return {
        roomName: room.group.name,
        roomId: Database.jsonSafe(room.id),
        group: Database.jsonSafe(room.group),
        iceServers,
        isOwner: !!locals.ssoUser && room.owner.id == locals.user?.id.id,
    };
};
