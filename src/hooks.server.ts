import { makeCookies, sso, handle as ssoHandle } from "$lib/server/sso";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

const handleSSO: Handle = async ({ event, resolve }) => {
    const cookies = makeCookies(event.cookies);
    ssoHandle(await sso.handleRedirect(event.url, cookies));

    const { user, session } = ssoHandle(await sso.validateSession(cookies));
    event.locals.user = user ?? null;
    event.locals.session = session ?? null;

    return resolve(event);
};

export const handle: Handle = sequence(handleSSO);
