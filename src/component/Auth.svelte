<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { Authpack } from "@authpack/sdk";
  import type { Iuser } from "../common/Auth.ts";

  export let user: Iuser = null;
  let authpack = null;
  let unlisten = null;
  let authLabel = "ログイン";
  const dispatch = createEventDispatcher();

  onMount(async () => {
    authpack = new Authpack({
		  key: "wga-client-key-687e9f9d7e762835aad651f8f",
    });
		
		unlisten = authpack.listen((state) => {
      console.log(state);
      
			if (state.ready) {
        if (state.bearer) {
          localStorage.setItem("bearer", state.bearer);
        }
          
				if (state.user) {
          if (!user || state.user.id !== user.id) {
            authLabel = "ログアウト";
            user = state.user;
            dispatch("exec", { payload: "login" });
          }
				} else {
          if (user) {
            authLabel = "ログイン";
            user = null;
            dispatch("exec", { payload: "logout" });
          }
        }
			} else {
				console.log("Loading...");
			}
		});
  });

  onDestroy(() => {
    unlisten();
  });

  const onClick = () => {
    if (user) authpack.exit();
    else authpack.open();
  };
</script>

<input type="button" value={authLabel} on:click={onClick}>
