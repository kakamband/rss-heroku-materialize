<script>
  import { Router, Link } from "svelte-routing";
</script>

<Router>
<ul id="dropdown1" class="dropdown-content">
  <li>
    <Link to="/">Feed</Link>
  </li>
  <li>
    <Link to="/feed-info">設定</Link>
  </li>
  <li class="divider"></li>
  <!-- <li>
    <slot name="auth"></slot>
  </li> -->
</ul>
</Router>

<nav>
  <div class="nav-wrapper">
    <a href="#!" class="brand-logo">Logo</a>
    <ul class="right hide-on-med-and-down">
      <li><a href="sass.html">Sass</a></li>
      <li><a href="badges.html">Components</a></li>
      <li><a class="dropdown-trigger" href="#!" data-target="dropdown1">Dropdown<i class="material-icons right">arrow_drop_down</i></a></li>
      <li><slot name="auth"></slot></li>
    </ul>
  </div>
</nav>

<!-- <slot name="auth"></slot> -->

<!-- <header>

  <div class="">
    <span class="navbar-item dropdown is-hoverable">
      <a href={"#"} class="dropdown-trigger">
        <i class="fas fa-bars"></i>
      </a>
      
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
</header> -->
