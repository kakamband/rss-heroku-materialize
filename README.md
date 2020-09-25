■Svelte  
Svelte + TypeScript + SCSS やってみる  
https://neos21.hatenablog.com/entry/2020/09/07/080000

■サーバサイド  
Express Node.js のための高速で、革新的な、最小限のWebフレームワーク  
https://expressjs.com/ja/

express.jsのcors対応  
https://qiita.com/chenglin/items/5e563e50d1c32dadf4c3

なんとなく CORS がわかる...はもう終わりにする。  
https://qiita.com/att55/items/2154a8aad8bf1409db2b

Node.jsでrss-parserを使って更新情報を取得する  
https://qrunch.net/@okayu/entries/djiX8JcQ4WCosbw4

■日時処理  
Day.jsでよく使う機能の覚書  
https://qiita.com/tobita0000/items/0f9d0067398efdc2931e

■Git  
Gitでやりたいこと、ここで見つかる  
https://qiita.com/shimotaroo/items/b73d896ace10894fd290

■issue管理
参考
【不安解消】未経験がGitHubでissue管理をしたら、モチベUPした話。  
https://qiita.com/yamken/items/a9db6b07142ca8bfd19e?utm_source=Qiita%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9&utm_campaign=ef853059dc-Qiita_newsletter_428_09_16_2020&utm_medium=email&utm_term=0_e44feaa081-ef853059dc-33301173

①ブランチを切って作業開始
  git checkout -b [ブランチ名]#[issue番号]

②commit作成
  git add .
  git commit -m "[コミットメッセージ #issue番号]"
  
  ※コミットメッセージと#issue番号の間にはスペースが必要。
    スペースを入れないとcommitとissueが紐付かない。

③作業終了したらpush
  git push origin [ブランチ名]#[issue番号]

④プルリク作成（GitHubで作業）
  ④-1 Codeタブに「Compare & pull request」ボタンが表示されてるので押す。
  ④-2 コメントを記入
  ④-3 「Create pull request」ボタンを押す。
  
⑤masterにpull
  git checkout -b master
  git pull

*Looking for a shareable component template? Go here --> [sveltejs/component-template](https://github.com/sveltejs/component-template)*

---

# svelte app

This is a project template for [Svelte](https://svelte.dev) apps. It lives at https://github.com/sveltejs/template.

To create a new project based on this template using [degit](https://github.com/Rich-Harris/degit):

```bash
npx degit sveltejs/template svelte-app
cd svelte-app
```

*Note that you will need to have [Node.js](https://nodejs.org) installed.*


## Get started

Install the dependencies...

```bash
cd svelte-app
npm install
```

...then start [Rollup](https://rollupjs.org):

```bash
npm run dev
```

Navigate to [localhost:5000](http://localhost:5000). You should see your app running. Edit a component file in `src`, save it, and reload the page to see your changes.

By default, the server will only respond to requests from localhost. To allow connections from other computers, edit the `sirv` commands in package.json to include the option `--host 0.0.0.0`.


## Building and running in production mode

To create an optimised version of the app:

```bash
npm run build
```

You can run the newly built app with `npm run start`. This uses [sirv](https://github.com/lukeed/sirv), which is included in your package.json's `dependencies` so that the app will work when you deploy to platforms like [Heroku](https://heroku.com).


## Single-page app mode

By default, sirv will only respond to requests that match files in `public`. This is to maximise compatibility with static fileservers, allowing you to deploy your app anywhere.

If you're building a single-page app (SPA) with multiple routes, sirv needs to be able to respond to requests for *any* path. You can make it so by editing the `"start"` command in package.json:

```js
"start": "sirv public --single"
```

## Using TypeScript

This template comes with a script to set up a TypeScript development environment, you can run it immediately after cloning the template with:

```bash
node scripts/setupTypeScript.js
```

Or remove the script via:

```bash
rm scripts/setupTypeScript.js
```

## Deploying to the web

### With [Vercel](https://vercel.com)

Install `vercel` if you haven't already:

```bash
npm install -g vercel
```

Then, from within your project folder:

```bash
cd public
vercel deploy --name my-project
```

### With [surge](https://surge.sh/)

Install `surge` if you haven't already:

```bash
npm install -g surge
```

Then, from within your project folder:

```bash
npm run build
surge public my-project.surge.sh
```
