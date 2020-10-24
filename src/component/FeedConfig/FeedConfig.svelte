<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { getFeeds } from "../../api/rssFeedProxy.ts";
  import type { Ifeed, IfeedInfo } from "../../common/Feed";

  export let feedInfos: IfeedInfo[] = [];
  let valids = feedInfos.map(() => true);
  const dispatch = createEventDispatcher();

  const add = () => {
    feedInfos = [...feedInfos, {
      id: "",
      url: "",
    }];
    
    valids = [...valids, true];
  };

  const remove = (e) => {
    const removeIndex = parseInt(e.target.name, 10);
    feedInfos = feedInfos.filter((_, index) => index !== removeIndex);
    valids = valids.filter((_, index) => index !== removeIndex);
  };

  const checkValidation = async (feedInfos: IfeedInfo[]) => {
    const feeds = await getFeeds(feedInfos);
    valids = feeds.map((feed: Ifeed) => feed.ok);
  };

  const isAllValid = () => {
    return !(valids.includes(false));
  };

  const confirm = async () => {
    await checkValidation(feedInfos);

    if (isAllValid()) {
      dispatch("exec", { payload: "confirm" });
    } else {
      alert("不適切なFeed情報があります。");
    }
  };

  const getFeedInfos = () => {
    dispatch("exec", { payload: "getFeedInfos" });
  };

  onMount(async () => {
    await checkValidation(feedInfos);
  });
</script>

<style>
  .feed-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .url {
    flex-grow: 1;
  }

  .nav {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 1rem;
  }
</style>

<form>
  {#each feedInfos as feedInfo, i}
  <div class="feed-info">
    <input type="url" class="url" name={i} required bind:value={feedInfo.url}>

    {#if valids[i]}
    <span>○</span>
    {:else}
    <span>×</span>
    {/if}

    <input type="button" name={i} value="削除" on:click={remove}>
  </div>
  {/each}

  <div class="nav">
    <input type="button" value="追加" on:click={add}>
    <input type="button" value="確定" on:click={confirm}>
    <input type="button" value="サーバーから読込" on:click={getFeedInfos}>
  </div>
</form>
