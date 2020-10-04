const express = require("express");
const RssParser = require("rss-parser");

const port = process.env.PORT || 8080;

const app = express();
app.use(express.static("public"));
app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

const rssParser = new RssParser();

const getFeed = async (url) => {
  const feed = await rssParser.parseURL(url);

  const contents = feed.items.map(({ title, isoDate, link }) => ({ title, isoDate, link }));

  return {
    title: feed.title,
    description: feed.description,
    link: feed.link,
    contents,
  };
};

app.get("/", (req, res) => res.render("index.html"));

app.get("/rss-feed", async (req, res) => {

  let feed = {};

  try {
    feed = await getFeed(req.query.url);
  } catch (e) {
    // console.log(`RSS feed proxy server: エラーをキャッチ name=${e.name} message=${e.message}`);
    res.sendStatus(404);
    return;
  }

  // console.log(feed.title);
  // console.log(feed.description);
  // console.log(feed.link);

  res.json(feed);
});

app.put("/feed-infos", (req, res) => {
  console.log(req.body.urls);
  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`RSS feed proxy server: listening at http://localhost:${port}`);
});
