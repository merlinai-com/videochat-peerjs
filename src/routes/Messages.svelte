<script lang="ts">
    import { onMount } from "svelte";
    import type { PageData } from "./$types";

    export let data: PageData;

    onMount(() => {});
</script>

{#if data.user}
    <div>
        <h1>Messages</h1>
        <ul>
            {#each [...data.sent_to, ...data.recv_from] as contact}
                <li>
                    {contact.email}
                </li>
            {/each}
        </ul>
    </div>
{/if}
