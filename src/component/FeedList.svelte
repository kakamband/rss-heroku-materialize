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
  <details>
    <summary><a href={feed.url}>{feed.url}</a></summary>

    {#each feed.contents as content}
    <div class="content">
      <p class="title"><a href={content.link}>{content.title}</a></p>
      <p class="date">{content.date.format("YYYY/MM/DD HH:mm")}</p>
    </div>
    {/each}
  </details>
</form>
{/each}
