import type { Email } from "backend/lib/types";
import type { User as SsoUser, Session } from "sso";
import type { User as DbUser } from "backend/lib/database";

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        interface Locals {
            ssoUser: SsoUser | null;
            ssoSession: Session | null;
            user?: DbUser;
        }
        interface PageData {
            authURLs: {
                login: string;
                logout: string;
            };
            ssoUser: User | null;
        }
        // interface PageState {}
        // interface Platform {}
    }
}

export {};
