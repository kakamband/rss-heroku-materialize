<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { flip } from "svelte/animate";
  import { dndzone } from "svelte-dnd-action";
  import { v4 as uuidv4 } from "uuid";

  import type { IfeedInfo } from "../../common/Feed";
  import FeedInfoEditor from "./FeedInfoEditor.svelte";

  export let feedInfos: IfeedInfo[] = [];
  const dispatch = createEventDispatcher();
  let editingIndex = -1;

  const add = () => {
    const id = uuidv4();

    feedInfos = [
      ...feedInfos,
      {
        id,
        url: "",
        title: "",
        valid: false
      }
    ];

    editingIndex = feedInfos.length - 1;
  };

  const remove = () => {
    feedInfos = feedInfos.filter((_, index) => index !== editingIndex);
    editingIndex = -1;
  };

  const confirm = async () => {
    dispatch("exec", { payload: "confirm" });
  };

  const flipDurationMs = 300;
  const handleDnd = e => {
    feedInfos = e.detail.items;
  };
</script>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .feed-title {
    flex-grow: 1;
  }

  .invalid {
    background-color: red;
    color: white;
  }
</style>

{#if editingIndex < 0}
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
        >
          <!-- <span>
            <i class="material-icons">menu</i>
          </span> -->

          <span 
            class="feed-title" 
            on:click={() => editingIndex = i}
          >
            {#if feedInfo.valid}
              {feedInfo.title}
            {:else}
              {feedInfo.url}
            {/if}
          </span>

          <!-- <a href="#!" on:click={() => editingIndex = i}>
            <i class="material-icons">edit</i>
          </a> -->
        </div>
      {/each}
    </div>
  </div>
{:else}
  <FeedInfoEditor 
    feedInfo={feedInfos[editingIndex]}
    on:finish-edit={() => editingIndex = -1}
    on:remove={remove}
  />
{/if}
