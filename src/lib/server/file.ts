import { env } from "$env/dynamic/private";
import { FileStore } from "backend/lib/file";

export const fileStore = FileStore.init(env);
