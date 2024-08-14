import type { Cookies as SvelteCookies } from "@sveltejs/kit";
import { Cookie, type Cookies as SsoCookies, type User as SsoUser } from "sso";
import { RecordId } from "surrealdb.js";
import { Database, type User as DbUser } from "./database.js";

/** The max age for user ID cookie in days */
const cookieMaxAgeDays = 30;

function adaptCookies(cookies: SvelteCookies | SsoCookies): SsoCookies {
    if ("getAll" in cookies) {
        return {
            get: (name) => cookies.get(name) ?? null,
            set: (cookie) =>
                cookies.set(cookie.name, cookie.value, {
                    ...cookie.attributes,
                    path: cookie.attributes.path ?? "/",
                }),
        };
    } else {
        return cookies;
    }
}

const cookieOptions = {
    path: "/",
    httpOnly: true,
};

export async function getUser(
    db: Database,
    opts: {
        ssoUser?: SsoUser | null;
        cookies: SvelteCookies | SsoCookies;
        create: true;
        secure?: boolean;
    }
): Promise<DbUser>;
export async function getUser(
    db: Database,
    opts: {
        ssoUser?: SsoUser | null;
        cookies?: SvelteCookies | SsoCookies;
        create?: boolean;
        secure?: boolean;
    }
): Promise<DbUser | undefined>;
export async function getUser(
    db: Database,
    opts: {
        ssoUser?: SsoUser | null;
        cookies?: SvelteCookies | SsoCookies;
        create?: boolean;
        secure?: boolean;
    }
): Promise<DbUser | undefined> {
    let { ssoUser, cookies } = opts;
    const create = opts.create ?? false;
    const secure = opts.secure ?? false;
    if (ssoUser) {
        return await db.getSsoUser(ssoUser.id, create);
    } else if (cookies) {
        cookies = adaptCookies(cookies);
        // TODO: sign keys
        let user: DbUser | undefined;
        const fromCookie = cookies.get("zap-user");
        if (fromCookie)
            user = await db.surreal.select<DbUser>(
                new RecordId("user", fromCookie)
            );

        if (!user && create) user = await db.createUser();

        if (user) {
            cookies.set(
                new Cookie("zap-user", user.id.id as string, {
                    ...cookieOptions,
                    maxAge: cookieMaxAgeDays * 24 * 60 * 60,
                    secure,
                })
            );
        } else if (!user && fromCookie) {
            cookies.set(
                new Cookie("zap-user", "", {
                    ...cookieOptions,
                    maxAge: 0,
                    secure,
                })
            );
        }
        return user;
    } else {
        return;
    }
}
