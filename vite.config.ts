import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import { injectSocketIO } from "./backend";
import * as dotenv from "dotenv";
import * as expand from "dotenv-expand";

export default defineConfig({
    plugins: [
        sveltekit(),
        {
            name: "sveltekit-socket-io",
            configureServer(server) {
                if (!server.httpServer)
                    throw new Error("server.httpServer is undefined");
                const env = {};
                const { parsed } = dotenv.config({ processEnv: env });
                expand.expand({ processEnv: env, parsed });
                injectSocketIO(server.httpServer, env);
            },
        },
    ],
    server: {
        fs: {
            allow: [searchForWorkspaceRoot(process.cwd())],
        },
    },
});
