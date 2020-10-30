<script>
  import { Router, Link } from "svelte-routing";
</script>

<Router>
  <ul id="dropdown1" class="dropdown-content">
    <li class="divider"></li>
    <li>
      <Link to="/">Feed</Link>
    </li>
    <li>
      <Link to="/feed-info">設定</Link>
    </li>
  </ul>
</Router>

<div class="navbar-fixed">
<nav>
  <div class="nav-wrapper">
    <a href="#!" class="brand-logo left">Logo</a>

    <Router>
      <ul class="hide-on-med-and-down left">
        <li>
          <Link to="/">Feed</Link>
        </li>
        <li>
          <Link to="/feed-info">設定</Link>
        </li>
      </ul>
    </Router>

    <ul class="right">
      <li>
        <a class="dropdown-trigger" href="#!" data-target="dropdown1">
          <i class="material-icons right">more_vert</i>
        </a>
      </li>

      <li>
        <slot name="auth"></slot>
      </li>
    </ul>
  </div>
</nav>
</div>
