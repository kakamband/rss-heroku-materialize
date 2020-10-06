const express = require("express");
const RssParser = require("rss-parser");
const fs = require("fs").promises;
const path = require("path");
const DB = require("./database");

const port = process.env.PORT || 8080;

const app = express();

app.use(express.static("public"));
app.use(express.json());  // requestのbodyを解析できるようにする。

// DB導入の準備
// app.use((req, res, next) => {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
//   next();
// });
// 
// app.use(express.urlencoded({ extended: true }));

const dbUri = "postgres://mpscwekfnxqtes:a01a652f1ca3830b3887a698492bb6e9a5e16fb58d38162f323963b42ad69478@ec2-35-169-92-231.compute-1.amazonaws.com:5432/d2u978t58np3dl";
const db = new DB(dbUri);

process.on("exit", () => {
  db.exit();
});

process.on("SIGINT", () => {
  db.exit();
});

const rssParser = new RssParser();
const feedInfosFileName = path.resolve("/tmp/feed-infos.json");

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
  try {
    const feed = await getFeed(req.query.url);
    res.json(feed);
  } catch (e) {
    console.log(`RSS feed proxy server: エラーをキャッチ name=${e.name} message=${e.message}`);
    res.sendStatus(404);
  }
});

app.put("/feed-infos", async (req, res) => {
  try {
    await db.query("delete from feed_infos;");

    for (let feedInfo of req.body.feedInfos) {
      const query = `insert into feed_infos values (${feedInfo.id}, \'${feedInfo.name}\', \'${feedInfo.passwd}\', \'${feedInfo.url}\');`;
      console.log("QUERY: ", query);
      await db.query(query);
    }

    // await fs.writeFile(feedInfosFileName, JSON.stringify(req.body.feedInfos));
    res.sendStatus(200);
  } catch (e) {
    // console.log("書き込みに失敗しました", feedInfosFileName, e);
    console.log("書き込みに失敗しました", e);
    res.sendStatus(500);
  }
});

app.get("/feed-infos", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM feed_infos;");
    for (let row of result.rows) console.log(row);
    res.json(result.rows);

    // const feedInfosJson = await fs.readFile(feedInfosFileName);
    // res.send(feedInfosJson);
  } catch (e) {
    console.log("読み込みに失敗しました", feedInfosFileName, e);
    res.sendStatus(500);
  }
});

app.listen(port, () => {
  console.log(`RSS feed proxy server: listening at http://localhost:${port}`);
});
