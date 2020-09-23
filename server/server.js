const express = require("express");
const RssParser = require("rss-parser");

const port = 8080;

const app = express();
app.use(express.static("public"));

const rssParser = new RssParser();

const getFeed = async (url) => {
  const feed = await rssParser.parseURL(url);
  const contents = feed.items.map(({ title, isoDate, link }) => ({ title, isoDate, link }));
  return contents;
};

app.get("/rss-feed", async (req, res) => {

  let contents = [];

  try {
    contents = await getFeed(req.query.url);
  } catch (e) {
    // console.log(`RSS feed proxy server: エラーをキャッチ name=${e.name} message=${e.message}`);
    res.sendStatus(404);
    return;
  }

  res.json(contents);
});

app.listen(port, () => {
  console.log(`RSS feed proxy server: listening at http://localhost:${port}`);
});
