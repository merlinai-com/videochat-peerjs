import { writable } from "svelte/store";

function createStore<T>(
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


