import { building } from "$app/environment";
import { env } from "$env/dynamic/private";
import { Database } from "backend/lib/database";
import { getSize } from "backend/lib/utils";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export { getUser } from "backend/lib/login";

export const database = await Database.init(env, building);

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

export const attachmentLimits = {
    guest: getSize(env, "GUEST_ATTACHMENT_LIMIT", "100k"),
    sso: getSize(env, "SSO_ATTACHMENT_LIMIT", "100M"),
};
