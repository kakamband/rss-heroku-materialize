<script lang="ts">
  import { onMount } from "svelte";
  import { Router, Route } from "svelte-routing";
  import { getFeeds, putFeedInfos, getFeedInfos } from "../api/rssFeedProxy.ts";
  import type { Icontent, Ifeed, IfeedInfo } from "../common/Feed.ts";
  import type { Iuser } from "../common/Auth.ts";
  import FeedInfo from "./FeedInfo.svelte";
  import FeedList from "./FeedList.svelte";
  import Auth from "./Auth.svelte";
  import Header from "./Header.svelte";

  let user: Iuser = null;
  let feedInfos: IfeedInfo[] = [];
  let feeds: Ifeed[] = [];

  onMount(async () => {
    feeds = await getFeeds(feedInfos);
  });

  const onExec = async (e) => {

    switch (e.detail.payload) {
      case "confirm":
        await putFeedInfos(user.id, feedInfos);
        feeds = await getFeeds(feedInfos);
        break;

      case "getFeedInfos":
        feedInfos = await getFeedInfos(user.id);
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

<Header user={user}>
  <span slot="auth"> 
    <Auth bind:user={user} on:exec={onExec} />
  </span>
</Header>

<section class="section">
  <main class="container is-max-desktop">
    {#if user}
    <Router>
      <Route path="/">
        <FeedList feeds={feeds} />
      </Route>
      <Route path="/feed-info">
        <FeedInfo bind:feedInfos={feedInfos} on:exec={onExec} />
      </Route>
    </Router>
    {/if}
  </main>
</section>

<svelte:head>
  <link type="text/css" rel="stylesheet" href="https://cdn.firebase.com/libs/firebaseui/3.5.2/firebaseui.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@0.9.1/css/bulma.min.css">
  <script src="https://kit.fontawesome.com/5f39c04e79.js" crossorigin="anonymous"></script>
</svelte:head>
