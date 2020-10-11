<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { Authpack } from "@authpack/sdk";
  import type { Iuser } from "../common/Auth.ts";

  export let user: Iuser = null;
  let authpack = null;
//  let unlisten = null;
  let authLabel = "ログイン";
  const dispatch = createEventDispatcher();

  onMount(async () => {
    authpack = new Authpack({
		  key: "wga-client-key-687e9f9d7e762835aad651f8f",
    });
		
		const unlisten = authpack.listen((state) => {
      console.log(state);
      
			if (!state.ready) {
				console.log("Loading...");
			} else {
        if (state.bearer) {
          localStorage.setItem('bearer', state.bearer);
        }
          
				if (state.user) {
					console.log(state.user);
          if (!user || state.user.id !== user.id) {
            authLabel = "ログアウト";
            user = { id: state.user.id, name: state.user.name, email: state.user.email, };
            dispatch("exec", { payload: "login" });
          }
				} else {
					console.log("User not logged in.");
          if (user) {
            authLabel = "ログイン";
            user = null;
            dispatch("exec", { payload: "logout" });
          }
        }
			}
		});
  });

//  onDestroy(() => {
//    unlisten();
//  });

  const onOpen = () => {
    authpack.open()
  };
</script>

<input type="button" value={authLabel} on:click={onOpen}>
