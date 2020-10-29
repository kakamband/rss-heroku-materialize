<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import type { Iuser, TauthStateChangeCallback } from "../common/Auth.ts";
  import { init, signIn, signOut } from "../common/Auth.ts";

  export let user: Iuser = null;
  const dispatch = createEventDispatcher();
  const authContainerId = "firebaseui-auth-container";

  const onAuthStateChanged: TauthStateChangeCallback = (authUser: Iuser) => {
    if (authUser) {
      user = authUser;
      dispatch("exec", { payload: "login" });
    } else {
      user = null;
      dispatch("exec", { payload: "logout" });
    }
  };

  onMount(async () => {
    init(onAuthStateChanged, authContainerId);
  });
</script>

<div id={authContainerId}></div>

{#if user}
  <span>{user.name}</span>
  <a href={"#"} on:click={signOut}>サインアウト</a>
{:else}
  <a href={"#"} on:click={signIn}>サインイン</a>
{/if}
