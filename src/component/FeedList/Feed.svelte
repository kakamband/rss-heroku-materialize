<script lang="ts">
  import type { Icontent, Ifeed } from "../../common/Feed";
  import FeedContents from "./FeedContents.svelte";
  export let feed: Ifeed = null;
</script>

<style>
  .link {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
</style>

<details>
  <summary>{feed.title}</summary>

  {#if feed.description}
    <p>{feed.description}</p>
  {/if}

  <div class="link">
    <a href={feed.link} target="_blank" rel="noopener noreferrer">ホームページ</a>
    <a href={feed.url} target="_blank" rel="noopener noreferrer">フィードのリンク</a>
  </div>

  <FeedContents contents={feed.contents} />
</details>
