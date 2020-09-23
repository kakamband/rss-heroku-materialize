<script lang="ts">
  export let feeds = [];
</script>

<ul>
  {#each feeds as feed}
  <li>
    <a href={feed.url}>{feed.url}</a>
    <ul>
      {#each feed.contents as content}
      <li>
        {content.title}
        {content.isoDate}
        <a href={content.link}>{content.link}</a>
      </li>
      {/each}
    </ul>
  </li>
  {/each}
</ul>
