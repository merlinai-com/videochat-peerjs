import { sso } from "$lib/server/sso";
import type { PageServerLoad } from "./$types";

export let load: PageServerLoad = async ({ url }) => {
    const redirect = url.searchParams.get("redirect") ?? "/";
    return {
        loginUrl: sso.loginURL(new URL(redirect, url.origin)).href,
    };
};
