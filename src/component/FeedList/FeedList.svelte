<script lang="ts">
  import type { Icontent, Ifeed } from "../../common/Feed";
  import Feed from "./Feed.svelte";
  import Pagination from "./Pagination.svelte";

  export let feeds: Ifeed[] = [];
  let currentPageNo = 0;

  const pageSelected = (e) => {
    currentPageNo = e.detail.currentPageNo;
  }
</script>

<Pagination pageNum={feeds.length} on:page-selected={pageSelected} />

{#if feeds.length}
  {#if feeds[currentPageNo].ok}
    <Feed feed={feeds[currentPageNo]} />
  {:else}
    <p>
      <a href={feeds[currentPageNo].url}>
        {feeds[currentPageNo].url}
      </a>
      &nbsp;[{feeds[currentPageNo].status}]{feeds[currentPageNo].statusText}
    </p>
  {/if}
{/if}
