<script lang="ts">
  import { createEventDispatcher } from "svelte";
  export let pageNum = 0;
  export let currentPageNo = 0;
  const dispatch = createEventDispatcher();

  const previousPage = () => {
    dispatch("click", { type: "previous" });
  };

  const nextPage = () => {
    dispatch("click", { type: "next" });
  };

  const selectPage = e => {
    const pageNo = parseInt(e.target.name, 10);
    dispatch("click", { type: "select", pageNo });
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
