<script lang="ts">
    import type { PageData } from "./$types";

    export let data: PageData;
</script>

<h1>{data.group.name}</h1>

<button on:click={() => window.alert("TODO")}>Join</button>
