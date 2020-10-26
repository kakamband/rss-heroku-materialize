<script lang="ts">
  import type { Icontent } from "../../common/Feed";
  export let contents: Icontent[] = [];

  $: contentsSorted = contents.sort((a, b) => {
    if (a.date.isBefore(b.date)) return 1;
    if (b.date.isBefore(a.date)) return -1;
    return 0;
  });
</script>

<style>
  .content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .title {
    overflow-wrap: break-word;
    text-align: justify;
  }
  
  .date {
    white-space: nowrap;
  }
</style>

{#each contentsSorted as content}
  <div class="content">
    <span class="title">
      <a href={content.link} target="_blank" rel="noopener noreferrer">{content.title}</a>
    </span>
    
    <span class="date">
      {content.date.format("YYYY/MM/DD HH:mm")}
    </span>
  </div>
{/each}
