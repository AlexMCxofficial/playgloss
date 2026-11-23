// Settings page: theme, color scheme and modes. MIT License (see LICENSE).
// The choices are kept by theme.js and modes.js, only on this device.
(function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); }, picker = null;

  function paint() {
    var s = PGTheme.get();
    Array.prototype.forEach.call(document.querySelectorAll("[data-theme-set]"), function (b) {
      b.setAttribute("aria-pressed", b.dataset.themeSet === s.theme);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-scheme-set]"), function (b) {
      b.setAttribute("aria-pressed", b.dataset.schemeSet === s.scheme);
    });
    $("custom-box").hidden = s.scheme !== "custom";
    if (s.scheme === "custom" && !picker) {
      picker = ColorPicker.create({
        value:s.accent,
        onChange:function (c) { PGTheme.set({ scheme:"custom", accent:c }); }
      });
      $("custom-box").appendChild(picker.el);
    }
  }

  // Modes: Default or Extreme, and Infinite. Choosing the mode also moves the look (see modes.js).
  function paintModes() {
    var m = PGMode.get();
    Array.prototype.forEach.call(document.querySelectorAll("[data-mode-set]"), function (b) {
      b.setAttribute("aria-pressed", b.dataset.modeSet === m.mode);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-infinite-set]"), function (b) {
      b.setAttribute("aria-pressed", (b.dataset.infiniteSet === "on") === m.infinite);
    });
  }

  // Play Online (opt-in). Off unless the person turns it on, and only the apps can host, so the
  // website keeps it off. The choice stays on this device, and the Play page reads the same key.
  var APP = !!window.__TAURI__;
  function onlineOn() { try { return APP && localStorage.getItem("online") === "1"; } catch (e) { return false; } }
  function paintOnline() {
    var on = onlineOn();
    Array.prototype.forEach.call(document.querySelectorAll("[data-online-set]"), function (b) {
      b.setAttribute("aria-pressed", (b.dataset.onlineSet === "on") === on);
      b.disabled = !APP;
    });
    $("online-web").hidden = APP;
    $("online-on").hidden = !on;
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("button[data-theme-set]"), c = e.target.closest("button[data-scheme-set]"), o = e.target.closest("button[data-online-set]");
    var md = e.target.closest("button[data-mode-set]"), inf = e.target.closest("button[data-infinite-set]");
    if (md) PGMode.set({ mode:md.dataset.modeSet });
    else if (inf) PGMode.set({ infinite:inf.dataset.infiniteSet === "on" });
    else if (t) PGTheme.set({ theme:t.dataset.themeSet });
    else if (c) PGTheme.set({ scheme:c.dataset.schemeSet });
    else if (o && APP) {
      try { localStorage.setItem("online", o.dataset.onlineSet === "on" ? "1" : "0"); } catch (x) {}
      paintOnline();
    }
  });
  PGTheme.subscribe(paint);
  PGMode.subscribe(paintModes);
  paint();
  paintModes();
  paintOnline();
})();
