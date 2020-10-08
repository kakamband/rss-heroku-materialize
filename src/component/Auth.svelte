<script lang="ts">
  import { onMount } from "svelte";
  import { Authpack } from "@authpack/sdk";

  let authpack = null;
  let authLabel = "ログイン";

  onMount(async () => {
    authpack = new Authpack({
		  key: "wga-client-key-687e9f9d7e762835aad651f8f",
    });
		
		const unlisten = authpack.listen((state) => {
			if (!state.ready) {
				console.log("Loading...");
			} else {
				if (state.user) {
          authLabel = "ログアウト";
					console.log(state.user);
				} else {
          authLabel = "ログイン";
					console.log("User not logged in.");
				}
			}
		});
  });

  const onOpen = () => {
    authpack.open()
  };
</script>

<input type="button" value={authLabel} on:click={onOpen}>
