import type { User, Session } from "sso";

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        interface Locals {
            user: User | null;
            session: Session | null;
        }
        interface PageData {
            authURLs: {
                login: string;
                logout: string;
            };
            user: User | null;
        }
        // interface PageState {}
        // interface Platform {}
    }
}

export {};
