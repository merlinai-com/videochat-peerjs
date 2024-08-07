// place files you want to import through the `$lib` alias in this folder.

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
