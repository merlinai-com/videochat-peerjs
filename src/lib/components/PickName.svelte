<script lang="ts">
    import { enhance } from "$app/forms";
    import { resetManager } from "$lib/socket";
    import type { JsonSafe, User } from "backend/lib/database";

    export let required: boolean = false;
    export let user: JsonSafe<User>;
</script>

<form
    action="/?/set_name"
    method="POST"
    use:enhance={() =>
        async ({ update }) => {
            await update();
            resetManager();
        }}
>
    <label>
        Name:
        <input
            name="name"
            {required}
            value={user.name ?? ""}
            placeholder="Enter nickname"
        />
    </label>
    <button type="submit">Submit</button>
    {#if !required}
        <button type="submit" formaction="/?/clear_name">Clear</button>
    {/if}
</form>
