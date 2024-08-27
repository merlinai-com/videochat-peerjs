import { browser } from "$app/environment";
import type { Action } from "svelte/action";

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

declare global {
    interface Window {
        Zap: {
            debug: Record<string, any>;
            connectImmediately?: boolean;
        };
    }
}

if (browser) window.Zap ??= { debug: {} };

function isAtBottom(element: HTMLElement): boolean {
    return element.scrollTop >= element.scrollHeight - element.clientHeight - 5;
}

export const stayAtBottom: Action<
    HTMLElement,
    { behaviour?: "instant" | "smooth" | "auto" } | undefined
> = (element, options) => {
    let scroll = isAtBottom(element);
    let behavior = options?.behaviour ?? "instant";

    const onResize = () => {
        if (scroll) {
            element.scrollTo({
                top: element.scrollHeight,
                behavior,
            });
        }
    };

    const childObserver = new ResizeObserver(onResize);
    for (const child of element.children) childObserver.observe(child);

    const parentObserver = new MutationObserver((updates) => {
        for (const { addedNodes, removedNodes, type } of updates) {
            if (type !== "childList") continue;
            for (const added of addedNodes) {
                if (added instanceof HTMLElement) childObserver.observe(added);
            }
            for (const added of removedNodes) {
                if (added instanceof HTMLElement)
                    childObserver.unobserve(added);
            }
        }
        onResize();
    });
    parentObserver.observe(element, { childList: true });

    const onScroll = () => (scroll = isAtBottom(element));
    element.addEventListener("scroll", onScroll);

    return {
        update(parameter) {
            behavior = parameter?.behaviour ?? "instant";
        },
        destroy() {
            parentObserver.disconnect();
            childObserver.disconnect();
            element.removeEventListener("scroll", onScroll);
        },
    };
};
