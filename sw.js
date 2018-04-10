//This is the "Offline page" service worker
const CACHE_NAME = "todolist-v2";
const LOCAL_APP_ASSETS = [
  "index.html",
  "styles/todos.css",
  "styles/uikit.almost-flat.min.css",
  "scripts/backbone-min.js",
  "scripts/backbone-pouch.min.js",
  "scripts/jquery-2.0.0.min.js",
  "scripts/pouchdb-nightly.min.js",
  "scripts/todos.js",
  "scripts/uikit.min.js",
  "scripts/underscore-min.js"
];

//Install stage sets up the cache of the local application assets
self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(LOCAL_APP_ASSETS);
    })
  );
});

// if the request matches something in the cache deliver the cached version, otherwise call the network
self.addEventListener("fetch", function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request);
    })
  );
});
