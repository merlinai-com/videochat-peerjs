<script lang="ts">
    import { enhance } from "$app/forms";
    import { page } from "$app/stores";
    import { onMount } from "svelte";

    export let data: App.PageData;

    let dialog: HTMLDialogElement;
    let url: URL;

    if (!data.acceptCookies)
        onMount(() => {
            dialog.showModal();
            url = new URL($page.url);
            url.searchParams.set("acceptCookies", "");
        });
</script>

<dialog bind:this={dialog}>
    <h1>Cookies</h1>
    This site requires cookies to function.
    <h2>Purposes</h2>
    <ul>
        <li><b>Necessary</b> - Cookies used to store login information</li>
    </ul>
    <form
        class="flex-col align-left"
        action="/?/accept_cookies"
        method="POST"
        use:enhance
        on:submit={() => dialog.close()}
    >
        <input name="redirect" value={$page.url} hidden readonly />
        <label class="flex-row gap-3" title="Allow all recordings by default">
            Allow recording:
            <input name="allow-recording" type="checkbox" />
        </label>
        <button type="submit">Accept</button>
    </form>
</dialog>

<style>
    dialog {
        margin: auto;
        padding: 1rem;
    }
</style>
