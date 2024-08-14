<script lang="ts">
    import { enhance } from "$app/forms";
    import Login from "$lib/components/Login.svelte";
    import type { PageData } from "./$types";

    export let data: PageData;
</script>

<Login {data} />

<h1>{data.group.name}</h1>

<!-- TODO: Cookie notice -->

<form action="?/join" method="POST" use:enhance>
    <button type="submit">Join</button>
</form>
