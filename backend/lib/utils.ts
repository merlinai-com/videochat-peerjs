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
