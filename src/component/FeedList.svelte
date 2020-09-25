<script lang="ts">
  export let feeds = [];
</script>

{#each feeds as feed}
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
