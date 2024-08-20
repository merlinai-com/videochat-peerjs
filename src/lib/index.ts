import { browser } from "$app/environment";

export async function fetchJson<T>(
    url: string | URL,
    init?: RequestInit,
    validate?: (val: any) => val is T
): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
        console.groupCollapsed(`Fetch error for ${url}`);
        console.debug(res);
        if (res.bodyUsed) {
            console.debug(res.text());
        }
        console.groupEnd();
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

const debugTopics = ["socket/message", "socket/room"] as const;
export type DebugTopic = (typeof debugTopics)[number];

export function debug(topic: DebugTopic): boolean {
    // If there's no access to localStorage, then no debug
    if (!browser) return false;

    const item = localStorage.getItem("debug");
    // If debug is not set, then don't debug
    if (item == null) return false;

    /** The list of topics */
    const topics = item.split(",");
    return topics.some((t) => topic.startsWith(t));
}
