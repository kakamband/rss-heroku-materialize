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
    <a href="#!" class="brand-logo">Logo</a>

    <ul class="right hide-on-med-and-down">
      <li><a href="#!">Sass</a></li>
      <li><a href="#!">Components</a></li>
    </ul>

    <ul class="right">
      <li>
        <a class="dropdown-trigger" href="#!" data-target="dropdown1">
          Dropdown<i class="material-icons right">arrow_drop_down</i>
        </a>
      </li>

      <li>
        <slot name="auth"></slot>
      </li>
    </ul>
  </div>
</nav>
</div>
