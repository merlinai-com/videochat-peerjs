import { browser } from "$app/environment";
import type { JsonSafe, UserId } from "backend/lib/database";
import type { MessageSocket } from "backend/lib/types";
import { uniq } from "backend/lib/utils";
import { readable, writable, type Readable, type Writable } from "svelte/store";

export function createStore<T>(
    store: Storage,
    opts: {
        init: T;
        key: string;
        version: number;
        rehydrate?: (val: T) => T;
    }
) {
    let val: T;
    const str = store.getItem(opts.key);
    if (str === null) {
        val = opts.init;
    } else {
        try {
            const { version, data } = JSON.parse(str);
            if (!Number.isSafeInteger(version) && version > 0)
                throw new Error("");
            if (version !== opts.version) throw new Error("Incorrect version");
            if (opts.rehydrate) {
                val = opts.rehydrate(data);
            } else {
                val = data;
            }
        } catch (err) {
            console.error(
                `Error deserializing stored value for ${opts.key}@${opts.version}:`,
                err
            );
            console.debug("Value:", str);
            val = opts.init;
        }
    }

    const s = writable(val);
    s.subscribe((val) => {
        store.setItem(
            opts.key,
            JSON.stringify({ version: opts.version, data: val })
        );
    });

    return s;
}

const defaultTimeStoreOptions = {
    interval: 5 * 1000,
    start: true,
};

/** A store which updates at regular intervals */
export interface TimeStore<T> extends Readable<T> {
    /** Pause updates */
    pause: () => void;

    /** Resume updates */
    resume: () => void;
}

/**
 * Create a store that updates regularly.
 * This is useful for time displays that need regular updating.
 */
export function createTimeStore<T>(
    init: (old?: T) => T,
    options?: Partial<typeof defaultTimeStoreOptions>
): TimeStore<T> {
    const opts = { ...defaultTimeStoreOptions, ...options };
    let running = opts.start;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let update: () => void;

    const store = readable(init(), (_set, upd) => {
        update = () => {
            if (timeout) return;

            timeout = setTimeout(() => {
                window.requestAnimationFrame(() => {
                    timeout = undefined;
                    if (running) {
                        upd(init);
                        update();
                    }
                });
            }, opts.interval);
        };

        if (browser && running) update();

        return () => {
            running = false;
        };
    });

    return {
        subscribe: store.subscribe,
        pause() {
            if (timeout) clearTimeout(timeout);
            timeout = undefined;
            running = false;
        },
        resume() {
            if (!running && browser) {
                running = true;
                update();
            }
        },
    };
}

export interface UserNameStore
    extends Writable<Record<JsonSafe<UserId>, string | undefined>> {
    request: (users: JsonSafe<UserId>[]) => void;
}

export function createUserNamesStore(socket?: MessageSocket): UserNameStore {
    const map: Record<JsonSafe<UserId>, string | undefined> = {};
    const store = writable(map);

    socket?.on("users", (users) => {
        for (const user of users) {
            map[user.id] = user.name;
        }
        if (users.length > 0) store.set(map);
    });

    return {
        ...store,
        request(ids) {
            ids = ids.filter((id) => map[id] == undefined);
            if (ids.length > 0) socket?.emit("request_users", uniq(ids));
        },
    };
}
