import { building } from "$app/environment";
import { env } from "$env/dynamic/private";
import { Database } from "backend/lib/database";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export { getUser as getUserId } from "backend/lib/login";

export const db = await Database.init(env, building);

export const compressionLevel = 6;

export const uploadDir = path.resolve(env.UPLOAD_DIRECTORY ?? "./uploads");

const defaultIceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
];

export let iceServers: RTCIceServer[];
try {
    iceServers = JSON.parse(
        await fs.readFile("./iceServers.json", { encoding: "utf8" })
    );
} catch (err) {
    iceServers = defaultIceServers;
}
