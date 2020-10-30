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

<div class="collection with-header">
  <div class="collection-header feed-heading">
    {#if feed.description}
      <details class="feed-title">
        <summary>
          <span>{feed.title}</span>
        </summary>
        <blockquote>{feed.description}</blockquote>
      </details>
    {:else}
      <span class="feed-title">{feed.title}</span>
    {/if}

    <a href={feed.link} target="_blank" rel="noopener noreferrer">
      <i class="material-icons">home</i>
    </a>

    <a href={feed.url} target="_blank" rel="noopener noreferrer">
      <i class="material-icons">rss_feed</i>
    </a>
  </div>

  <FeedContents contents={feed.contents} />
</div>
