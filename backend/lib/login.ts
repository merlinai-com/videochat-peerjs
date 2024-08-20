import type { Cookies as SvelteCookies } from "@sveltejs/kit";
import {
    Cookie,
    SSO,
    type Cookies as SsoCookies,
    type User as SsoUser,
} from "sso";
import { RecordId } from "surrealdb.js";
import { Database, type UserId, type User as DbUser } from "./database.js";
import { select } from "./utils.js";

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

function deleteCookie(
    cookies: SsoCookies,
    name: string,
    opts?: { secure?: boolean }
) {
    cookies.set(new Cookie(name, "", { ...cookieOptions, maxAge: 0, ...opts }));
}

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
    let { cookies } = opts;
    const create = opts.create ?? false;
    const secure = opts.secure ?? false;
    cookies = cookies && adaptCookies(cookies);
    const fromCookie = cookies?.get("zap-user");

    /** The user based on SSO login */
    const ssoUser = opts.ssoUser
        ? await db.getSsoUser(opts.ssoUser.id, create)
        : undefined;

    // TODO: sign keys?
    /** The user based on cookie login */
    let cookieUser = fromCookie
        ? await db.select(Database.parseRecord("user", fromCookie))
        : undefined;

    // If both are present, then migrate to SSO login
    if (ssoUser && cookieUser) {
        // Migrate cookie user to sso user
        await db.migrateUser(ssoUser.id, cookieUser.id);
        cookieUser = undefined;
    }

    // If no login method is used, and create is set then create a user
    if (!ssoUser && !cookieUser && create) {
        cookieUser = await db.createUser();
    }

    // If there is a cookie user, update the cookie
    if (cookieUser) {
        cookies?.set(
            new Cookie("zap-user", cookieUser.id.id as string, {
                ...cookieOptions,
                maxAge: cookieMaxAgeDays * 24 * 60 * 60,
                secure,
            })
        );
    }

    // If there was a cookie set, but there's no cookie user then delete the cookie
    if (!cookieUser && fromCookie) {
        cookies && deleteCookie(cookies, "zap-user", { secure });
    }

    return ssoUser || cookieUser;
}

export async function getUserNames(
    db: Database,
    sso: SSO,
    userIds: UserId[]
): Promise<{ id: UserId; name?: string }[]> {
    const names = [];
    const users = await db.selectAll(userIds);

    // Users with a nickname
    names.push(...select(users, "name"));

    /** Users with sso_id without name */
    const ssoNoNick = select(
        users.filter((user) => !user.name),
        "sso_id"
    );
    const userIdBySsoId = Object.fromEntries(
        ssoNoNick.map(({ sso_id, id }) => [sso_id, id])
    );
    const ssoUsers = await sso.getUsers({
        ids: ssoNoNick.map(({ sso_id }) => sso_id),
    });

    const ssoWithName = select(ssoUsers, "name").map(({ id, name }) => ({
        id: userIdBySsoId[id],
        name,
    }));
    names.push(...ssoWithName);

    return names;
}
