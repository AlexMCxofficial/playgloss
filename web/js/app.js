// Inside the PlayGloss app, open links to other websites in the system browser
// (otherwise they would replace the game window). Does nothing on the website.
(function () {
  var T = window.__TAURI__;
  if (!T) return;
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.origin === location.origin || !/^https?:$/.test(a.protocol)) return;
    e.preventDefault();
    var p = T.opener && T.opener.openUrl ? T.opener.openUrl(a.href) : T.core.invoke("plugin:opener|open_url", { url: a.href });
    Promise.resolve(p).catch(function () {});
  });
})();
