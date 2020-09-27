<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let feedUrls: string[] = [];
  const dispatch = createEventDispatcher();

  const add = () => {
		dispatch("exec", { payload: "add" });
  };

  const confirm = () => {
		dispatch("exec", { payload: "confirm" });
  };
</script>

<form>
  {#each feedUrls as feedUrl, i}
  <input type="url" name={i} required bind:value={feedUrl}>
  {/each}

  <input type="button" value="追加" on:click={add}>
  <input type="button" value="確定" on:click={confirm}>
</form>
