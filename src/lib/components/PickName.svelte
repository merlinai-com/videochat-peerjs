<script lang="ts">
    import { enhance } from "$app/forms";
    import type { JsonSafe, User } from "backend/lib/database";

    export let required: boolean = false;
    export let user: JsonSafe<User>;
</script>

<form action="/?/set_name" method="POST" use:enhance>
    <label for="nickname">Name:</label>
    <input id="nickname" name="name" {required} value={user.name ?? ""} />
    <button type="submit">Update</button>
    {#if !required}
        <button type="submit" formaction="/?/clear_name">Clear</button>
    {/if}
</form>
