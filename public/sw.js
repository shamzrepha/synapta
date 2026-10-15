/* Sunroot service worker: app shell precache, offline downloads, Next static assets.
 * Never touches non-GET requests, other origins, or auth/session endpoints. */
importScripts("/sw-policy.js");

var VERSION = "v1";
var SHELL = "sunroot-shell-" + VERSION;
var STATIC = "sunroot-static-" + VERSION;
var DOWNLOADS = "sunroot-downloads"; // unversioned: user data must survive SW updates
var P = self.SunrootPolicy;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(SHELL)
      .then(function (c) {
        return c.addAll(["/offline"]).catch(function () {
          /* signed-out redirect etc: not fatal */
        });
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return (k.indexOf("sunroot-shell-") === 0 || k.indexOf("sunroot-static-") === 0) && k !== SHELL && k !== STATIC;
            })
            .map(function (k) {
              return caches.delete(k);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var net = fetch(req)
        .then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(function () {
          return hit;
        });
      return hit || net;
    });
  });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (P.isNeverCache(req.url) && url.pathname !== "/offline") return;

  // Next static assets: stale-while-revalidate
  if (P.isStaticAsset(req.url)) {
    event.respondWith(staleWhileRevalidate(req, STATIC));
    return;
  }

  // API GETs: only ones the student downloaded (present in the downloads cache)
  if (P.isDownloadable(req.method, req.url)) {
    event.respondWith(
      caches.open(DOWNLOADS).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (!hit) return fetch(req);
          var refresh = fetch(req)
            .then(function (res) {
              if (res && res.ok) cache.put(req, res.clone());
              return res;
            })
            .catch(function () {
              return hit;
            });
          event.waitUntil(refresh);
          return hit;
        });
      })
    );
    return;
  }

  // Pages: network first; offline falls back to a downloaded page, the shell, then /offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          if (url.pathname === "/offline" && res.ok) {
            var copy = res.clone();
            caches.open(SHELL).then(function (c) {
              c.put(req, copy);
            });
          }
          return res;
        })
        .catch(function () {
          return caches.match(req, { ignoreSearch: true }).then(function (hit) {
            return hit || caches.match("/offline");
          });
        })
    );
  }
});
