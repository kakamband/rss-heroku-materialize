<script lang="ts">
  import { onMount } from "svelte";
  import { getFeed } from "../api/rssFeedProxy.ts";
  import type { Icontent, Ifeed } from "../common/Feed";
  import FeedList from "./FeedList.svelte";

	export let name: string;
  
  let rssUrls = [
    "https://qiita.com/tags/svelte/feed",
    "https://news.yahoo.co.jp/pickup/rss.xml",
    "https://qiita.com/tags/svelte/feed1",
    "/pickup/rss1.xml",
    "pickup/rss1.xml",
    "/",
    "",
  ];

  let feeds: Ifeed[] = [];

  onMount(async () => {
    const promises = rssUrls.map((rssUrl) => getFeed(rssUrl));
    feeds = await Promise.all(promises);
    console.log(feeds);
  });
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/mvp.css">
<!-- 
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/kognise/water.css@latest/dist/light.min.css">
	<link rel="stylesheet" href="https://newcss.net/new.min.css">
	<link rel="stylesheet" href="https://unpkg.com/mvp.css">
	<link rel="stylesheet" href="//writ.cmcenroe.me/1.0.4/writ.min.css">
	<link rel="stylesheet" href="https://unpkg.com/sakura.css/css/sakura.css">
-->
</svelte:head>

<main>
	<h1>Hello {name}!</h1>
	<p>Visit the <a href="https://svelte.dev/tutorial">Svelte tutorial</a> to learn how to build Svelte apps.</p>

  <FeedList bind:feeds={feeds} />
</main>

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