const express = require("express");
const app = express();
const port = 8080;

const RssParser = require("rss-parser");
const rssParser = new RssParser();

const getFeeds = async (url) => {
  const data = await rssParser.parseURL(url);
  const feeds = data.items.map(({ title, isoDate, link }) => ({ title, isoDate, link }));
  return feeds;
};

app.get('/', async (req, res) => {
  // const url = "https://qiita.com/tags/svelte/feed";
  // const url = "https://news.yahoo.co.jp/pickup/rss.xml";
  const url = req.query.url;

  const feeds = await getFeeds(url);
  res.json(feeds);
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
