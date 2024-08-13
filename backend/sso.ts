import { Socket } from "socket.io";
import { Cookies, SSO, User } from "sso";
import { Database, UserId } from "./lib/database.js";
import { EventsMap } from "@socket.io/component-emitter";

export function ssoMiddleware(sso: SSO, db: Database) {
    return async (
        socket: Socket<
            EventsMap,
            EventsMap,
            EventsMap,
            { user?: Omit<User, "id"> & { id: UserId } }
        >,
        next: () => void
    ) => {
        // @ts-ignore
        const rawCookies: Record<string, string> = socket.request.cookies;
        const cookies: Cookies = {
            get(name) {
                return rawCookies[name];
            },
            set(_cookie) {},
        };
        const res = await sso.validateSession(cookies);
        if (res.type !== "ok") return next();

        const { user } = res.value;
        if (user) {
            socket.data.user = {
                ...user,
                id: Database.parseRecord("user", user.id),
            };
        }
        next();
    };
}
