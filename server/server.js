const express = require("express");
const RssParser = require("rss-parser");

const app = express();
app.use(express.static('public'));

const port = 8080;

const rssParser = new RssParser();

const getFeeds = async (url) => {
  const data = await rssParser.parseURL(url);
  const feeds = data.items.map(({ title, isoDate, link }) => ({ title, isoDate, link }));
  return feeds;
};

app.get('/rss-feed', async (req, res) => {

  const url = req.query.url;

  let feeds = null;
  try {
    feeds = await getFeeds(url);
  } catch (e) {
    console.log(e);
  }
  console.log(feeds);

  res.json(feeds);
});

app.listen(port, () => {
  console.log(`RSS feed proxy server: listening at http://localhost:${port}`);
});
