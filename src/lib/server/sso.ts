import { redirect, error } from "@sveltejs/kit";
import {
    SSO,
    type HTTPError,
    type Ok,
    type Redirect,
    type Cookies as SSOCookies,
} from "sso";
import type { Cookies as SvelteCookies } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { building } from "$app/environment";

function get(e: Record<string, string | undefined>, v: string): string {
    if (e[v] == undefined) throw new Error(`$${v} must be set`);
    return e[v];
}

if (!building && !env.SSO_ORIGIN) throw new Error("Set $SSO_ORIGIN");
export const sso = building
    ? (undefined as unknown as SSO)
    : new SSO(env.SSO_ORIGIN, {
          auth: {
              id: get(env, "SSO_ID"),
              key: get(env, "SSO_KEY"),
          },
      });

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

export function handle<T>(result: Ok<T> | HTTPError | Redirect): T {
    switch (result.type) {
        case "redirect":
            throw redirect(result.status as any, result.url);
        case "error":
            throw error(result.status, result.message);
        case "ok":
            return result.value;
    }
}
