<script lang="ts">
  import { createEventDispatcher } from "svelte";
  export let pageNum = 0;
  let currentPageNo = 0;
  const dispatch = createEventDispatcher();

  const previousPage = () => {
    if (currentPageNo <= 0) return;
    --currentPageNo;
    dispatch("page-selected", { currentPageNo });
  };

  const nextPage = () => {
    if (currentPageNo >= pageNum - 1) return;
    ++currentPageNo;
    dispatch("page-selected", { currentPageNo });
  };

  const selectPage = (e) => {
    currentPageNo = parseInt(e.target.name, 10);
    dispatch("page-selected", { currentPageNo });
  };
</script>

<div class="pagination">
  <ul class="pagination-list">
    <li>
      <a href="#!" on:click={previousPage}>
        <i class="material-icons">chevron_left</i>
      </a>
    </li>

    {#each Array(pageNum) as _, i}
      <li class:active={i === currentPageNo}>
        <a href="#!" name={i} on:click={selectPage}>
          {i + 1}
        </a>
      </li>
    {/each}

    <li>
      <a href="#!" on:click={nextPage}>
        <i class="material-icons">chevron_right</i>
      </a>
    </li>
  </ul>
</div>
