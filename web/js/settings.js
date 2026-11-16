// Settings page: theme and color scheme. MIT License (see LICENSE).
// The choices are kept by theme.js, only on this device.
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

  document.addEventListener("click", function (e) {
    var t = e.target.closest("button[data-theme-set]"), c = e.target.closest("button[data-scheme-set]");
    if (t) PGTheme.set({ theme:t.dataset.themeSet });
    else if (c) PGTheme.set({ scheme:c.dataset.schemeSet });
  });
  PGTheme.subscribe(paint);
  paint();
})();
