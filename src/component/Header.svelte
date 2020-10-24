<script>
  import { Router, Link } from "svelte-routing";
  export let user = null;
</script>

<header class="navbar is-primary is-fixed-top">
  <div class="navbar-brand">
    <span class="navbar-item">
      <i class="fas fa-rss"></i>
    </span>
  </div>

  <nav class="navbar-menu navbar-end">
    {#if user}
    <Router>
      <span class="navbar-item">
        <Link to="/">Feedリスト</Link>
      </span>

      <span class="navbar-item">
        <Link to="/feed-info">Feed設定</Link>
      </span>
    </Router>
    {/if}

    <span class="navbar-item">
      <slot name="auth"></slot>
    </span>
  </nav>
</header>
