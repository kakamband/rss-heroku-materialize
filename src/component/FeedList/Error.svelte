<script lang="ts">
  import type { Ifeed } from "../../common/Feed";
  export let feed: Ifeed = null;
</script>

<style>
  .invalid {
    background-color: red;
    height: 100%;
  }
</style>

<div class="card invalid">
  <div class="card-content white-text">
    <span class="card-title">
      指定されたURLのフィードは取得できません。
    </span>
    <p><a href={feed.url}>{feed.url}</a></p>
    <p>[{feed.status}]&nbsp;{feed.statusText}</p>
  </div>
</div>
