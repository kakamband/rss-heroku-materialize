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

<a class="waves-effect waves-light modal-trigger" href="#modal1">
  <i class="material-icons">account_circle</i>
</a>

<div id="modal1" class="modal">
  <div class="modal-content teal lighten-2">
    <span>
      {#if user}
        {user.name}
      {:else}
        サインインして下さい。
      {/if}
    </span>

    <div id={authContainerId}></div>
  </div>

  <div class="modal-footer teal lighten-2">
    {#if user}
      <a href={"#"} on:click={signOut} class="btn-flat">サインアウト</a>
    {:else}
      <a href={"#"} on:click={signIn} class="btn-flat">サインイン</a>
    {/if}

    <a href={"#!"} class="modal-close waves-effect waves-green btn-flat">
      閉じる
    </a>
  </div>
</div>
