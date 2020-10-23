<script>
  import { Router, Link } from "svelte-routing";
  export let user = null;
</script>

<header>
  <img class="logo" src="favicon.png" alt="brand" />

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
    top: 8px;
    padding: 0.5rem;
    background-color: darkgrey;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .logo {
    width: 2rem;
    height: auto;
    margin-right: auto;
  }

  nav {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }
</style>
