// キャッシュファイルの指定
var CACHE_NAME = "rss-feed-app-caches";
var urlsToCache = ["index.html", "/build/bundle.js", "/bundle.css"];

// インストール処理
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Install");

  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      console.log("[Service Worker] Caching all: app shell and content");
      return cache.addAll(urlsToCache);
    })
  );
});

// リソースフェッチ時のキャッシュロード処理
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      return response ? response : fetch(event.request);
    })
  );
});
