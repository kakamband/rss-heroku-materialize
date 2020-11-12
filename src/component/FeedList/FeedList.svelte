<script lang="ts">
  import { afterUpdate } from "svelte";
  import type { Ifeed } from "../../common/Feed";
  import Feed from "./Feed.svelte";

  export let feeds: Ifeed[] = [];
  let currentPageNo = 0;

  afterUpdate(() => {
    console.log("afterUpdate");

    const elems = document.querySelectorAll(".carousel");
    console.log(elems);

    M.Carousel.init(elems, {
      fullWidth: true,
      indicators: true
    });
  });
</script>

<style>
  .feed-list {
    height: 100%;
  }
</style>

<div class="carousel carousel-slider center feed-list">
  {#if feeds.length <= 0}
    <div class="carousel-item blue white-text">
      <h2>Loading...</h2>
    </div>
  {/if}

  {#each feeds as feed}
    <div class="carousel-item">
      {#if feed.ok}
        <Feed feed={feed} />
      {:else}
        <p>
          <a href={feeds[currentPageNo].url}>
            {feeds[currentPageNo].url}
          </a>
          &nbsp;[{feeds[currentPageNo].status}]{feeds[currentPageNo].statusText}
        </p>
      {/if}
    </div>
  {/each}
</div>
