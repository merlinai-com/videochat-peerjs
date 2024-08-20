import { intervalToDuration, type Duration, type Interval } from "date-fns";
import { getHours } from "date-fns/getHours";
import { getMinutes } from "date-fns/getMinutes";
import { getSeconds } from "date-fns/getSeconds";

/* ================
Callback operations
================ */

async function attempt<Args extends any[]>(
    handle: (error: any) => void,
    cb: (...args: Args) => void | PromiseLike<void>,
    ...args: Args
) {
    try {
        await cb(...args);
    } catch (error) {
        handle(error);
    }
}

/* ============
List operations
============ */

/**
 * Select values that have a property set
 *
 * @param key The property to check for
 */
export function select<T extends object, K extends keyof T>(
    vals: T[],
    key: K
): (T & Record<K, NonNullable<T[K]>>)[] {
    function check(val: T): val is T & Record<K, NonNullable<T[K]>> {
        return val[key] != undefined;
    }

    return vals.filter<T & Record<K, NonNullable<T[K]>>>(check);
}

/**
 * Remove the given key(s) from a list of objects.
 * This does not modify any of the original values.
 */
export function omit<T extends object, K extends keyof T>(
    vals: T[],
    keys: K | K[]
): Omit<T, K>[] {
    if (!Array.isArray(keys)) keys = [keys];
    return vals.map((val) => {
        const v = { ...val };
        keys.forEach((key) => {
            delete v[key];
        });
        return v;
    });
}

export function enumerate<T>(vals: T[]): { index: number; value: T }[] {
    return vals.map((value, index) => ({ value, index }));
}

export function uniq<T>(vals: T[]): T[] {
    return [...new Set(vals)];
}

export function selectNonNull<T>(vals: T[]): NonNullable<T>[] {
    return vals.filter((val) => val != undefined);
}

/** Merge 2 sorted arrays ordering by the given key */
export function mergeBy<T>(xs: T[], ys: T[], key: keyof T): T[] {
    const out = [];
    let yi = 0;
    for (const x of xs) {
        for (; yi < ys.length && ys[yi][key] < x[key]; yi++) {
            out.push(ys[yi]);
        }
        out.push(x);
    }
    out.push(...ys.slice(yi));
    return out;
}

/* ==============
String operations
============== */

/** Split a string in to a list of words */
export function words(value: string): string[] {
    return value.split(/\s+/);
}

/**
 * Convert a string or list of strings to kebab case
 *
 * Note: This ignores multiple consecutive spaces and empty words
 */
export function kebabCase(ws: string | string[]): string {
    if (!Array.isArray(ws)) ws = words(ws);
    else ws = ws.filter((w) => w);

    return ws.join("-");
}

/**
 * Convert a string or list of stirngs to snake case
 *
 * Note: This ignores multiple consecutive spaces and empty words
 */
export function snakeCase(ws: string | string[]): string {
    if (!Array.isArray(ws)) ws = words(ws);
    else ws = ws.filter((w) => w);

    return ws.join("_");
}

/* ==============
Stream operations
============== */

/**
 * A stream that calls callbacks when events happen.
 *
 * - chunk - called when a chunk is available
 * - done - called when the stream is complete
 */
export function trackingStream<T>(callbacks?: {
    chunk?: (chunk: T) => void;
    done?: () => void;
}): TransformStream<T, T> {
    return new TransformStream({
        transform(chunk, controller) {
            controller.enqueue(chunk);
            if (callbacks?.chunk)
                attempt(console.error, () => callbacks!.chunk!(chunk));
        },
        flush() {
            if (callbacks?.done)
                attempt(console.error, () => callbacks!.done!());
        },
    });
}

export const bufferToUint8ArrayStream = new TransformStream<Buffer, Uint8Array>(
    {
        transform(chunk, controller) {
            controller.enqueue(new Uint8Array(chunk));
        },
    }
);

/* ===========
Time functions
=========== */

function timeSegment(x: number): string {
    return x.toString().padStart(2, "0");
}

/**
 * Format a duration or interval as a time.
 */
export function formatTime(duration: Duration | Interval): string {
    if ("start" in duration && "end" in duration) {
        duration = intervalToDuration(duration);
    }

    if (duration.hours && duration.hours >= 1) {
        return [
            duration.hours.toString(),
            timeSegment(duration.minutes ?? 0),
            timeSegment(duration.seconds ?? 0),
        ].join(":");
    } else {
        return [
            timeSegment(duration.minutes ?? 0),
            timeSegment(duration.seconds ?? 0),
        ].join(":");
    }
}

/**
 * Group values by their day.
 * Output is ordered by order each key first occurs in the input.
 */
export function groupBy<T, K>(
    values: T[],
    key: (val: T) => K
): { key: K; values: T[] }[] {
    const groups = new Map<K, T[]>();
    for (const val of values) {
        const k = key(val);
        let group = groups.get(k);
        if (!group) {
            group = [];
            groups.set(k, group);
        }
        group.push(val);
    }
    return [...groups].map(([key, values]) => ({ key, values }));
}

/* ==================
Environment variables
================== */

/**
 * Get an environment variable, throwing an error if it is undefined
 */
export function get(
    env: Record<string, string | undefined>,
    v: string,
    def?: string
): string {
    if (env[v] === undefined) {
        if (def !== undefined) return def;
        else throw new Error(`$${v} must be set`);
    }
    return env[v];
}

/** A map from suffixes to the sizes they represent */
const sizeSuffixes = {
    b: 1,
    k: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
};

type Size = `${number}${keyof typeof sizeSuffixes | ""}`;

/**
 * Get an environment variable as a number of bytes
 */
export function getSize(
    env: Record<string, string | undefined>,
    v: string,
    def?: Size | number
): number {
    const str = get(env, v, def?.toString());
    const suffix = str.at(-1);

    let scale, value;
    if (suffix && suffix in sizeSuffixes) {
        scale = (sizeSuffixes as Record<string, number>)[suffix];
        value = parseFloat(str.slice(0, str.length - 1));
    } else {
        scale = 1;
        value = parseFloat(str);
    }

    if (isNaN(value)) throw new Error(`Set $${v} to a valid size`);
    return Math.floor(scale * value);
}
