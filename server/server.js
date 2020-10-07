const express = require("express");
const DB = require("./database");
const getFeed = require("./feed");

/* DB準備 */
const dbUri = "postgres://mpscwekfnxqtes:a01a652f1ca3830b3887a698492bb6e9a5e16fb58d38162f323963b42ad69478@ec2-35-169-92-231.compute-1.amazonaws.com:5432/d2u978t58np3dl";
const db = new DB(dbUri);

process.on("exit", () => {
  db.exit();
});

process.on("SIGINT", () => {
  db.exit();
});

/* Webサーバー準備 */
const port = process.env.PORT || 8080;

const app = express();

app.use(express.static("public"));
app.use(express.json());  // requestのbodyを解析できるようにする。
// app.use(express.urlencoded({ extended: true }));

// app.use((req, res, next) => {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
//   next();
// });

app.get("/", (_, res) => res.render("index.html"));

app.get("/rss-feed", async (req, res) => {
  try {
    const feed = await getFeed(req.query.url);
    res.json(feed);
  } catch (e) {
    console.log("RSS feed proxy server:");
    console.log(`  RSSパーサーエラー ${e.message}`);
    console.log(`  RSS url=${req.query.url}`);

    res.sendStatus(404);
  }
});

app.put("/feed-infos", async (req, res) => {
  try {
    await db.query("delete from feed_infos;");

    for (let feedInfo of req.body.feedInfos) {
      const query = `insert into feed_infos values (${feedInfo.id}, \'${feedInfo.name}\', \'${feedInfo.passwd}\', \'${feedInfo.url}\');`;
      await db.query(query);
    }

    res.sendStatus(200);
  } catch (e) {
    console.log("RSS feed proxy server: DB書込に失敗しました", e);
    res.sendStatus(500);
  }
});

app.get("/feed-infos", async (_, res) => {
  try {
    const result = await db.query("SELECT * FROM feed_infos;");
    for (let row of result.rows) console.log(row);
    res.json(result.rows);
  } catch (e) {
    console.log("RSS feed proxy server: DB読込に失敗しました", e);
    res.sendStatus(500);
  }
});

app.listen(port, () => {
  console.log(`RSS feed proxy server: listening at http://localhost:${port}`);
});
