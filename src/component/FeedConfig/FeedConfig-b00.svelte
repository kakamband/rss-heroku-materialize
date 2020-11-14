<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { flip } from "svelte/animate";
  import { dndzone } from "svelte-dnd-action";
  import { v4 as uuidv4 } from "uuid";

  import { getFeeds } from "../../api/rssFeedProxy.ts";
  import type { Ifeed, IfeedInfo } from "../../common/Feed";

  export let feedInfos: IfeedInfo[] = [];
  let valids = feedInfos.map(() => true);
  const dispatch = createEventDispatcher();

  const add = () => {
    const id = uuidv4();

    feedInfos = [
      ...feedInfos,
      {
        id,
        url: ""
      }
    ];

    valids = [...valids, true];
  };

  const remove = (removeIndex: number) => {
    feedInfos = feedInfos.filter((_, index) => index !== removeIndex);
    valids = valids.filter((_, index) => index !== removeIndex);
  };

  const checkValidation = async (feedInfos: IfeedInfo[]) => {
    const feeds = await getFeeds(feedInfos);
    valids = feeds.map((feed: Ifeed) => feed.ok);
  };

  const isAllValid = () => {
    return !valids.includes(false);
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

  const flipDurationMs = 300;
  const handleDnd = e => {
    feedInfos = e.detail.items;
  };
</script>

<style>
  .feed-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .feed-url {
    flex-grow: 1;
  }
</style>

<ul
  use:dndzone={{ items: feedInfos, flipDurationMs }} 
  on:consider={handleDnd} 
  on:finalize={handleDnd}
>
  {#each feedInfos as feedInfo, i (feedInfo.id)}
    <li 
      class="feed-info"
      animate:flip={{ duration: flipDurationMs }}
    >
      <span>
        <i class="material-icons">menu</i>
      </span>

      <div class="input-field feed-url">
        <input class:invalid={!valids[i]} type="url" required bind:value={feedInfo.url}>
      </div>

      <a href="#!" on:click={() => { remove(i) }}>
        <i class="material-icons">delete_forever</i>
      </a>
    </li>
  {/each}
</ul>

<div class="">
  <input class="btn-flat" type="button" value="追加" on:click={add}>
  <input class="btn-flat" type="button" value="確定" on:click={confirm}>
  <input class="btn-flat" type="button" value="サーバーから読込" on:click={getFeedInfos}>
</div>
