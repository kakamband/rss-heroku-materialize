<script lang="ts">
  import { onMount } from "svelte";
  import { getFeeds } from "../api/rssFeedProxy.ts";

	export let name: string;

  onMount(async () => {
    const rssUrls = [
      "https://qiita.com/tags/svelte/feed",
      "https://news.yahoo.co.jp/pickup/rss.xml",
      "https://qiita.com/tags/svelte/feed1",  // Status code 404
      "/pickup/rss1.xml",  // socket hang up
      "pickup/rss1.xml",  // Status code 404
    ];

    const results = await rssUrls.map(async (rssUrl) => {
      return await getFeeds(rssUrl);
    });

    console.log(results);
  });
</script>

<main>
	<h1>Hello {name}!</h1>
	<p>Visit the <a href="https://svelte.dev/tutorial">Svelte tutorial</a> to learn how to build Svelte apps.</p>
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