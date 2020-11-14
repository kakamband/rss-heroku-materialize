<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { flip } from "svelte/animate";
  import { dndzone } from "svelte-dnd-action";
  import { v4 as uuidv4 } from "uuid";

  import { getFeeds } from "../../api/rssFeedProxy.ts";
  import type { Ifeed, IfeedInfo } from "../../common/Feed";
  import FeedInfoEditor from "./FeedInfoEditor.svelte";

  export let feedInfos: IfeedInfo[] = [];
  const dispatch = createEventDispatcher();
  let editingIndex = -1;

  const add = () => {
    const id = uuidv4();

    feedInfos = [
      ...feedInfos,
      {
        id,
        url: "",
        title: "",
        valid: true
      }
    ];

    editingIndex = feedInfos.length - 1;
  };

  const remove = () => {
    feedInfos = feedInfos.filter((_, index) => index !== editingIndex);
    editingIndex = -1;
  };

  const confirm = async () => {
    dispatch("exec", { payload: "confirm" });
  };

  const getFeedInfos = () => {
    dispatch("exec", { payload: "getFeedInfos" });
  };

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

  .feed-title {
    flex-grow: 1;
  }

  .invalid {
    background-color: red;
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

      <span class="feed-title" class:invalid={!feedInfo.valid}>
        {#if feedInfo.valid}
          {feedInfo.title}
        {:else}
          {feedInfo.url}
        {/if}
      </span>

      <a href="#!" on:click={() => editingIndex = i}>
        <i class="material-icons">edit</i>
      </a>
    </li>
  {/each}
</ul>

<div class="">
  <input class="btn-flat" type="button" value="追加" on:click={add}>
  <input class="btn-flat" type="button" value="確定" on:click={confirm}>
  <input class="btn-flat" type="button" value="サーバーから読込" on:click={getFeedInfos}>
</div>

{#if editingIndex >= 0}
  <FeedInfoEditor 
    feedInfo={feedInfos[editingIndex]}
    on:finish-edit={() => editingIndex = -1}
    on:remove={remove}
  />
{/if}
