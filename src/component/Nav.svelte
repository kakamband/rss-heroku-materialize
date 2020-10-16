<script>
  import { Router, Link, link } from "svelte-routing";
  export let user = null;
</script>

<nav>
  {#if user}
  <Router>
    <a href="/" use:link>Feedリスト</a>
    <a href="/feed-info" use:link>Feed設定</a>
    <!-- <Link to="/">Feedリスト</Link>
    <Link to="/feed-info">Feed設定</Link> -->
  </Router>
  {/if}
  
  <slot name="auth"></slot>
</nav>
