<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { getFeeds } from "../../api/rssFeedProxy.ts";
  import type { Ifeed, IfeedInfo } from "../../common/Feed";

  export let feedInfos: IfeedInfo[] = [];
  let valids = feedInfos.map(() => true);
  const dispatch = createEventDispatcher();

  const add = () => {
    feedInfos = [
      ...feedInfos,
      {
        id: "",
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

  let src = -1;

  const moveList = dst => {
    console.log(`moveList source=${src} target=${dst}`);

    if (src < 0) return;

    if (dst < 0) {
      const sourceElms = feedInfos.splice(src, 1);
      feedInfos = [sourceElms[0], ...feedInfos];
    } else if (dst >= feedInfos.length) {
      const sourceElms = feedInfos.splice(src, 1);
      feedInfos = [...feedInfos, sourceElms[0]];
    } else {
      feedInfos = feedInfos.reduce((result, currentElm, idx) => {
        if (idx !== src) result.push(currentElm);
        if (idx === dst) result.push(feedInfos[src]);
        return result;
      }, []);
    }

    src = -1;
  };

  const dragStarted = (e, idx) => {
    console.log("dragStarted", idx);

    e.dataTransfer.effectAllowed = "move";
    src = idx;
  };

  const draggingOver = (e, idx) => {
    console.log("draggingOver", idx);

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const dropped = (e, idx) => {
    console.log("dropped", idx);

    e.preventDefault();
    e.stopPropagation();
    moveList(idx);
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

  .dummy-contents {
    list-style-type: none;
    height: 1rem;
  }
</style>

<ul>
<li class="dummy-contents"
  on:dragover={(e) => draggingOver(e, -1)} 
  on:drop={(e) => dropped(e, -1)}
>
</li>

{#each feedInfos as feedInfo, i}
  <li 
    class="feed-info"
    draggable="true" 
    on:dragstart={(e) => dragStarted(e, i)} 
    on:dragover={(e) => draggingOver(e, i)} 
    on:drop={(e) => dropped(e, i)}
  >
    <div class="input-field feed-url">
      <input class:invalid={!valids[i]} type="url" required bind:value={feedInfo.url}>
    </div>

    <a href="#!" on:click={() => { remove(i) }}>
      <i class="material-icons">delete_forever</i>
    </a>

    <span>
      Drag!
    </span>
  </li>
{/each}

<li class="dummy-contents"
  on:dragover={(e) => draggingOver(e, feedInfos.length)} 
  on:drop={(e) => dropped(e, feedInfos.length)}
>
</li>
</ul>

<div class="">
  <input class="btn-flat" type="button" value="追加" on:click={add}>
  <input class="btn-flat" type="button" value="確定" on:click={confirm}>
  <input class="btn-flat" type="button" value="サーバーから読込" on:click={getFeedInfos}>
</div>
