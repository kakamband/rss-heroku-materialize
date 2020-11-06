// キャッシュファイルの指定
var CACHE_NAME = "rss-feed-app-caches";
// var urlsToCache = ["/index.html", "/build/bundle.js", "/build/bundle.css"];
// var urlsToCache = ["/index.html"];
var urlsToCache = [];

// インストール処理
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Install");

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Caching all: app shell and content");
      return cache.addAll(urlsToCache);
    })
  );
});

// リソースフェッチ時のキャッシュロード処理
self.addEventListener("fetch", (event) => {
  console.log("[Service Worker] Fetch");

  event.respondWith(
    caches.match(event.request).then((response) => {
      console.log("[Service Worker] Retuen contents");
      return response ? response : fetch(event.request);
    })
  );
});
