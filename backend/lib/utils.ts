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
