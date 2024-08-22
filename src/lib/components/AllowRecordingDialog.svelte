<script lang="ts">
    import { createEventDispatcher } from "svelte";

    const emit = createEventDispatcher<{
        allow: undefined;
        deny: undefined;
    }>();

    export const show = () => dialog.showModal();
    export const request = (options?: { signal?: AbortSignal }) =>
        new Promise<void>((resolve, reject) => {
            const signal = options?.signal;
            if (signal?.aborted) reject(signal.reason);

            if (signal) {
                const handler = {
                    resolve: () => {
                        signal.removeEventListener("abort", handler.onAbort);
                        resolve();
                    },
                    reject: (error: any) => {
                        signal.removeEventListener("abort", handler.onAbort);
                        reject(error);
                    },
                    onAbort: () => {
                        handlers.delete(handler);
                        handler.reject({ error: signal.reason });
                    },
                };
                signal.addEventListener("abort", handler.onAbort);
                handlers.add(handler);
            } else {
                handlers.add({ resolve, reject });
            }

            dialog.showModal();
        });

    let handlers = new Set<{
        resolve: () => void;
        reject: (error?: any) => void;
    }>();
    let remember = false;

    function invokeAll(type: "resolve" | "reject") {
        const copy = handlers;
        handlers = new Set();

        const error =
            type === "reject" ? new Error("Recording denied") : undefined;
        for (const handler of copy) {
            handler[type](error);
        }
    }

    async function allow() {
        emit("allow");
        invokeAll("resolve");
        if (remember) {
            try {
                const res = await fetch("/api/user/update", {
                    method: "POST",
                    body: JSON.stringify({ allow_recording: true }),
                });
                if (!res.ok) {
                    console.debug(res);
                    throw new Error(await res.text());
                }
            } catch (error) {
                console.error(error);
            }
        }
    }

    function deny() {
        emit("deny");
        invokeAll("reject");
    }

    let dialog: HTMLDialogElement;
</script>

<dialog bind:this={dialog}>
    <form class="flex=col" method="dialog">
        A recording has started. Recordings are stored on Zap servers and can be
        accessed after the call has ended.
        <div class="flex-row gap-3">
            <button type="submit" on:click={allow}> Allow recording </button>

            <button type="submit" on:click={deny}> Deny recording </button>

            <label class="flex-row">
                Always allow recordings:
                <input type="checkbox" bind:checked={remember} />
            </label>
        </div>
    </form>
</dialog>

<style>
    dialog {
        margin: auto;
        padding: 1rem;
    }
</style>
