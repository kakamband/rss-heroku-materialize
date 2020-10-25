<script>
  import { Router, Link } from "svelte-routing";
  export let user = null;
</script>

<header class="navbar is-primary is-fixed-top">
  <div class="navbar-brand">
    <span class="navbar-item dropdown is-hoverable">
      <a href={"#"} class="dropdown-trigger">
        <i class="fas fa-bars"></i>
      </a>
      
      <div class="dropdown-menu">
        <div class="dropdown-content">
          <Router>
            <span class="dropdown-item">
              <Link to="/"><i class="fas fa-rss"></i></Link>
            </span>

            <span class="dropdown-item">
              <Link to="/feed-info"><i class="fas fa-cog"></i></Link>
            </span>
          </Router>

          <span class="dropdown-item">
            <slot name="auth"></slot>
          </span>
        </div>
      </div>
    </span>
  </div>

  <nav class="navbar-menu">
    <div class="navbar-end">
      <Router>
        <span class="navbar-item">
          <Link to="/"><i class="fas fa-rss"></i></Link>
        </span>

        <span class="navbar-item">
          <Link to="/feed-info"><i class="fas fa-cog"></i></Link>
        </span>
      </Router>
    </div>
  </nav>
</header>
