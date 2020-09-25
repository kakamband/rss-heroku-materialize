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
        <dd><a href={content.link}>{content.link}</a></dd>
      </dl>
      {/each}
  </fieldset>
</form>
{/each}
 
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
