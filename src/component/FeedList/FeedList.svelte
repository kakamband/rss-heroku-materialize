<script lang="ts">
  import type { Icontent, Ifeed } from "../../common/Feed";
  import Feed from "./Feed.svelte";
  import Pagination from "./Pagination.svelte";

  export let feeds: Ifeed[] = [];
  let currentPageNo = 0;

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

  let startX; // タッチ開始 x座標
  let startY; // タッチ開始 y座標
  let moveX; // スワイプ中の x座標
  let moveY; // スワイプ中の y座標
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
    if (startX > moveX && startX > moveX + dist) {
      // 右から左にスワイプした時の処理
      console.log("右から左にスワイプ");
      pageSelected("next");
    } else if (startX < moveX && startX + dist < moveX) {
      // 左から右にスワイプした時の処理
      console.log("左から右にスワイプ");
      pageSelected("previous");
    }
  };
</script>

<Pagination 
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
{/if}
