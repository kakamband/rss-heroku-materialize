<script lang="ts">
  export let feeds = [];

  const sortFeed = (feed) => {
    const contensSorted = feed.contents.sort((a, b) => {
      const dateA = a.date;
      const dateB = b.date;

      if (dateA.isBefore(dateB)) return -1;
      if (dateB.isBefore(dateB)) return 1;
      return 0;
    });

    return { ...feed, contents: contensSorted };
  };

//  const sortFeeds = (feeds) => feeds.map((feed) => sortFeed(feed));

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
