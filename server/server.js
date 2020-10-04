const express = require("express");
const RssParser = require("rss-parser");
const fs = require("fs").promises;
const path = require("path");
const database = require("./database");

const port = process.env.PORT || 8080;

const app = express();

app.use(express.static("public"));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(express.json());  // requestのbodyを解析できるようにする。
app.use(express.urlencoded({ extended: true }));

const rssParser = new RssParser();
const db = new database;
const feedInfosFileName = path.resolve("/tmp/feed-infos.json");

app.put("/feed-infos", async (req, res) => {
  console.log(req.body.feedInfos);

  try {
    await fs.writeFile(feedInfosFileName, JSON.stringify(req.body.feedInfos));
    console.log('正常に書き込みが完了しました', feedInfosFileName);
    res.sendStatus(200);
  } catch (e) {
    console.log('書き込みに失敗しました', feedInfosFileName, e);
    res.sendStatus(500);
  }
});

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

app.listen(port, () => {
  console.log(`RSS feed proxy server: listening at http://localhost:${port}`);
});
