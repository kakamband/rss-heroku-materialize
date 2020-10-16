<script>
  import { Router, Link } from "svelte-routing";
  export let user = null;
</script>

<header class="site-header">
  <div class="site-header__wrapper">
    <img class="logo" src="favicon.png" alt="brand" />

    <nav class="nav">
      {#if user}
      <Router>
        <Link to="/">Feedリスト</Link>
        <Link to="/feed-info">Feed設定</Link>
      </Router>
      {/if}

      <slot name="auth"></slot>
    </nav>
  </div>
</header>

<style>
  .site-header {
    position: relative;
    background-color: #def7ff;
  }

  .site-header__wrapper {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    margin: 0.5rem;
  }

  .logo {
    width: 3rem;
    height: 3rem;
    margin: 0;
  }

  .nav {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }
</style>
