const CACHE_VERSION = "v3";
const CACHE_NAME = `hindi-quiz-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./script.js",
  "./manifest.json",
  "./data/manifest.json",
  "./data/news/vocab/news_vocab_01.json",

  "./data/ch/texts/lesson01.json",
  "./data/ch/texts/lesson02.json",
  "./data/ch/texts/lesson03.json",
  "./data/ch/texts/lesson04.json",
  "./data/ch/texts/lesson05.json",
  "./data/ch/texts/lesson06.json",
  "./data/ch/texts/lesson07.json",
  "./data/ch/texts/lesson08.json",

  "./data/ch/vocab/lesson01_vocab.json",
  "./data/ch/vocab/lesson02_vocab.json",
  "./data/ch/vocab/lesson03_vocab.json",
  "./data/ch/vocab/lesson04_vocab.json",
  "./data/ch/vocab/lesson05_vocab.json",
  "./data/ch/vocab/lesson06_vocab.json",
  "./data/ch/vocab/lesson07_vocab.json",
  "./data/ch/vocab/lesson08_vocab.json"
];

// インストール時にキャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );

  // 新しいSWを待機させず、すぐ有効化候補にする
  self.skipWaiting();
});

// 有効化時に古いキャッシュを削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  // 開いているページをすぐこのSWの管理下に置く
  self.clients.claim();
});

// リクエスト処理
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // HTMLはネット優先
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put("./index.html", responseClone);
          });
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // JSON/JS/CSSなどは stale-while-revalidate に近い動き
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});
