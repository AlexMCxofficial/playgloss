// Registers the offline service worker on the website. MIT License (see LICENSE).
// Skipped inside the PlayGloss desktop/Android app, which already contains every file.
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && !window.__TAURI__) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  });
}
