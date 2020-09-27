<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let feedUrls: string[] = [];
  const dispatch = createEventDispatcher();

  const exec = () => {
		dispatch("exec");
  };
</script>

<form>
  {#each feedUrls as feedUrl, i}
  <input type="url" name={i} required bind:value={feedUrl}>
  {/each}

  <input type="button" value="確定" on:click={exec}>
</form>
