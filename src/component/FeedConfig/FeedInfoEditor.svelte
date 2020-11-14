<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Ifeed, IfeedInfo } from "../../common/Feed";
  import { getFeed } from "../../api/rssFeedProxy.ts";

  export let feedInfo: IfeedInfo;
  const dispatch = createEventDispatcher();

  const confirm = async () => {
    const feed = await getFeed(feedInfo.url);

    feedInfo.title = feed.title;
    feedInfo.valid = feed.ok;

    if (!feedInfo.valid) {
      const enforce = confirm(
        "指定されたURLのフィードは取得できません。\nこのまま登録しますか？"
      );
      if (!enforce) return;
    }

    dispatch("finish-edit");
  };

  const remove = () => {
    const enforce = confirm("本当に削除しますか？");
    if (!enforce) return;
    dispatch("remove");
  };
</script>

<div class="input-field feed-url">
  <input type="url" required bind:value={feedInfo.url}>
</div>

<a href="#!" on:click={confirm}>
  <i class="material-icons">done</i>
</a>

<a href="#!" on:click={remove}>
  <i class="material-icons">delete_forever</i>
</a>
