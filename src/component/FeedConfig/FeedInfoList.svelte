<script lang="ts">
  import type { IfeedInfo } from "../../common/Feed";
  export let feedInfos: IfeedInfo[] = [];
</script>

<div class="collection with-header">
  <div class="collection-header header">
    <a href="#!" on:click={confirm}>
      <i class="material-icons">arrow_back</i>
    </a>

    <a 
      href="#!"
      class="btn-floating waves-effect waves-light blue"
      on:click={add}
    >
      <i class="material-icons">add</i>
    </a>
  </div>

  <div
    use:dndzone={{ items: feedInfos, flipDurationMs }} 
    on:consider={handleDnd} 
    on:finalize={handleDnd}
  >
    {#each feedInfos as feedInfo, i (feedInfo.id)}
      <div 
        class="collection-item feed-info"
        class:invalid={!feedInfo.valid}
        animate:flip={{ duration: flipDurationMs }}
        on:click={() => editingIndex = i}
      >
        {#if feedInfo.valid}
          {feedInfo.title}
        {:else}
          {feedInfo.url}
        {/if}
      </div>
    {/each}
  </div>
</div>
