<script lang="ts">
    import { enhance } from "$app/forms";
    import type { User } from "sso";

    export let user: User | null;
</script>

<div>
    <h1>Create a room</h1>
    {#if user}
        <form action="/?/create_room" method="POST" use:enhance>
            <label>
                Room:
                <input name="name" placeholder="Enter room name" required />
            </label>
            <button type="submit">Create Room</button>
        </form>
    {:else}
        <p>Log in to create a room</p>
    {/if}
</div>
