// Installed app startup preference. Kept on this device. MIT License (see LICENSE).
var PGSplash = (function () {
  "use strict";
  var app = !!window.__TAURI__;
  var key = "startup-splash";

  function enabled() {
    if (!app) return false;
    try { return localStorage.getItem(key) !== "off"; } catch (e) { return true; }
  }

  function setEnabled(on) {
    if (app) {
      try { localStorage.setItem(key, on ? "on" : "off"); } catch (e) {}
    }
  }

  var splash = document.getElementById("startup-splash");
  if (splash) {
    var openHome = function () { window.location.replace("index.html"); };
    if (enabled()) {
      splash.hidden = false;
      window.setTimeout(openHome, 750);
    } else openHome();
  }

  return { enabled: enabled, setEnabled: setEnabled };
})();
