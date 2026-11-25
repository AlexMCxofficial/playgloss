// Documentation navigation preferences: which side the navigation sits on (Settings > General > Documentation) and whether the
// sidebar is open on large screens. Saved only on this device (localStorage) and never sent anywhere. MIT License (see LICENSE).
// Loaded in the <head> of docs.html and settings.html so the layout is right before the page is painted.
var PGDocs = (function () {
  "use strict";
  var KEY_SIDE = "docs-side", KEY_OPEN = "docs-sidebar", root = document.documentElement, subs = [];
  // Phones are narrower than 768px. Below 1024px (phones and tablets) the navigation is a drawer opened with a button;
  // from 1024px up it is a sidebar that sits next to the text and can be switched on or off.
  var phoneQuery = window.matchMedia("(max-width: 767px)"), wideQuery = window.matchMedia("(min-width: 1024px)");
  var read = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var save = function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

  function side() { return read(KEY_SIDE) === "right" ? "right" : "left"; }
  // Phones always use the left: the choice is greyed out there.
  function shownSide() { return phoneQuery.matches ? "left" : side(); }
  function open() { return read(KEY_OPEN) !== "closed"; }
  function isPhone() { return phoneQuery.matches; }
  function isWide() { return wideQuery.matches; }

  function apply() {
    root.setAttribute("data-docs-side", shownSide());
    root.setAttribute("data-docs-sidebar", open() ? "open" : "closed");
  }
  function changed() { apply(); subs.forEach(function (f) { f(); }); }

  function setSide(v) { save(KEY_SIDE, v === "right" ? "right" : "left"); changed(); }
  function setOpen(on) { save(KEY_OPEN, on ? "open" : "closed"); changed(); }

  function listen(query) {
    if (query.addEventListener) query.addEventListener("change", changed);
    else if (query.addListener) query.addListener(changed);
  }
  listen(phoneQuery); listen(wideQuery);
  window.addEventListener("storage", function (e) { if (e.key === KEY_SIDE || e.key === KEY_OPEN) changed(); });

  apply();
  return {
    side: side, shownSide: shownSide, open: open, isPhone: isPhone, isWide: isWide,
    setSide: setSide, setOpen: setOpen,
    subscribe: function (f) { subs.push(f); }
  };
})();
