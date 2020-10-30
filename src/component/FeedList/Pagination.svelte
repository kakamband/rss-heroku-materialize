<script lang="ts">
  import { createEventDispatcher } from "svelte";
  export let pageNum = 0;
  let currentPageNo = 0;
  const dispatch = createEventDispatcher();

  const pageSelected = (e) => {
    currentPageNo = parseInt(e.target.name, 10) - 1;
    dispatch("page-selected", { currentPageNo });
  }
</script>

<div class="pagination">
  <ul class="pagination-list">
    <li>
      <a href={"#"}>
        <i class="material-icons">chevron_left</i>
      </a>
    </li>

    {#each Array(pageNum) as _, i}
      <li class:active={i === currentPageNo}>
        <a href={"#"} name={i + 1} on:click={pageSelected}>
          {i + 1}
        </a>
      </li>
    {/each}

    <li>
      <a href={"#"}>
        <i class="material-icons">chevron_right</i>
      </a>
    </li>
  </ul>
</div>
