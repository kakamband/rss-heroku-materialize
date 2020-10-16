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

<main>
  {#if user}
	<h1>Hello {user.name}!</h1>

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

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/sakura.css/css/sakura.css">
<!-- 
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/kognise/water.css@latest/dist/light.min.css">
	<link rel="stylesheet" href="https://newcss.net/new.min.css">
	<link rel="stylesheet" href="https://unpkg.com/mvp.css">
	<link rel="stylesheet" href="//writ.cmcenroe.me/1.0.4/writ.min.css">
	<link rel="stylesheet" href="https://unpkg.com/sakura.css/css/sakura.css">
-->
</svelte:head>

<style>
	main {
		text-align: center;
		padding: 1em;
		max-width: 240px;
		margin: 0 auto;
	}

	h1 {
		color: #ff3e00;
		text-transform: uppercase;
		font-size: 4em;
		font-weight: 100;
	}

	@media (min-width: 640px) {
		main {
			max-width: none;
		}
	}
</style>
