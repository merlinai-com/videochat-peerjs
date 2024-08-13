import { Cookies as SsoCookies, Cookie, User } from "sso";
import { Database, UserId } from "./database.js";
import { RecordId } from "surrealdb.js";
import { Cookies as SvelteCookies } from "@sveltejs/kit";

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

export async function getUserId(
    db: Database,
    user: User | undefined | null,
    cookies: SvelteCookies | SsoCookies,
    create: true
): Promise<UserId>;
export async function getUserId(
    db: Database,
    user: User | undefined | null,
    cookies?: SvelteCookies | SsoCookies,
    create?: boolean
): Promise<UserId | undefined>;
export async function getUserId(
    db: Database,
    user: User | undefined | null,
    cookies?: SvelteCookies | SsoCookies,
    create: boolean = false
): Promise<UserId | undefined> {
    cookies = cookies && adaptCookies(cookies);
    if (user) {
        return await db.getSsoUser(user.id, create);
    } else {
        // TODO: sign keys
        let user: UserId | undefined;
        const fromCookie = cookies?.get("zap-user");
        if (fromCookie) {
            user = new RecordId("user", fromCookie);
        } else if (create) {
            user = await db.createUser();
        }
        if (user && cookies) {
            cookies.set(
                new Cookie("zap-user", user.id as string, {
                    path: "/",
                    httpOnly: true,
                    maxAge: cookieMaxAgeDays * 24 * 60 * 60,
                })
            );
        }
        return user;
    }
}
