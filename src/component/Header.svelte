<script>
  import { Router, Link } from "svelte-routing";
  export let user = null;
</script>

<header class="navbar is-primary is-fixed-top">
  <div class="navbar-brand">
    <span class="navbar-item dropdown is-hoverable">
      <a href={"#"} class="dropdown-trigger navbar-link is-arrowless">
        <i class="fas fa-rss"></i>
      </a>
      
      <div class="dropdown-menu">
        <div class="dropdown-content">
          <span class="dropdown-item">Dropdown item</span>
          <hr class="dropdown-divider">
          <span class="dropdown-item">With a divider</span>
        </div>
      </div>
    </span>

    <!-- <span class="navbar-item has-dropdown is-hoverable">
      <a href={"#"} class="navbar-link is-arrowless">
        <i class="fas fa-rss"></i>
      </a>

      <div class="navbar-dropdown">
        <span class="navbar-item">Dropdown item</span>
        <hr class="navbar-divider">
        <span class="navbar-item">With a divider</span>
      </div>
    </span> -->
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
