<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { getFeeds } from "../api/rssFeedProxy.ts";
  import type { Icontent, Ifeed } from "../common/Feed";

  export let feedUrls: string[] = [];
  let valids = feedUrls.map(() => true);
  const dispatch = createEventDispatcher();

  const add = () => {
    feedUrls = [...feedUrls, ""];
  };

  const remove = (e) => {
    const removeIndex = parseInt(e.target.name, 10);
    feedUrls = feedUrls.filter((_, index) => index !== removeIndex);
  };

  const checkValidation = async (feedUrls: string[]) => {
    const feeds = await getFeeds(feedUrls);
    valids = feeds.map((feed: Ifeed) => feed.ok);
  };

  const isAllValid = () => {
    return !(valids.includes(false));
  };

  const confirm = async () => {
    await checkValidation(feedUrls);

    if (isAllValid()) {
      dispatch("exec", { payload: "confirm" });
    } else {
      alert("不適切なURLがあります。");
    }
  };

  onMount(async () => {
    await checkValidation(feedUrls);
  });
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

    {#if valids[i]}
    <span>○</span>
    {:else}
    <span>×</span>
    {/if}
    
    <input type="button" name={i} value="削除" on:click={remove}>
  </div>
  {/each}

  <div class="nav">
    <input type="button" class="nav-item" value="追加" on:click={add}>
    <input type="button" class="nav-item" value="確定" on:click={confirm}>
  </div>
</form>
