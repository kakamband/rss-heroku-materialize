<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let feedUrls: string[] = [];
  const dispatch = createEventDispatcher();

  const onchange = (e) => {
    console.log(e.target.name, e.target.value);

//    feedUrls = [...feedUrls];
  };

  const exec = () => {
		dispatch("exec", {
			text: 'Hello!'
		});
  }
</script>

<form>
  {#each feedUrls as feedUrl, i}
  <input type="url" name={i} required bind:value={feedUrl} on:change={onchange}>
  {/each}

  <input type="button" value="確定" on:click={exec}>
</form>
