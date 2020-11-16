<script lang="ts">
  import { onMount } from "svelte";
  import { Router, Route } from "svelte-routing";

  import Header from "./Header.svelte";
  import FeedConfig from "./FeedConfig/FeedConfig.svelte";
  import FeedList from "./FeedList/FeedList.svelte";
  import Auth from "./Auth/Auth.svelte";

  import { auth } from "./Auth/store/store.ts";
  import { feedInfos } from "./FeedConfig/store/store.ts";
  import { feed } from "./FeedList/store/store.ts";

  onMount(async () => {
    M.AutoInit();
    await feed.load($feedInfos.items);
  });

  const onExec = async e => {
    switch (e.detail.payload) {
      case "confirm":
        await feedInfos.save($auth.user.id);
        await feed.load($feedInfos.items);
        break;

      case "login":
        await feedInfos.load($auth.user.id);
        await feed.load($feedInfos.items);
        break;

      case "logout":
        feedInfos.clear();
        feed.clear();
        break;

      default:
        break;
    }
  };
</script>

<style>
  .wrapper {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .header {
    flex: 0 1 auto;
  }

  .main {
    flex: 1 1 auto;
  }
</style>

<div class="wrapper">
  <header class="header">
    <Header>
      <span slot="auth"> 
        <Auth on:exec={onExec} />
      </span>
    </Header>
  </header>

  <main class="container main">
    <Router>
      <Route path="/">
        <FeedList />
      </Route>
      <Route path="/feed-info">
        <FeedConfig on:exec={onExec} />
      </Route>
    </Router>
  </main>
</div>
