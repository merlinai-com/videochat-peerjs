import { sso } from "$lib/server/sso";
import { Database } from "backend/lib/database";
// import type { ServerLoad } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
    return {
        authURLs: {
            login: sso.loginURL(url).href,
            // login:
            //     "/auth/login?" +
            //     new URLSearchParams({ redirect: url.pathname }),
            logout: sso.logoutURL(url).href,
        },
        ssoUser: locals.ssoUser,
        user: Database.jsonSafe(locals.user),
    };
};
