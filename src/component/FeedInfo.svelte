<script lang="ts">
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher();
  export let feedUrls: string[] = [];

  const add = () => {
    feedUrls = [...feedUrls, ""];
  };

  const remove = (e) => {
    const removeIndex = parseInt(e.target.name, 10);
    feedUrls = feedUrls.filter((_, index) => index !== removeIndex);
  };

  const confirm = () => {
		dispatch("exec", { payload: "confirm" });
  };
</script>

<style>
  .feed-url {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .nav {
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }

  .nav-item {
    margin-right: 1em;
  }
</style>

<form>
  {#each feedUrls as feedUrl, i}
  <div class="feed-url">
    <input type="url" name={i} required bind:value={feedUrl}>
    <input type="button" name={i} value="削除" on:click={remove}>
  </div>
  {/each}

  <div class="nav">
    <input type="button" class="nav-item" value="追加" on:click={add}>
    <input type="button" class="nav-item" value="確定" on:click={confirm}>
  </div>
</form>
