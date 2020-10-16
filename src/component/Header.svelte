<script>
  import { Router, Link } from "svelte-routing";
  export let user = null;
</script>

<header class="site-header">
  <!-- <div class="wrapper site-header__wrapper"> -->
  <div class="site-header__wrapper">
    <img src="favicon.png" width="30" height="30" alt="brand" />

    <!-- {#if user} -->
    <nav class="nav">
      <Router>
        <Link to="/">Feedリスト</Link>
        <Link to="/feed-info">Feed設定</Link>
      </Router>
    </nav>
    <!-- {/if} -->
      
    <slot name="auth"></slot>
  </div>
</header>

<style>
  .site-header {
    position: relative;
    background-color: #def7ff;
    padding: 0.5rem;
  }

  .site-header__wrapper {
    display: flex;
    /* justify-content: space-between; */
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .nav {
    display: flex;
    /* justify-content: space-between; */
    align-items: center;
    margin-left: auto;
    gap: 1rem;
  }
</style>
