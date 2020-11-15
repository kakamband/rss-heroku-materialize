<script lang="ts">
  import { afterUpdate } from "svelte";
  import type { Ifeed } from "../../common/Feed";
  import Feed from "./Feed.svelte";
  import Error from "./Error.svelte";

  import { feed } from "./store/store.ts";

  afterUpdate(() => {
    const elems = document.querySelectorAll(".carousel");
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
  {#if $feed.feeds.length <= 0}
    <div class="carousel-item blue white-text">
      <h2>Loading...</h2>
    </div>
  {/if}

  {#each $feed.feeds as feed}
    <div class="carousel-item">
      {#if feed.ok}
        <Feed feed={feed} />
      {:else}
        <Error feed={feed} />
      {/if}
    </div>
  {/each}
</div>
