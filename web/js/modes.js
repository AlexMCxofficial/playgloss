// Game modes: Default or Extreme, and the Infinite switch. MIT License (see LICENSE).
// Saved only on this device (localStorage) and never sent anywhere. Off by default: you turn them on yourself.
//
//   mode     "default" | "extreme"   Extreme flips how often the levels come up (see core/wheel.js).
//   infinite true | false            Infinite: no 100 points goal, 3 hearts, play until they are gone.
//
// Switching the mode to Extreme also puts the look on Extreme (dark red). Switching back to Default puts the look back
// the way it was before, but only if you did not change it yourself in the meantime. The look and the mode are
// otherwise independent: you can use the Extreme look in Default mode and the other way round.
// Needs theme.js (PGTheme) on the same page.
var PGMode = (function () {
  var subs = [];
  var read = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var save = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var st = { mode:read("mode") === "extreme" ? "extreme" : "default", infinite:read("infinite") === "1" };

  function get() { return { mode:st.mode, extreme:st.mode === "extreme", infinite:st.infinite }; }

  // The look to go back to when leaving Extreme mode.
  function remembered() {
    try {
      var o = JSON.parse(read("look-before") || "null");
      if (o && (o.theme === "light" || o.theme === "dark") && ["playgloss", "oled", "yaru", "custom"].indexOf(o.scheme) >= 0) return o;
    } catch (e) {}
    return { theme:"dark", scheme:"playgloss" };
  }
  function syncLook(entering) {
    if (typeof PGTheme === "undefined") return;
    var look = PGTheme.get(), owned = read("mode-theme-owned") === "1";
    if (entering) {
      if (look.scheme !== "extreme") {
        save("look-before", JSON.stringify({ theme:look.theme, scheme:look.scheme }));
        save("mode-theme-owned", "1");
        PGTheme.set({ scheme:"extreme" });
      } else {
        // Someone chose the Extreme color separately; leave it independent of the mode.
        save("mode-theme-owned", "0");
      }
    } else {
      if (owned && look.scheme === "extreme") { // still the look the mode gave: put the old one back
        var b = remembered();
        PGTheme.set({ scheme:b.scheme, theme:b.theme });
      }
      save("mode-theme-owned", "0");
    }
  }

  // p: { mode, infinite }
  function set(p) {
    var was = st.mode;
    if (p.mode) st.mode = p.mode === "extreme" ? "extreme" : "default";
    if (typeof p.infinite === "boolean") st.infinite = p.infinite;
    save("mode", st.mode); save("infinite", st.infinite ? "1" : "0");
    if (st.mode !== was) syncLook(st.mode === "extreme");
    subs.forEach(function (f) { f(get()); });
  }
  return { get:get, set:set, subscribe:function (f) { subs.push(f); } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PGMode;
