<script lang="ts">
    import { enhance } from "$app/forms";
    import CookieNotice from "$lib/components/CookieNotice.svelte";
    import Login from "$lib/components/Login.svelte";
    import type { PageData } from "./$types";

    export let data: PageData;
</script>

<CookieNotice {data} name="require" />

<Login {data} />

<h1>{data.group.name}</h1>

<form action="?/join" method="POST" use:enhance>
    <button type="submit">Join</button>
</form>
