<script lang="ts">
  import { onMount } from "svelte";
  import { getFeeds, putFeedInfos, getFeedInfos } from "../api/rssFeedProxy.ts";
  import type { Icontent, Ifeed, IfeedInfo } from "../common/Feed";
  import FeedInfo from "./FeedInfo.svelte";
  import FeedList from "./FeedList.svelte";

	export let name: string;
  
  let feedInfos: IfeedInfo[] = [
    {
      id: 1,
      name: "A.M",
      passwd: "9999",
      url: "https://qiita.com/tags/svelte/feed",
    },
    {
      id: 2,
      name: "A.M",
      passwd: "9999",
      url: "https://news.yahoo.co.jp/pickup/rss.xml",
    },
    {
      id: 3,
      name: "A.M",
      passwd: "9999",
      url: "https://qiita.com/tags/svelte/feed1",
    },
    {
      id: 4,
      name: "A.M",
      passwd: "9999",
      url: "/pickup/rss1.xml",
    },
    {
      id: 5,
      name: "A.M",
      passwd: "9999",
      url: "pickup/rss1.xml",
    },
    {
      id: 6,
      name: "A.M",
      passwd: "9999",
      url: "/",
    },
    {
      id: 7,
      name: "A.M",
      passwd: "9999",
      url: "",
    },
  ];

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

<main>
	<h1>Hello {name}!</h1>
	<p>Visit the <a href="https://svelte.dev/tutorial">Svelte tutorial</a> to learn how to build Svelte apps.</p>

  <FeedInfo bind:feedInfos={feedInfos} on:exec={onExec} />
  <FeedList feeds={feeds} />
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