<script lang="ts">
  import type { Icontent, Ifeed } from "../../common/Feed";
  import Feed from "./Feed.svelte";
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

{#each feedsSorted as feed}
  {#if feed.ok}
    <Feed feed={feed} />
  {:else}
    <p><a href={feed.url}>{feed.url}</a>&nbsp;[{feed.status}]{feed.statusText}</p>
  {/if}
{/each}
