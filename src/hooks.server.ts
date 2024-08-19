import { dev } from "$app/environment";
import { database, getUser } from "$lib/server";
import { makeCookies, sso, handle as ssoHandle } from "$lib/server/sso";
import { error, type Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { attachmentLimits } from "$lib/server";

/** Handle SSO acounts */
const handleSSO: Handle = async ({ event, resolve }) => {
    const cookies = makeCookies(event.cookies);
    ssoHandle(await sso.handleRedirect(event.url, cookies));

    const { user, session } = ssoHandle(await sso.validateSession(cookies));
    event.locals.ssoUser = user ?? null;
    event.locals.ssoSession = session ?? null;

    return resolve(event);
};

/** Handle Zap accounts - which might be linked to an SSO account */
const handleUser: Handle = async ({ event, resolve }) => {
    const userId = await getUser(database, {
        ssoUser: event.locals.ssoUser,
        cookies: event.cookies,
        secure: !dev,
    });

    event.locals.user = userId;

    return resolve(event);
};

const handleSizeLimit: Handle = async ({ event, resolve }) => {
    const contentLength = event.request.headers.get("Content-Length");
    if (!contentLength) return resolve(event);

    const len = parseInt(contentLength);
    if (isNaN(len)) throw error(400, "Invalid Content-Length header");

    let sizeLimit;
    if (event.url.pathname == "/api/attachment/create") {
        sizeLimit = event.locals.ssoUser
            ? attachmentLimits.sso
            : attachmentLimits.guest;
    } else {
        sizeLimit = 100 * 1000;
    }

    if (len > sizeLimit) throw error(413);

    return resolve(event);
};

export const handle: Handle = sequence(handleSSO, handleSizeLimit, handleUser);
