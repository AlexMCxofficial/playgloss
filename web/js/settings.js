// Settings page: theme, color scheme, fonts, background, modes, online, advanced. MIT License (see LICENSE).
// The choices are kept by theme.js, modes.js and advanced.js, only on this device.
(function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); }, picker = null, bgPicker = null;
  var FONT_LABELS = [["system", "System"], ["helvetica", "Helvetica"], ["arial", "Arial"], ["segoe", "Segoe UI"],
    ["compasse", "Compasse"], ["fira-code", "Fira Code"], ["jetbrains-mono", "JetBrains Mono"]];
  var BG_LABELS = [["scheme", "Scheme"], ["color", "Color"], ["image", "Image"]];
  var MAX_PICTURE_FILE = 20 * 1024 * 1024, MAX_EDGE = 1920;

  function buttons(box, list, attr) {
    if (!box || box.children.length) return;
    list.forEach(function (x) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "small"; b.setAttribute(attr, x[0]); b.textContent = x[1];
      box.appendChild(b);
    });
  }
  function pressed(attr, value) {
    Array.prototype.forEach.call(document.querySelectorAll("[" + attr + "]"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute(attr) === value);
    });
  }

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
        value: s.accent,
        onChange: function (c) { PGTheme.set({ scheme: "custom", accent: c }); }
      });
      $("custom-box").appendChild(picker.el);
    }

    // Fonts
    buttons($("font-family-buttons"), FONT_LABELS, "data-font-set");
    pressed("data-font-set", s.fontFamily);
    var pct = Math.round(s.fontSize * 100);
    if ($("font-size-slider") !== document.activeElement) $("font-size-slider").value = pct;
    if ($("font-size-input") !== document.activeElement) $("font-size-input").value = pct;

    // Background
    // The saved type can only be "image" once a picture exists (theme.js enforces this), so while the player is choosing
    // the first picture the page shows Image as the selected type without saving it yet.
    buttons($("bg-type-buttons"), BG_LABELS, "data-bg-type-set");
    var view = imageBoxOpen ? "image" : s.bgType;
    pressed("data-bg-type-set", view);
    $("bg-color-box").hidden = view !== "color";
    $("bg-image-box").hidden = view !== "image";
    $("bg-fit-row").hidden = view !== "image" || s.bgType !== "image";
    $("bg-blur-row").hidden = view !== "image" || s.bgType !== "image";
    if (s.bgType === "color") {
      if (!bgPicker) {
        bgPicker = ColorPicker.create({
          value: s.bgColor,
          onChange: function (c) { PGTheme.set({ bgType: "color", bgColor: c }); }
        });
        $("bg-color-box").appendChild(bgPicker.el);
      } else bgPicker.set(s.bgColor);
    }
    pressed("data-bg-fit", s.bgFit);
    $("bg-blur-slider").value = s.bgBlur;
    $("bg-blur-value").textContent = s.bgBlur;
    var preview = $("bg-image-preview");
    preview.hidden = !s.bgImage;
    if (s.bgImage) $("bg-image-preview-img").src = s.bgImage; // a data: picture that theme.js has already checked
    $("bg-image-clear").disabled = !s.bgImage;
  }
  // The picture box stays open while a picture is being chosen, even before Image is the saved type.
  var imageBoxOpen = false;

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

  // Documentation navigation side (kept by docsprefs.js). Phones always use the left, so the choice is greyed out there.
  function paintDocsSide() {
    var phone = PGDocs.isPhone(), side = PGDocs.side();
    Array.prototype.forEach.call(document.querySelectorAll("[data-docs-side-set]"), function (b) {
      b.setAttribute("aria-pressed", b.dataset.docsSideSet === (phone ? "left" : side));
      b.disabled = phone;
    });
    $("docs-side-row").classList.toggle("is-off", phone);
    $("docs-side-phone").hidden = !phone;
  }

  // Advanced Mode (kept by advanced.js; off unless the person turns it on)
  function paintAdvanced() {
    var adv = PGAdvanced.enabled();
    Array.prototype.forEach.call(document.querySelectorAll("[data-advanced-set]"), function (b) {
      b.setAttribute("aria-pressed", (b.dataset.advancedSet === "on") === adv);
    });
    $("advanced-note").hidden = !adv;
  }

  // The picture the player chose, made small enough for a screen (and for the browser's storage): the longest side is at most
  // 1920 pixels, and it is saved as a JPEG. Transparent parts are filled with the page color.
  function shrink(file, done) {
    var msg = $("bg-image-msg");
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { msg.textContent = "Please choose a PNG, JPEG, WebP or GIF picture."; return; }
    if (file.size > MAX_PICTURE_FILE) { msg.textContent = "That picture is too big (the limit is 20 MB)."; return; }
    var reader = new FileReader();
    reader.onerror = function () { msg.textContent = "The picture could not be read."; };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { msg.textContent = "That file is not a picture this device can show."; };
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { msg.textContent = "That file is not a picture this device can show."; return; }
        var k = Math.min(1, MAX_EDGE / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
        var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
        var cx = cv.getContext("2d");
        cx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#000";
        cx.fillRect(0, 0, cw, ch);
        cx.drawImage(img, 0, 0, cw, ch);
        var q = 0.85, url = cv.toDataURL("image/jpeg", q);
        while (url.length > PGTheme.MAX_IMAGE && q > 0.3) { q -= 0.15; url = cv.toDataURL("image/jpeg", q); }
        if (url.length > PGTheme.MAX_IMAGE) { msg.textContent = "That picture is too detailed to keep on this device. Try a smaller one."; return; }
        done(url);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("button[data-theme-set]"), c = e.target.closest("button[data-scheme-set]"), o = e.target.closest("button[data-online-set]");
    var md = e.target.closest("button[data-mode-set]"), inf = e.target.closest("button[data-infinite-set]");
    var fnt = e.target.closest("button[data-font-set]"), bgType = e.target.closest("button[data-bg-type-set]");
    var bgFit = e.target.closest("button[data-bg-fit]"), adv = e.target.closest("button[data-advanced-set]");
    var docsSide = e.target.closest("button[data-docs-side-set]");
    if (docsSide) { if (!PGDocs.isPhone()) PGDocs.setSide(docsSide.dataset.docsSideSet); }
    else if (md) PGMode.set({ mode: md.dataset.modeSet });
    else if (inf) PGMode.set({ infinite: inf.dataset.infiniteSet === "on" });
    else if (t) PGTheme.set({ theme: t.dataset.themeSet });
    else if (c) PGTheme.set({ scheme: c.dataset.schemeSet });
    else if (fnt) PGTheme.set({ fontFamily: fnt.dataset.fontSet });
    else if (bgType) {
      var type = bgType.dataset.bgTypeSet;
      if (type === "image" && !PGTheme.get().bgImage) { imageBoxOpen = true; $("bg-image-msg").textContent = "Choose a picture to use it as the background."; paint(); return; }
      imageBoxOpen = false; $("bg-image-msg").textContent = "";
      PGTheme.set({ bgType: type });
    }
    else if (bgFit) PGTheme.set({ bgFit: bgFit.dataset.bgFit });
    else if (adv) { PGAdvanced.setEnabled(adv.dataset.advancedSet === "on"); paintAdvanced(); }
    else if (o && APP) {
      try { localStorage.setItem("online", o.dataset.onlineSet === "on" ? "1" : "0"); } catch (x) {}
      paintOnline();
    }
    else if (e.target.id === "bg-image-clear") {
      imageBoxOpen = false; $("bg-image-input").value = ""; $("bg-image-msg").textContent = "";
      PGTheme.set({ bgImage: null });
    }
  });

  // Text size: the slider and the number box move together (75 to 150 percent)
  document.addEventListener("input", function (e) {
    var id = e.target.id;
    if (id === "font-size-slider") {
      var v = parseInt(e.target.value, 10);
      $("font-size-input").value = v;
      PGTheme.set({ fontSize: v / 100 });
    } else if (id === "font-size-input") {
      var n = parseInt(e.target.value, 10);
      if (n >= 75 && n <= 150) { $("font-size-slider").value = n; PGTheme.set({ fontSize: n / 100 }); }
    } else if (id === "bg-blur-slider") {
      PGTheme.set({ bgBlur: parseInt(e.target.value, 10) });
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "font-size-input") { // a number outside 75 to 150 snaps back when the box is left
      var n = parseInt(e.target.value, 10);
      n = isFinite(n) ? Math.max(75, Math.min(150, n)) : 100;
      e.target.value = n; $("font-size-slider").value = n; PGTheme.set({ fontSize: n / 100 });
    } else if (e.target.id === "bg-image-input") {
      var file = e.target.files && e.target.files[0], msg = $("bg-image-msg");
      if (!file) return;
      msg.textContent = "Preparing your picture...";
      shrink(file, function (url) {
        var res = PGTheme.set({ bgType: "image", bgImage: url });
        imageBoxOpen = false;
        msg.textContent = res.ok ? "Your picture is the background now." : "This device has no room to keep that picture. Try a smaller one.";
        paint();
      });
    }
  });

  PGTheme.subscribe(paint);
  PGMode.subscribe(paintModes);
  PGDocs.subscribe(paintDocsSide);
  paintDocsSide();
  paint();
  paintModes();
  paintOnline();
  paintAdvanced();
})();
