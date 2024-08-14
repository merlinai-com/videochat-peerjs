import { dev } from "$app/environment";
import { db, getUserId } from "$lib/server";
import { makeCookies, sso, handle as ssoHandle } from "$lib/server/sso";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

const handleSSO: Handle = async ({ event, resolve }) => {
    const cookies = makeCookies(event.cookies);
    ssoHandle(await sso.handleRedirect(event.url, cookies));

    const { user, session } = ssoHandle(await sso.validateSession(cookies));
    event.locals.ssoUser = user ?? null;
    event.locals.ssoSession = session ?? null;

    return resolve(event);
};

const handleUserId: Handle = async ({ event, resolve }) => {
    const userId = await getUserId(db, {
        ssoUser: event.locals.ssoUser,
        cookies: event.cookies,
        secure: !dev,
    });

    event.locals.user = userId;

    return resolve(event);
};

export const handle: Handle = sequence(handleSSO, handleUserId);
