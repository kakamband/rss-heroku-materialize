<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import type { Iuser } from "../common/Auth.ts";
  import { init, signIn, signOut } from "../common/Auth.ts";

  export let user: Iuser = null;
  let authLabel = "サインイン";
  const dispatch = createEventDispatcher();

  const onAuthStateChanged = (authUser) => {
    if (authUser) {
      user = authUser;
      authLabel = user.name;
      dispatch("exec", { payload: "login" });
    } else {
      user = null;
      authLabel = "サインイン";
      dispatch("exec", { payload: "logout" });
    }
  };

  onMount(async () => {
    init(onAuthStateChanged);
  });
</script>

<div id="firebaseui-auth-container"></div>

{#if user}
  <span>{user.name}</span>
  <a href={"#"} on:click={signOut}>サインアウト</a>
{:else}
  <a href={"#"} on:click={signIn}>サインイン</a>
{/if}
