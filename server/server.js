const express = require("express");
const RssParser = require("rss-parser");

const app = express();
app.use(express.static('public'));

app.use(function (err, req, res, next) {

  console.log("サーバ処理でエラー発生");
  console.log(e.name);
  console.log(e.message);
  // console.log(e);
  // console.error(err.stack)

  res.status(600).send('Something broke!')
});

const port = 8080;

const rssParser = new RssParser();

const getFeeds = async (url) => {
  const data = await rssParser.parseURL(url);
  const feeds = data.items.map(({ title, isoDate, link }) => ({ title, isoDate, link }));
  return feeds;
};

app.get('/rss-feed', async (req, res, next) => {

  const url = req.query.url;

  let feeds = null;
  try {
    feeds = await getFeeds(url);
  } catch (e) {
    console.log("エラーをキャッチ");
    console.log(e.name);
    console.log(e.message);
    // console.log(e);

    // return next(new Error(e));
    res.status(600).send('Something broke!');
    return;
  }
  // console.log(feeds);

  res.json(feeds);
});

app.listen(port, () => {
  console.log(`RSS feed proxy server: listening at http://localhost:${port}`);
});
