<script lang="ts">
    import { enhance } from "$app/forms";
    import { page } from "$app/stores";
    import { resetManager } from "$lib/socket";
    import { onMount } from "svelte";

    export let data: App.PageData;
    export let name: "permit" | "require" | undefined = undefined;
    export const acceptCookies = new Promise<void>((resolve, reject) => {
        if (data.acceptCookies) resolve();
        else
            onMount(() => {
                handlers = { resolve, reject };
                dialog.showModal();
                url = new URL($page.url);
                url.searchParams.set("acceptCookies", "");
            });
    });

    let dialog: HTMLDialogElement;
    let url: URL;

    let sso = false;

    let handlers: {
        resolve: () => void;
        reject: (error: any) => void;
    };
</script>

<dialog bind:this={dialog}>
    <div class="flex-col gap-3">
        <h1>Cookies</h1>
        This site requires cookies to function.
        <h2>Purposes</h2>
        <ul>
            <li><b>Necessary</b> - Cookies used to store login information</li>
        </ul>

        <form
            class="flex-col align-left gap-3"
            action="/?/accept_cookies"
            method="POST"
            use:enhance={() =>
                async ({ update }) => {
                    await update();
                    dialog.close();
                    resetManager();
                    handlers.resolve();
                }}
        >
            <input name="redirect" value={$page.url} hidden readonly />
            <label
                class="flex-row gap-3"
                title="Allow all recordings by default"
            >
                Allow recording:
                <input name="allow-recording" type="checkbox" />
            </label>
            {#if name}
                <div class="flex-row gap-3">
                    <label class="flex-row gap-3">
                        Name:
                        <input
                            name="name"
                            placeholder="Name"
                            required={name === "require" && !sso}
                            disabled={sso}
                        />
                    </label>
                    Or
                    <label class="flex-row gap-3">
                        sign in with SSO:
                        <input type="checkbox" name="sso" bind:checked={sso} />
                    </label>
                </div>
            {/if}
            <button type="submit">Accept Cookies</button>
            <span class={sso ? "" : "invisible"}>
                After clicking Accept, you will be redirected to
                {new URL(data.authURLs.login).origin}
                to log in
            </span>
        </form>
    </div>
</dialog>

<style>
    dialog {
        margin: auto;
        padding: 1rem;
    }
</style>
