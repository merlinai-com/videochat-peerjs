import { Database } from "backend/database";
import * as fs from "node:fs/promises";
import { env } from "$env/dynamic/private";
import * as path from "node:path";

export const db = await Database.init(env);

export const compressionLevel = 6;

export const uploadDir = path.resolve(env.UPLOAD_DIRECTORY ?? "./uploads");

const defaultIceServers: RTCIceServer[] = [{ urls: "stun.l.google.com:19302" }];

export let iceServers: RTCIceServer[];
try {
    iceServers = JSON.parse(
        await fs.readFile("./iceServers.json", { encoding: "utf8" })
    );
} catch (err) {
    iceServers = defaultIceServers;
}
