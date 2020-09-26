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

{#each feedsSorted as feed}
<form>
  <fieldset>
    <legend><a href={feed.url}>{feed.url}</a></legend>
      {#each feed.contents as content}
      <dl>
        <dt>{content.title}</dt>
        <dd>{content.isoDate}</dd>
        <dd>{content.date.format("YYYY/MM/DD HH:mm")}
        <dd><a href={content.link}>{content.link}</a></dd>
      </dl>
      {/each}
  </fieldset>
</form>
{/each}
