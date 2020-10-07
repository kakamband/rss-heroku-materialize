<script lang="ts">
  import type { Icontent, Ifeed } from "../common/Feed";
  export let feeds: Ifeed[] = [];

  const sortFeed = (feed): Ifeed => {

    const contensSorted: Icontent[] = feed.contents.sort((a, b) => {
      if (a.date.isBefore(b.date)) return 1;
      if (b.date.isBefore(a.date)) return -1;
      return 0;
    });

    return { ...feed, contents: contensSorted };
  };

  $: feedsSorted = feeds.map((feed) => sortFeed(feed));
</script>

<style>
  .content {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .content-item {
    margin-right: 1em;
  }

  .title {
    overflow-wrap: break-word;
    text-align: justify;
  }
  
  .date {
    white-space: nowrap;
  }
</style>

{#each feedsSorted as feed}
<form>
  {#if feed.ok}
  <details>
    <summary>{feed.title}</summary>

    <a href={feed.link} target="_blank" rel="noopener noreferrer">ホームページ</a>
    <a href={feed.url} target="_blank" rel="noopener noreferrer">フィードのリンク</a>

    {#if feed.description}
    <p>{feed.description}</p>
    {/if}

    {#each feed.contents as content}
    <div class="content">
      <p class="content-item title"><a href={content.link} target="_blank" rel="noopener noreferrer">{content.title}</a></p>
      <p class="date">{content.date.format("YYYY/MM/DD HH:mm")}</p>
    </div>
    {/each}
  </details>

  {:else}
  <p><a href={feed.url}>{feed.url}</a>&nbsp;[{feed.status}]{feed.statusText}</p>
  {/if}
</form>
{/each}
