const express = require("express");
// const cors = require("cors");
const RssParser = require("rss-parser");

const app = express();

app.use(express.static('public'));

// app.use(cors({ origin: true, credentials: true }));

// app.use(cors())

// const allowCrossDomain = function(req, res, next) {
//   res.header('Access-Control-Allow-Origin', '*')
//   res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
//   res.header(
//     'Access-Control-Allow-Headers',
//     'Content-Type, Authorization, access_token'
//   )

//   // intercept OPTIONS method
//   if ('OPTIONS' === req.method) {
//     res.send(200)
//   } else {
//     next()
//   }
// }
// app.use(allowCrossDomain)

// app.use(function(req, res, next) {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
//   next();
// });

const port = 8080;

const rssParser = new RssParser();

const getFeeds = async (url) => {
  const data = await rssParser.parseURL(url);
  const feeds = data.items.map(({ title, isoDate, link }) => ({ title, isoDate, link }));
  return feeds;
};

// app.get('/', cors(), async (req, res, next) => {
// app.get('/', async (req, res, next) => {
app.get('/rss-feed', async (req, res) => {

  const url = req.query.url;

  let feeds = null;
  try {
    feeds = await getFeeds(url);
  } catch (e) {
    console.log(e);
  }
  console.log(feeds);

  // res.header('Access-Control-Allow-Origin', 'https://5000-cs-994772306133-default.asia-east1.cloudshell.dev');
  // // res.header('Access-Control-Allow-Origin', '*');
  
  // res.header('Access-Control-Allow-Credentials', true);

  // res.header('Access-Control-Allow-Methods', 'PUT,DELETE,PATCH');
  // // res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
   
  // res.header(
  //   'Access-Control-Allow-Headers',
  //   // 'Content-Type, Authorization, access_token',
  //   "X-Requested-With, Origin, X-Csrftoken, Content-Type, Accept",
  // )

  res.json(feeds);
});

app.listen(port, () => {
  console.log(`RSS feed proxy server: listening at http://localhost:${port}`);
});
