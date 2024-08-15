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
