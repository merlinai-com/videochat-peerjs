import { sso } from "$lib/server/sso";
import type { PageServerLoad } from "./$types";

export let load: PageServerLoad = async ({ url }) => {
    const redirect = url.searchParams.get("redirect") ?? "/";
    const redirectUrl = new URL("/auth/complete-login", url.origin);
    redirectUrl.searchParams.set("redirect", redirect);
    return {
        loginUrl: sso.loginURL(redirectUrl).href,
    };
};
