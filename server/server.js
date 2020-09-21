const express = require('express')
const app = express()
const port = 8080

const fetch = require('node-fetch');
const parser = require('node-html-parser');

app.get('/', (req, res) => {

  const init = {
    method: "GET",
    // headers: {
    //   // "Content-Type": "application/json; charset=utf-8",
    //   "Content-Type": "application/xml; charset=utf-8",
    // },
  }

  const url = "https://qiita.com/tags/svelte/feed"
  // // const url = "https://news.yahoo.co.jp/pickup/rss.xml"

  fetch(url, init)
  .then(res => res.text())
  .then(body => {
    // const parser = new DOMParser();
    // const doc = parser.parseFromString(body, "text/html")
    // console.log(body)
    const root = parser.parse(body)
    // console.log(root.firstChild.structure)
    // console.log(root.childNodes)
    console.log(root.structure)

    res.send(body)
  });

  // res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})