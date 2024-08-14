import type { EventsMap } from "@socket.io/component-emitter";
import { Socket } from "socket.io";
import { type Cookies, SSO, type User } from "sso";
import { Database, type User as DbUser } from "./lib/database.js";
import { getUser } from "./lib/login.js";

function mkCookies(socket: Socket): Cookies {
    if (!("cookies" in socket.request))
        throw new Error("Use cookie-parser middleware first");

    // @ts-ignore
    const rawCookies: Record<string, string> = socket.request.cookies;
    return {
        get(name) {
            return rawCookies[name];
        },
        set(_cookie) {},
    };
}

export function loginMiddleware(sso: SSO, db: Database) {
    return async (
        socket: Socket<
            EventsMap,
            EventsMap,
            EventsMap,
            { ssoUser?: User; user?: DbUser }
        >,
        next: () => void
    ) => {
        const cookies = mkCookies(socket);

        const res = await sso.validateSession(cookies);
        if (res.type !== "ok") return next();

        const { user } = res.value;
        socket.data.ssoUser = user ?? undefined;

        socket.data.user = await getUser(db, {
            ssoUser: socket.data.ssoUser,
            cookies,
        });

        next();
    };
}
