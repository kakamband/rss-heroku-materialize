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
    align-items: center;
    gap: 1rem;
    background-color: gray;
  }

  .content-title {
    overflow-wrap: break-word;
    text-align: justify;
    margin-right: auto;
    color: whitesmoke;
  }

  .content-date {
    white-space: nowrap;
    color: whitesmoke;
  }
</style>

{#each contentsSorted as content}
  <div class="content collection-item">
    <a 
      class="content-title"
      href={content.link} 
      target="_blank" rel="noopener noreferrer"
    >
      {content.title}
    </a>
    
    <span class="content-date">
      {content.date.format("YYYY/MM/DD HH:mm")}
    </span>
  </div>
{/each}
