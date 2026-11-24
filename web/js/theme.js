// Look of the site: dark or light theme, color scheme (PlayGloss, OLED, Yaru, Extreme, Custom) and custom accent color.
// Fonts: family and size. Background: the scheme's own, a solid color, or the player's own picture (with fit and blur).
// Saved only on this device (localStorage) and never sent anywhere. MIT License (see LICENSE).
var PGTheme = (function () {
  var root = document.documentElement, SCHEMES = ["playgloss", "oled", "yaru", "extreme", "custom"], subs = [];
  var FONTS = ["system", "helvetica", "arial", "segoe", "compasse", "fira-code", "jetbrains-mono"];
  var FONT_STACKS = {
    "system": 'Lato,"Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif',
    "helvetica": 'Helvetica,"Helvetica Neue",Arial,sans-serif',
    "arial": 'Arial,"Helvetica Neue",Helvetica,sans-serif',
    "segoe": '"Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif',
    "compasse": '"Compasse",Georgia,"Times New Roman",serif',
    "fira-code": '"Fira Code","JetBrains Mono",Consolas,"Courier New",monospace',
    "jetbrains-mono": '"JetBrains Mono","Fira Code",Consolas,"Courier New",monospace'
  };
  // A picture is only kept when it is a small, plain image data URL (the settings page makes one from the file the player picks).
  var IMAGE = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+\/]+={0,2}$/, MAX_IMAGE = 4500000;
  var HEX = /^#[0-9a-f]{6}$/;
  var read = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var save = function (k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  var goodImage = function (v) { return typeof v === "string" && v.length <= MAX_IMAGE && IMAGE.test(v); };
  var st = {
    theme: read("theme") === "light" ? "light" : "dark",
    scheme: read("scheme"),
    accent: read("accent"),
    fontFamily: read("font-family"),
    fontSize: parseFloat(read("font-size")),
    bgType: read("bg-type"),
    bgColor: read("bg-color"),
    bgImage: read("bg-image"),
    bgFit: read("bg-fit"),
    bgBlur: parseFloat(read("bg-blur"))
  };
  // A look that a host has put on this page for the length of a game (see force()). It is never saved.
  var forced = null;
  if (SCHEMES.indexOf(st.scheme) < 0) st.scheme = "playgloss";
  if (!HEX.test(st.accent || "")) st.accent = "#1565c0";
  if (st.scheme === "oled" || st.scheme === "extreme") st.theme = "dark";
  if (FONTS.indexOf(st.fontFamily) < 0) st.fontFamily = "system";
  st.fontSize = isFinite(st.fontSize) ? Math.max(0.75, Math.min(1.5, st.fontSize)) : 1;
  st.bgBlur = isFinite(st.bgBlur) ? Math.max(0, Math.min(10, Math.round(st.bgBlur))) : 0;
  if (["scheme", "color", "image"].indexOf(st.bgType) < 0) st.bgType = "scheme";
  if (!HEX.test(st.bgColor || "")) st.bgColor = "#000000";
  if (!goodImage(st.bgImage)) st.bgImage = null;
  if (["cover", "contain"].indexOf(st.bgFit) < 0) st.bgFit = "cover";
  if (st.bgType === "image" && !st.bgImage) st.bgType = "scheme";

  function lum(c) {
    var n = parseInt(c.slice(1), 16);
    var v = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (x) { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); });
    return .2126 * v[0] + .7152 * v[1] + .0722 * v[2];
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

  // The look that is really shown: the forced one while the theme is dark, otherwise the saved one.
  function shown() { return forced && st.theme === "dark" ? forced : st.scheme; }

  var COLOR_VARS = ["--bg", "--fg", "--muted", "--surface", "--border"];
  function apply() {
    var scheme = shown();
    root.setAttribute("data-theme", st.theme);
    root.setAttribute("data-scheme", scheme);
    var meta = document.querySelector && document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", scheme === "extreme" ? "#2a0505" : st.theme === "light" ? "#ffffff" : "#000000");
    var s = root.style;
    if (scheme === "custom") {
      // text on the accent color is black or white, whichever is easier to read
      s.setProperty("--accent", st.accent);
      s.setProperty("--on-accent", ratio(st.accent, "#ffffff") >= ratio(st.accent, "#000000") ? "#ffffff" : "#000000");
      // an accent that is nearly the page color gets an outline so buttons stay visible
      s.setProperty("--edge", ratio(st.accent, st.theme === "light" ? "#ffffff" : "#000000") < 3 ? "var(--fg)" : "transparent");
    } else {
      ["--accent", "--on-accent", "--edge"].forEach(function (k) { s.removeProperty(k); });
    }
    s.setProperty("--font-family", FONT_STACKS[st.fontFamily] || FONT_STACKS.system);
    s.setProperty("--font-size", String(st.fontSize));
    applyBackground(s);
  }

  // Background. "scheme" leaves the scheme's own colors alone. "color" paints the page with the chosen color and picks the
  // text, card and border colors from it so everything stays readable. "image" shows the picture behind a light veil.
  function applyBackground(s) {
    COLOR_VARS.forEach(function (k) { s.removeProperty(k); });
    s.removeProperty("color-scheme");
    s.removeProperty("--bg-image"); s.removeProperty("--bg-fit"); s.removeProperty("--bg-blur");
    root.setAttribute("data-bg", "scheme");
    if (st.bgType === "color") {
      var dark = ratio(st.bgColor, "#ffffff") >= ratio(st.bgColor, "#000000"), fg = dark ? "#ffffff" : "#111111";
      s.setProperty("--bg", st.bgColor); s.setProperty("--fg", fg);
      s.setProperty("--surface", "color-mix(in srgb," + st.bgColor + " 86%," + fg + ")");
      s.setProperty("--border", "color-mix(in srgb," + st.bgColor + " 72%," + fg + ")");
      s.setProperty("--muted", "color-mix(in srgb," + fg + " 78%," + st.bgColor + ")");
      s.setProperty("color-scheme", dark ? "dark" : "light");
      root.setAttribute("data-bg", "color");
    } else if (st.bgType === "image" && st.bgImage) {
      s.setProperty("--bg-image", 'url("' + st.bgImage + '")');
      s.setProperty("--bg-fit", st.bgFit);
      s.setProperty("--bg-blur", st.bgBlur + "px");
      root.setAttribute("data-bg", "image");
    }
  }

  function get() {
    return {
      theme: st.theme, scheme: st.scheme, accent: st.accent,
      fontFamily: st.fontFamily, fontSize: st.fontSize,
      bgType: st.bgType, bgColor: st.bgColor, bgImage: st.bgImage, bgFit: st.bgFit, bgBlur: st.bgBlur
    };
  }

  // A host can put the Extreme look on every guest (Online > Host a game > Modes > Color). The guest keeps the Light /
  // Dark switch: Light shows the light look, and Dark brings the forced look back. Nothing is saved on the guest's
  // device, and force(null) gives the guest's own look back. Only "extreme" is accepted.
  function force(scheme) {
    forced = scheme === "extreme" ? "extreme" : null;
    apply();
  }
  // OLED and Extreme are dark-only looks: choosing one switches to Dark, and choosing Light leaves it.
  // Returns { ok:false } only when the picture could not be saved on this device (it is too big for the browser's storage).
  function set(p) {
    var ok = true;
    if (p.theme) st.theme = p.theme === "light" ? "light" : "dark";
    if (p.scheme && SCHEMES.indexOf(p.scheme) >= 0) st.scheme = p.scheme;
    if (p.accent && HEX.test(p.accent)) st.accent = p.accent;
    if (p.fontFamily && FONTS.indexOf(p.fontFamily) >= 0) st.fontFamily = p.fontFamily;
    if (p.fontSize !== undefined) {
      var fs = parseFloat(p.fontSize);
      if (isFinite(fs)) st.fontSize = Math.round(Math.max(0.75, Math.min(1.5, fs)) * 100) / 100;
    }
    if (p.bgType && ["scheme", "color", "image"].indexOf(p.bgType) >= 0) st.bgType = p.bgType;
    if (p.bgColor && HEX.test(p.bgColor)) st.bgColor = p.bgColor;
    if (p.bgImage !== undefined) {
      if (p.bgImage === null) { st.bgImage = null; if (st.bgType === "image") st.bgType = "scheme"; }
      else if (goodImage(p.bgImage)) st.bgImage = p.bgImage;
    }
    if (p.bgFit && ["cover", "contain"].indexOf(p.bgFit) >= 0) st.bgFit = p.bgFit;
    if (p.bgBlur !== undefined) {
      var b = parseFloat(p.bgBlur);
      if (isFinite(b)) st.bgBlur = Math.max(0, Math.min(10, Math.round(b)));
    }
    if (st.bgType === "image" && !st.bgImage) st.bgType = "scheme";
    if (p.scheme === "oled" || p.scheme === "extreme") st.theme = "dark";
    else if (p.theme === "light" && (st.scheme === "oled" || st.scheme === "extreme")) st.scheme = "playgloss";

    save("theme", st.theme); save("scheme", st.scheme); save("accent", st.accent);
    save("font-family", st.fontFamily); save("font-size", String(st.fontSize));
    save("bg-type", st.bgType); save("bg-color", st.bgColor); save("bg-fit", st.bgFit); save("bg-blur", String(st.bgBlur));
    if (p.bgImage !== undefined || st.bgImage === null) ok = save("bg-image", st.bgImage);
    if (!ok) { st.bgImage = null; if (st.bgType === "image") st.bgType = "scheme"; save("bg-type", st.bgType); }
    apply();
    subs.forEach(function (f) { f(get()); });
    return { ok: ok };
  }
  apply();

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-toggle");
    if (btn) btn.addEventListener("click", function () { set({ theme: st.theme === "light" ? "dark" : "light" }); });
  });
  return { get: get, set: set, force: force, subscribe: function (f) { subs.push(f); }, MAX_IMAGE: MAX_IMAGE };
})();
