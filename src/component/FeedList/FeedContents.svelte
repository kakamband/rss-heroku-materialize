<script lang="ts">
  import type { Icontent } from "../../common/Feed";
  export let contents: Icontent[] = [];
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

{#each contents as content}
  <div class="content">
    <span class="title">
      <a href={content.link} target="_blank" rel="noopener noreferrer">{content.title}</a>
    </span>
    
    <span class="date">
      {content.date.format("YYYY/MM/DD HH:mm")}
    </span>
  </div>
{/each}
