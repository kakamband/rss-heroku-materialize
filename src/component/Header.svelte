<script>
  import { Router, Link } from "svelte-routing";
</script>

<Router>
  <ul id="dropdown1" class="dropdown-content">
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
      <a href="#!" class="brand-logo left dropdown-trigger" data-target="dropdown1">
        <i class="material-icons">menu</i>
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
