<script lang="ts">
    import type { PageData } from "../../routes/$types";

    export let data: PageData;
</script>

{#if data.ssoUser}
    <div>
        Logged in as {data.ssoUser.name} ({data.ssoUser.email})
        <a href={data.authURLs.logout}>Log out</a>
    </div>
{:else if data.user}
    <div>
        Logged in without SSO <a href={data.authURLs.login}>Link to SSO</a>
    </div>
{:else}
    <div>
        <a href={data.authURLs.login}>Log in</a>
    </div>
{/if}
