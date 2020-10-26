<script lang="ts">
  import type { Icontent, Ifeed } from "../../common/Feed";
  import FeedContents from "./FeedContents.svelte";
  export let feed: Ifeed = null;
</script>

<style>
  .feed-heading {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .feed-title {
    margin-right: auto;
  }
</style>

<div class="panel">
  <div class="panel-heading feed-heading">
    <span class="feed-title">{feed.title}</span>

    <a href={feed.link} target="_blank" rel="noopener noreferrer">
      <i class="fas fa-home"></i>
    </a>

    <a href={feed.url} target="_blank" rel="noopener noreferrer">
      <i class="fas fa-rss"></i>
    </a>
  </div>

  {#if feed.description}
    <div class="panel-block">
      {feed.description}
    </div>
  {/if}

  <FeedContents contents={feed.contents} />
</div>
