import { makeCookies, sso, handle as ssoHandle } from "$lib/server/sso";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { isEmail, type Email } from "backend/types";

const handleSSO: Handle = async ({ event, resolve }) => {
    const cookies = makeCookies(event.cookies);
    ssoHandle(await sso.handleRedirect(event.url, cookies));

    const { user, session } = ssoHandle(await sso.validateSession(cookies));
    if (user) {
        if (!isEmail(user.email)) {
            console.warn(
                `User email is not a valid email: ${user.email} ID: ${user.id}`
            );
        }
        event.locals.user = {
            ...user,
            email: user.email as Email,
        };
    } else {
        event.locals.user = null;
    }
    event.locals.session = session ?? null;

    return resolve(event);
};

export const handle: Handle = sequence(handleSSO);
