// PlayGloss service worker. MIT License (see LICENSE).
// Keeps a copy of the game on the device so it works offline.
// When you change any file in web/, change the number in CACHE so devices fetch the new version.
var CACHE = "playgloss-v6";
var FILES = [
  "./", "index.html", "play.html", "join.html", "docs.html", "settings.html", "manifest.json", "logo.svg",
  "css/style.css",
  "js/theme.js", "js/app.js", "js/pwa.js", "js/view.js", "js/ui.js", "js/words.js", "js/color.js", "js/settings.js",
  "js/overlays.js", "js/join.js",
  "js/core/wheel.js", "js/core/game.js", "js/core/filter.js",
  "js/online/proto.js", "js/online/session.js", "js/online/host.js", "js/online/guest.js",
  "js/vendor/nacl-fast.min.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Show the saved copy at once, and refresh it from the network in the background.
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
