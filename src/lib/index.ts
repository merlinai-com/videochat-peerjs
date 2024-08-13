// place files you want to import through the `$lib` alias in this folder.

import type { Email } from "backend/lib/types";

export async function fetchJson<T>(
    url: string | URL,
    init?: RequestInit,
    validate?: (val: any) => val is T
): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
        console.debug(res);
        throw new Error(
            `Unable to fetch ${url}: ${res.status} ${res.statusText}`
        );
    }
    const val = await res.json();
    if (validate && !validate(val))
        throw new Error(`Invalid result returned by ${url}: ${val}`);
    return val;
}

export function getOtherUser<U extends string | { id: string }>(
    us: [U, U],
    id: string
): U {
    const other = us.find((u) => (typeof u === "string" ? u : u.id) !== id);
    if (!other) throw new Error("Internal Error: Unable to find other user");
    return other;
}
