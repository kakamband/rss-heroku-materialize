<script lang="ts">
  import { onMount } from "svelte";
  import type { Icontent, Ifeed } from "../../common/Feed";
  import Feed from "./Feed.svelte";
  import Pagination from "./Pagination.svelte";

  export let feeds: Ifeed[] = [];
  let currentPageNo = 0;

  onMount(() => {
    const elems = document.querySelectorAll(".carousel");
    console.log(elems);

    M.Carousel.init(elems, {
      fullWidth: true,
      indicators: true
    });
  });

  const pageSelected = (type: string, pageNo: number = undefined) => {
    switch (type) {
      case "previous":
        if (currentPageNo > 0) --currentPageNo;
        break;
      case "next":
        if (currentPageNo < feeds.length - 1) ++currentPageNo;
        break;
      case "select":
        currentPageNo = pageNo;
        break;
      default:
        console.error(`pageSelected: 指定されたtype(${type})は未定義です。`);
        break;
    }
  };

  const paginationClicked = e => {
    pageSelected(e.detail.type, e.detail.pageNo);
  };

  let startX = undefined; // タッチ開始 x座標
  let startY = undefined; // タッチ開始 y座標
  let moveX = undefined; // スワイプ中の x座標
  let moveY = undefined; // スワイプ中の y座標
  let dist = 60; // スワイプを感知する最低距離（ピクセル単位）

  const touchStart = e => {
    e.preventDefault();
    startX = e.touches[0].pageX;
    startY = e.touches[0].pageY;
  };

  const touchMove = e => {
    e.preventDefault();
    moveX = e.changedTouches[0].pageX;
    moveY = e.changedTouches[0].pageY;
  };

  const touchEnd = e => {
    console.log(`startX=${startX} moveX=${moveX}`);
    if (!startX || !moveX) return;

    const diff = moveX - startX;
    console.log(`(moveX - startX)=${diff}`);

    if (diff <= -dist) {
      // 右から左にスワイプ
      pageSelected("next");
    } else if (diff >= dist) {
      // 左から右にスワイプ
      pageSelected("previous");
    }

    startX = undefined;
    startY = undefined;
    moveX = undefined;
    moveY = undefined;
  };
</script>

<!-- <Pagination 
  pageNum={feeds.length}
  currentPageNo={currentPageNo}
  on:click={paginationClicked} 
/>

{#if feeds.length}
  <div
    on:touchstart={touchStart}
    on:touchmove={touchMove}
    on:touchend={touchEnd}
  >
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
  </div>
{/if} -->

<!-- <div class="carousel carousel-slider center">
  <div class="carousel-fixed-item center">
    <a 
      class="btn waves-effect white grey-text darken-text-2"
      href="#!"
    >
      button
    </a>
  </div>

  <div class="carousel-item red white-text" href="#one!">
    <h2>First Panel</h2>
    <p class="white-text">This is your first panel</p>
  </div>

  <div class="carousel-item amber white-text" href="#two!">
  {#if feeds[0]}
    <Feed feed={feeds[0]} />
  {:else}
    <h2>Second Panel</h2>
    <p class="white-text">This is your second panel</p>
  {/if}
  </div>

  <div class="carousel-item green white-text" href="#three!">
    <h2>Third Panel</h2>
    <p class="white-text">This is your third panel</p>
  </div>

  <div class="carousel-item blue white-text" href="#four!">
    <h2>Fourth Panel</h2>
    <p class="white-text">This is your fourth panel</p>
  </div>
</div> -->

<div class="carousel carousel-slider center">
  {#if feeds.length <= 0}
    <div class="carousel-item red white-text">
      <h2>No feeds</h2>
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
