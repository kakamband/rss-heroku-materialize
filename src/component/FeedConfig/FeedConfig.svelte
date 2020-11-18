<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { flip } from "svelte/animate";
  import { dndzone } from "svelte-dnd-action";
  import { navigate } from "svelte-routing";

  import FeedInfoEditor from "./FeedInfoEditor.svelte";
  import { feedInfos } from "./store/store.ts";

  const dispatch = createEventDispatcher();

  const confirm = async () => {
    dispatch("exec", { payload: "confirm" });
    navigate("/", { replace: true });
  };

  const flipDurationMs = 300;
  const handleDnd = e => {
    feedInfos.setItems(e.detail.items);
  };
</script>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .header a:first-child {
    margin-right: auto;
  }

  .invalid {
    background-color: red;
    color: white;
  }
</style>

{#if $feedInfos.editingIndex < 0}
  <div class="collection with-header">
    <div class="collection-header header">
      <a 
        href="#!"
        class="btn-floating waves-effect waves-light blue"
        on:click={feedInfos.add}
      >
        <i class="material-icons">add</i>
      </a>

      <a href="#!" on:click={confirm}>
        <i class="material-icons">done</i>
      </a>
    </div>

    <div
      use:dndzone={{ items: $feedInfos.items, flipDurationMs }} 
      on:consider={handleDnd} 
      on:finalize={handleDnd}
    >
      {#each $feedInfos.items as feedInfo, i (feedInfo.id)}
        <div 
          class="collection-item feed-info"
          class:invalid={!feedInfo.valid}
          animate:flip={{ duration: flipDurationMs }}
          on:click={() => feedInfos.startEdit(i)}
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
{:else}
  <FeedInfoEditor />
{/if}
