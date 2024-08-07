// @ts-check

import { config } from "dotenv";
import { expand } from "dotenv-expand";
import express from "express";
import { injectSocketIO } from "./build/backend/index.js";
expand(config());
const { handler } = await import("./build/handler.js");

const port = parseInt(process.env.PORT ?? "");
const host = process.env.HOST;
if (isNaN(port) || !host) throw new Error("Set $PORT and $HOST");

const app = express();
app.use(handler);

const server = app.listen(port, host, () => {
    console.log(`Listening on ${host}:${port}`);
});

injectSocketIO(server, process.env);
