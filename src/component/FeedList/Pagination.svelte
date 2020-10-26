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

<nav class="pagination">
  <a class="pagination-previous">Previous</a>
  <a class="pagination-next">Next page</a>

  <ul class="pagination-list">
    {#each Array(pageNum) as _, i}
      <li>
        <a class="pagination-link" class:is-current={i === currentPageNo} name={i + 1} on:click={pageSelected}>
          {i + 1}
        </a>
      </li>
    {/each}
  </ul>
</nav>
