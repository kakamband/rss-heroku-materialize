<script>
  import { Router, Link } from "svelte-routing";
  export let user = null;
</script>

<header>
  <i class="fas fa-rss"></i>

  <nav>
    {#if user}
    <Router>
      <Link to="/">Feedリスト</Link>
      <Link to="/feed-info">Feed設定</Link>
    </Router>
    {/if}

    <slot name="auth"></slot>
  </nav>
</header>

<style>
  header {
    position: sticky;
    top: 2rem;
    margin: 0 1rem 0.5rem 1rem;
    padding: 0.5rem;
    background-color: darkgrey;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  nav {
    margin-left: auto;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }
</style>
