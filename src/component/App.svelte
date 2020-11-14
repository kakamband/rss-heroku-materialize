<script lang="ts">
  import { onMount } from "svelte";
  import { Router, Route } from "svelte-routing";
  import { getFeeds, putFeedInfos, getFeedInfos } from "../api/rssFeedProxy.ts";
  import type { Icontent, Ifeed, IfeedInfo } from "../common/Feed.ts";
  import type { Iuser } from "../common/Auth.ts";
  import FeedConfig from "./FeedConfig/FeedConfig.svelte";
  import FeedList from "./FeedList/FeedList.svelte";
  import Auth from "./Auth.svelte";
  import Header from "./Header.svelte";

  let user: Iuser = null;
  let feedInfos: IfeedInfo[] = [];
  let feeds: Ifeed[] = [];

  onMount(async () => {
    M.AutoInit();
    feeds = await getFeeds(feedInfos);
  });

  const onExec = async e => {
    switch (e.detail.payload) {
      case "confirm":
        await putFeedInfos(user.id, feedInfos);
        feeds = await getFeeds(feedInfos);
        break;

      case "login":
        feedInfos = await getFeedInfos(user.id);
        feeds = await getFeeds(feedInfos);
        break;

      case "logout":
        feedInfos = [];
        feeds = [];
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
        <Auth bind:user={user} on:exec={onExec} />
      </span>
    </Header>
  </header>

  <main class="container main">
    <Router>
      <Route path="/">
        <FeedList feeds={feeds} />
      </Route>
      <Route path="/feed-info">
        <FeedConfig bind:feedInfos={feedInfos} on:exec={onExec} />
      </Route>
    </Router>
  </main>
</div>
