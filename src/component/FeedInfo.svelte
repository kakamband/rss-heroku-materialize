<script lang="ts">
  export let feedUrls: string[] = [];
</script>

<form>
  {#each feedUrls as feedUrl}
  <input type="url" required bind:value={feedUrl}>
  {/each}
</form>
