<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Authpack } from "@authpack/sdk";
  import type { Iuser } from "../common/Auth.ts";

  export let user: Iuser = null;
  let authpack = null;
  let unlisten = null;
  let authLabel = "ログイン";

  onMount(async () => {
    authpack = new Authpack({
		  key: "wga-client-key-687e9f9d7e762835aad651f8f",
    });
		
		unlisten = authpack.listen((state) => {
			if (!state.ready) {
//				console.log("Loading...");
			} else {
				if (state.user) {
          authLabel = "ログアウト";
          user = { id: state.user.id, name: state.user.name, email: state.user.email, };
//					console.log(state.user);
				} else {
          authLabel = "ログイン";
          user = null;
//					console.log("User not logged in.");
				}
			}
		});
  });

  onDestroy(() => {
    unlisten();
  });

  const onOpen = () => {
    authpack.open()
  };
</script>

<input type="button" value={authLabel} on:click={onOpen}>
