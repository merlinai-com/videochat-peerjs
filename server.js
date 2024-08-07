// @ts-check

import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { createServer } from "node:http";
// import express from "express";
import { injectSocketIO } from "./build/backend/index.js";
expand(config());
const { handler } = await import("./build/handler.js");

const port = parseInt(process.env.PORT ?? "");
const host = process.env.HOST;
if (isNaN(port) || !host) throw new Error("Set $PORT and $HOST");

const server = createServer(handler);

injectSocketIO(server, process.env);

server.listen(port, host, () => {
    console.log(`Listening on ${host}:${port}`);
});
