<script lang="ts">
  import type { Icontent, Ifeed } from "../../common/Feed";
  import Feed from "./Feed.svelte";
  import Pagination from "./Pagination.svelte";

  export let feeds: Ifeed[] = [];
  let currentPageNo = 0;

  const pageSelected = e => {
    currentPageNo = e.detail.currentPageNo;
  };

  let startX; // タッチ開始 x座標
  let startY; // タッチ開始 y座標
  let moveX; // スワイプ中の x座標
  let moveY; // スワイプ中の y座標
  let dist = 30; // スワイプを感知する最低距離（ピクセル単位）

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
      // 右から左にスワイプ
      // 右から左にスワイプした時の処理
      console.log("右から左にスワイプ");
    } else if (startX < moveX && startX + dist < moveX) {
      // 左から右にスワイプ
      // 左から右にスワイプした時の処理
      console.log("左から右にスワイプ");
    }
  };
</script>

<Pagination pageNum={feeds.length} on:page-selected={pageSelected} />

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
