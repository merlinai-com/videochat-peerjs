import { redirect, error } from "@sveltejs/kit";
import {
    SSO,
    type SSOResult,
    type Cookies as SSOCookies,
    type User,
} from "sso";
import type { Cookies as SvelteCookies } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { building } from "$app/environment";

if (!building && !env.SSO_ORIGIN) throw new Error("Set $SSO_ORIGIN");
export const sso = building
    ? (undefined as unknown as SSO)
    : new SSO(env.SSO_ORIGIN);

export function makeCookies(cookies: SvelteCookies): SSOCookies {
    return {
        get(name) {
            return cookies.get(name) ?? null;
        },
        set(cookie) {
            cookies.set(cookie.name, cookie.value, {
                path: ".",
                ...cookie.attributes,
            });
        },
    };
}

export function handle<T>(result: SSOResult<T>): T {
    switch (result.type) {
        case "redirect":
            throw redirect(result.status as any, result.url);
        case "error":
            throw error(result.status, result.message);
        case "ok":
            return result.value;
    }
}
