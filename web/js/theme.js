// Look of the site: dark or light theme, color scheme (PlayGloss, OLED, Yaru, Custom) and custom accent color.
// Saved only on this device (localStorage) and never sent anywhere. MIT License (see LICENSE).
var PGTheme = (function () {
  var root = document.documentElement, SCHEMES = ["playgloss", "oled", "yaru", "custom"], subs = [];
  var read = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var save = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var st = { theme:read("theme") === "light" ? "light" : "dark", scheme:read("scheme"), accent:read("accent") };
  if (SCHEMES.indexOf(st.scheme) < 0) st.scheme = "playgloss";
  if (!/^#[0-9a-f]{6}$/.test(st.accent || "")) st.accent = "#1565c0";
  if (st.scheme === "oled") st.theme = "dark";

  function lum(c) {
    var n = parseInt(c.slice(1), 16);
    var v = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (x) { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); });
    return .2126 * v[0] + .7152 * v[1] + .0722 * v[2];
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

  function apply() {
    root.setAttribute("data-theme", st.theme);
    root.setAttribute("data-scheme", st.scheme);
    var s = root.style;
    if (st.scheme === "custom") {
      // text on the accent color is black or white, whichever is easier to read
      s.setProperty("--accent", st.accent);
      s.setProperty("--on-accent", ratio(st.accent, "#ffffff") >= ratio(st.accent, "#000000") ? "#ffffff" : "#000000");
      // an accent that is nearly the page color gets an outline so buttons stay visible
      s.setProperty("--edge", ratio(st.accent, st.theme === "light" ? "#ffffff" : "#000000") < 3 ? "var(--fg)" : "transparent");
    } else {
      ["--accent", "--on-accent", "--edge"].forEach(function (k) { s.removeProperty(k); });
    }
  }
  function get() { return { theme:st.theme, scheme:st.scheme, accent:st.accent }; }
  // OLED is a dark-only look: choosing it switches to Dark, and choosing Light leaves OLED.
  function set(p) {
    if (p.theme) st.theme = p.theme === "light" ? "light" : "dark";
    if (p.scheme && SCHEMES.indexOf(p.scheme) >= 0) st.scheme = p.scheme;
    if (p.accent && /^#[0-9a-f]{6}$/.test(p.accent)) st.accent = p.accent;
    if (p.scheme === "oled") st.theme = "dark";
    else if (p.theme === "light" && st.scheme === "oled") st.scheme = "playgloss";
    save("theme", st.theme); save("scheme", st.scheme); save("accent", st.accent);
    apply();
    subs.forEach(function (f) { f(get()); });
  }
  apply();

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-toggle");
    if (btn) btn.addEventListener("click", function () { set({ theme:st.theme === "light" ? "dark" : "light" }); });
  });
  return { get:get, set:set, subscribe:function (f) { subs.push(f); } };
})();
