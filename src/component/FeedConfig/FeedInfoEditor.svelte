<script lang="ts">
  import { getFeed } from "../../api/rssFeedProxy.ts";
  import { feedInfos } from "./store/store.ts";

  // $: item = $feedInfos.items[$feedInfos.editingIndex];
  $: item = $feedInfos.editingItem;

  const confirm = async () => {
    const feed = await getFeed(item.url);

    item.title = feed.title;
    item.valid = feed.ok;

    if (!item.valid) {
      const enforce = window.confirm(
        "指定されたURLのフィードは取得できません。\nこのまま登録しますか？"
      );
      if (!enforce) return;
    }

    feedInfos.finishEdit();
  };

  const cancel = () => {
    feedInfos.cancelEdit();
  };

  const remove = () => {
    const enforce = window.confirm("本当に削除しますか？");
    if (!enforce) return;
    feedInfos.remove();
  };
</script>

{#if item}
<div class="input-field feed-url">
  <input type="url" required bind:value={item.url}>
</div>

<a href="#!" on:click={confirm}>
  <i class="material-icons">done</i>
</a>

<a href="#!" on:click={cancel}>
  <i class="material-icons">close</i>
</a>

<a href="#!" on:click={remove}>
  <i class="material-icons">delete_forever</i>
</a>
{/if}
