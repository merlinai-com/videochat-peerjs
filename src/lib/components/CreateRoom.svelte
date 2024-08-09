<script lang="ts">
    import { enhance } from "$app/forms";
    import type { User } from "sso";

    export let user: User | null;
</script>

<h1>Create a room</h1>
{#if user}
    <form action="/?/create_room" method="POST" use:enhance>
        <label for="room-name">Room:</label>
        <input
            id="room-name"
            name="name"
            placeholder="Enter room name"
            required
        />
        <button type="submit">Create Room</button>
    </form>
{:else}
    <p>Log in to create a room</p>
{/if}
