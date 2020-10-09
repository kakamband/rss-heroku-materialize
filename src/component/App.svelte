<script lang="ts">
  import { onMount } from "svelte";
  import { getFeeds, putFeedInfos, getFeedInfos } from "../api/rssFeedProxy.ts";
  import type { Icontent, Ifeed, IfeedInfo } from "../common/Feed.ts";
  import type { Iuser } from "../common/Auth.ts";
  import FeedInfo from "./FeedInfo.svelte";
  import FeedList from "./FeedList.svelte";
  import Auth from "./Auth.svelte";

  let user: Iuser = null;
  let feedInfos: IfeedInfo[] = [];
  let feeds: Ifeed[] = [];

  onMount(async () => {
    feeds = await getFeeds(feedInfos);
  });

  const onExec = async (e) => {

    switch (e.detail.payload) {
      case "confirm":
        feeds = await getFeeds(feedInfos);
        await putFeedInfos(feedInfos);
        break;

      case "getFeedInfos":
        const result = await getFeedInfos();

        if (result) {
          feedInfos = result;
        } else {
          alert("サーバからfeed情報を取得に失敗しました。");
        }

        break;
        
      default:
        break;
    }
  };
</script>

<main>
  {#if user}
	<h1>Hello {user.name}!</h1>
  {/if}

  <Auth bind:user={user} />
  <FeedInfo bind:feedInfos={feedInfos} on:exec={onExec} />
  <FeedList feeds={feeds} />
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
