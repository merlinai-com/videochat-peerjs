import { attachmentLimits, database } from "$lib/server";
import { makeCookies, sso, handle as ssoHandle } from "$lib/server/sso";
import { error, type Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { daysToSeconds } from "backend/lib/utils";

/** Handle SSO acounts */
const handleSSO: Handle = async ({ event, resolve }) => {
    const cookies = makeCookies(event.cookies);
    ssoHandle(await sso.handleRedirect(event.url, cookies));

    const { user, session } = ssoHandle(await sso.validateSession(cookies));
    event.locals.ssoUser = user ?? null;
    event.locals.ssoSession = session ?? null;

    return resolve(event);
};

const handleUser: Handle = async ({ event, resolve }) => {
    if (event.locals.ssoUser) {
        event.locals.user = await database.getUser(event.locals.ssoUser.id);
    }

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

const handleAcceptedCookies: Handle = async ({ event, resolve }) => {
    const cookies = event.cookies;
    const dummyCookies = {
        get: () => undefined,
        getAll: () => [],
        set: () => {},
        delete: () => {},
        serialize: cookies.serialize,
    };

    const setCookie = () => {
        cookies.set("acceptCookies", "true", {
            path: "/",
            maxAge: daysToSeconds(365),
        });
    };
    const deleteCookie = () => {
        cookies.delete("acceptCookies", { path: "/" });
    };

    event.locals.acceptCookies =
        event.cookies.get("acceptCookies") != undefined;

    // If cookies have been accepted, increase the cookie age
    if (event.locals.acceptCookies) setCookie();

    if (!event.locals.acceptCookies) {
        // Prevent cookies from being set
        event.cookies = dummyCookies;
    }

    event.locals.setAcceptCookies = (accept) => {
        if (accept) {
            setCookie();
            event.cookies = cookies;
        } else {
            deleteCookie();
            event.cookies = dummyCookies;
        }
    };

    return resolve(event);
};

export const handle: Handle = sequence(
    handleAcceptedCookies,
    handleSSO,
    handleSizeLimit,
    handleUser
);
