<script>
  import { Router, Link } from "svelte-routing";
</script>

<Router>
  <ul class="sidenav" id="mobile-demo">
    <li>
      <Link to="/"><i class="material-icons">rss_feed</i></Link>
    </li>

    <li>
      <Link to="/feed-info"><i class="material-icons">settings</i></Link>
    </li>
  </ul>
</Router>

<div class="navbar-fixed">
  <nav>
    <div class="nav-wrapper">
      <span class="brand-logo">
        RSS!
      </span>

      <a href="#!" data-target="mobile-demo" class="sidenav-trigger">
        <!-- <i class="material-icons">menu</i> -->
        <i class="material-icons">rss_feed</i>
      </a>

      <Router>
        <ul class="right">
          <li class="hide-on-small-only">
            <Link to="/"><i class="material-icons">rss_feed</i></Link>
          </li>
          
          <li class="hide-on-small-only">
            <Link to="/feed-info"><i class="material-icons">settings</i></Link>
          </li>

          <li>
            <slot name="auth"></slot>
          </li>
        </ul>
      </Router>
    </div>
  </nav>
</div>
