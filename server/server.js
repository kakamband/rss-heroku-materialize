const express = require("express");
const RssParser = require("rss-parser");

const port = 8080;

const app = express();
app.use(express.static("public"));

const rssParser = new RssParser();

const getFeeds = async (url) => {
  const data = await rssParser.parseURL(url);
  const feeds = data.items.map(({ title, isoDate, link }) => ({ title, isoDate, link }));
  return feeds;
};

app.get("/rss-feed", async (req, res) => {

  let feeds = [];

  try {
    feeds = await getFeeds(req.query.url);
  } catch (e) {
    console.log(`RSS feed proxy server: エラーをキャッチ name=${e.name} message=${e.message}`);
    res.sendStatus(404);
    return;
  }

  res.json(feeds);
});

app.listen(port, () => {
  console.log(`RSS feed proxy server: listening at http://localhost:${port}`);
});