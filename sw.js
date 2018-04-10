//This is the "Offline page" service worker
const CACHE_NAME = "todolist-v1";

//Install stage sets up the offline page in the cahche and opens a new cache
self.addEventListener("install", function(event) {
  var offlinePage = new Request("offline.html");
  event.waitUntil(
    fetch(offlinePage).then(function(response) {
      return caches.open(CACHE_NAME).then(function(cache) {
        console.log("Cached offline page during Install" + response.url);
        return cache.put(offlinePage, response);
      });
    })
  );
});

//If any fetch fails, it will show the offline page.
//Maybe this should be limited to HTML documents?
self.addEventListener("fetch", function(event) {
  event.respondWith(
    fetch(event.request).catch(function(error) {
      console.error("Network request Failed. Serving offline page " + error);
      return caches.open(CACHE_NAME).then(function(cache) {
        return cache.match("offline.html");
      });
    })
  );
});
