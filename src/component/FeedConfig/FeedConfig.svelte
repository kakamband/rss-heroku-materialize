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

<form>
  {#each feedInfos as feedInfo, i}
    <div class="field has-addons">
      <div class="control is-expanded">
        <input class="input url" class:is-danger={!valids[i]} type="url" name={i} required bind:value={feedInfo.url}>
      </div>

      <div class="control">
        <a class="button" href={"#"} name={i} on:click={remove}>
          <!-- <i class="fas fa-trash"></i> -->
          ×
        </a>
      </div>
    </div>
  {/each}

  <div class="field is-grouped">
    <div class="control">
      <input class="button" type="button" value="追加" on:click={add}>
    </div>
    <div class="control">
      <input class="button" type="button" value="確定" on:click={confirm}>
    </div>
    <div class="control">
      <input class="button" type="button" value="サーバーから読込" on:click={getFeedInfos}>
    </div>
  </div>
</form>
