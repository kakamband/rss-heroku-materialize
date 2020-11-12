<script lang="ts">
  import type { Icontent, Ifeed } from "../../common/Feed";
  import FeedContents from "./FeedContents.svelte";
  export let feed: Ifeed = null;
</script>

<style>
  .feed {
    height: 100%;
    background-color: gray;
    display: flex;
    flex-direction: column;
  }

  .feed-heading {
    flex: 0 1 auto;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .feed-heading-title {
    margin-right: auto;
  }

  .feed-contents {
    flex: 1 1 auto;
    overflow: auto;
  }
</style>

<div class="collection with-header feed">
  <div class="collection-header feed-heading">
    {#if feed.description}
      <details class="feed-heading-title">
        <summary>
          <span>{feed.title}</span>
        </summary>
        <blockquote>{feed.description}</blockquote>
      </details>
    {:else}
      <span class="feed-heading-title">{feed.title}</span>
    {/if}

    <a 
      href={feed.link} 
      target="_blank" rel="noopener noreferrer"
    >
      <i class="material-icons">home</i>
    </a>

    <a 
      href={feed.url} 
      target="_blank" rel="noopener noreferrer"
    >
      <i class="material-icons">rss_feed</i>
    </a>
  </div>

  <div class="feed-contents">
    <FeedContents contents={feed.contents} />
  </div>
</div>
