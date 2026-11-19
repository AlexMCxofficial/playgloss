// Color picker: 16 presets, hex, RGB sliders and a color wheel. MIT License (see LICENSE).
// Used for team colors on the play page and for the custom accent color in Settings.
var ColorPicker = (function () {
  var PRESETS = [["White","#ffffff"],["Light Gray","#c8c8c8"],["Gray","#808080"],["Black","#000000"],
    ["Brown","#8b5a2b"],["Red","#e03131"],["Orange","#f28c1c"],["Yellow","#f2d024"],
    ["Lime","#84cc16"],["Green","#2e9e44"],["Cyan","#17c3d4"],["Light Blue","#74c0fc"],
    ["Blue","#2f80ed"],["Purple","#8e44c9"],["Magenta","#e6199b"],["Pink","#ff9ecb"]];
  var CLOSE = 14;   // two colors with a Lab distance below this look the same side by side

  /* ---------- color math ---------- */
  // "#abc", "abc", "#AABBCC" ... -> "#aabbcc", or null if it is not a color
  function norm(s) {
    s = String(s == null ? "" : s).trim().toLowerCase().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/.test(s)) s = s.replace(/./g, "$&$&");
    return /^[0-9a-f]{6}$/.test(s) ? "#" + s : null;
  }
  function rgb(c) { var n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function toHex(r, g, b) {
    return "#" + [r, g, b].map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join("");
  }
  // h 0-360, s and v 0-1
  function toHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), d = mx - Math.min(r, g, b), h = 0;
    if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h:h * 60, s:mx ? d / mx : 0, v:mx };
  }
  function fromHsv(h, s, v) {
    var f = function (n) { var k = (n + h / 60) % 6; return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255; };
    return [f(5), f(3), f(1)];
  }
  function lab(c) {
    var v = rgb(c).map(function (x) { x /= 255; return x <= .04045 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); });
    var X = (v[0] * .4124564 + v[1] * .3575761 + v[2] * .1804375) / .95047;
    var Y = v[0] * .2126729 + v[1] * .7151522 + v[2] * .072175;
    var Z = (v[0] * .0193339 + v[1] * .119192 + v[2] * .9503041) / 1.08883;
    var f = function (t) { return t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; };
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  function diff(a, b) {
    var p = lab(a), q = lab(b);
    return Math.sqrt(Math.pow(p[0] - q[0], 2) + Math.pow(p[1] - q[1], 2) + Math.pow(p[2] - q[2], 2));
  }
  var close = function (a, b) { return diff(a, b) < CLOSE; };
  function name(c) {
    var p = PRESETS.filter(function (x) { return x[1] === c; })[0];
    return p ? p[0] : c.toUpperCase();
  }

  /* ---------- the widget ---------- */
  var mk = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  // o: { value, accept(hex) -> true/false, refuse (text), onChange(hex) }
  function create(o) {
    var cur = norm(o.value) || "#2f80ed", st = { h:0, s:0, v:0 };
    var root = mk("div", "cp"), head = mk("div", "cp-head"), chip = mk("span", "cp-chip"), label = mk("span", "cp-name");
    var tabs = mk("div", "cp-tabs"), msg = mk("p", "cp-msg"), views = {}, tabBtns = {};
    head.appendChild(chip); head.appendChild(label);
    tabs.setAttribute("role", "tablist"); msg.setAttribute("role", "status");

    function adopt(c) {   // keep the old hue when the new color has none (gray, black)
      var t = toHsv.apply(null, rgb(c));
      if (t.v > 0) { st.s = t.s; if (t.s > 0) st.h = t.h; }
      st.v = t.v;
    }
    adopt(cur);
    function ok(c) {
      if (c === cur || !o.accept || o.accept(c)) { msg.textContent = ""; return true; }
      msg.textContent = o.refuse || "That color is not available.";
      return false;
    }
    function commit(c) { var changed = c !== cur; cur = c; paint(); if (changed && o.onChange) o.onChange(cur); }
    function fromHex(c) { if (!ok(c)) return false; adopt(c); commit(c); return true; }
    function fromWheel(h, s, v) {
      var c = toHex.apply(null, fromHsv(h, s, v));
      if (!ok(c)) return false;
      st.h = h; st.s = s; st.v = v; commit(c); return true;
    }

    /* presets */
    var vPre = mk("div", "swatches"), sws = [];
    PRESETS.forEach(function (p) {
      var b = mk("button", "sw"); b.type = "button"; b.style.backgroundColor = p[1]; b.dataset.c = p[1];
      b.onclick = function () { if (!b.disabled) fromHex(p[1]); };
      vPre.appendChild(b); sws.push(b);
    });

    /* hex */
    var vHex = mk("div", "cp-hex"), hexIn = mk("input");
    hexIn.type = "text"; hexIn.maxLength = 7; hexIn.autocomplete = "off"; hexIn.spellcheck = false; hexIn.setAttribute("aria-label", "Hex color");
    hexIn.addEventListener("input", function () { if (/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hexIn.value.trim())) fromHex(norm(hexIn.value)); });
    hexIn.addEventListener("change", function () { hexIn.value = cur.toUpperCase(); msg.textContent = ""; });
    vHex.appendChild(mk("span", "", "Hex")); vHex.appendChild(hexIn);

    /* RGB */
    var vRgb = mk("div", "cp-rgb"), rng = [], num = [];
    ["R", "G", "B"].forEach(function (ch, k) {
      var row = mk("div", "cp-row"), r = mk("input"), n = mk("input");
      r.type = "range"; r.min = 0; r.max = 255; r.setAttribute("aria-label", ["Red", "Green", "Blue"][k] + " slider");
      n.type = "number"; n.min = 0; n.max = 255; n.setAttribute("aria-label", ["Red", "Green", "Blue"][k] + " value");
      var read = function (src) {
        var v = Math.round(+src.value);
        if (src.value === "" || isNaN(v)) return;
        var c = rgb(cur); c[k] = Math.max(0, Math.min(255, v));
        fromHex(toHex(c[0], c[1], c[2]));
      };
      r.addEventListener("input", function () { read(r); });
      n.addEventListener("input", function () { read(n); });
      var back = function () { paint(true); msg.textContent = ""; };
      r.addEventListener("change", back); n.addEventListener("change", back);
      row.appendChild(mk("span", "", ch)); row.appendChild(r); row.appendChild(n);
      vRgb.appendChild(row); rng.push(r); num.push(n);
    });

    /* wheel */
    var SIZE = 168, K = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    var vWheel = mk("div", "cp-wheelbox"), cv = mk("canvas", "cp-wheel"), ctx = null, base = null, baseV = -1, down = false;
    cv.width = cv.height = Math.round(SIZE * K); cv.style.width = cv.style.height = SIZE + "px";
    cv.setAttribute("aria-hidden", "true");
    var bright = mk("input"), bl = mk("label", "cp-bright");
    bright.type = "range"; bright.min = 0; bright.max = 100; bright.setAttribute("aria-label", "Brightness");
    bright.addEventListener("input", function () { fromWheel(st.h, st.s, bright.value / 100); });
    bright.addEventListener("change", function () { paint(true); msg.textContent = ""; });
    bl.appendChild(mk("span", "", "Brightness")); bl.appendChild(bright);
    vWheel.appendChild(cv); vWheel.appendChild(bl);

    function drawWheel() {
      if (!ctx) ctx = cv.getContext && cv.getContext("2d");
      if (!ctx) return;
      var n = cv.width, R = n / 2;
      if (baseV !== st.v) {
        base = ctx.createImageData(n, n);
        var d = base.data;
        for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
          var dx = x + .5 - R, dy = y + .5 - R, r = Math.sqrt(dx * dx + dy * dy);
          if (r > R) continue;
          var c = fromHsv((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, r / R, st.v), i = (y * n + x) * 4;
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        }
        baseV = st.v;
      }
      ctx.putImageData(base, 0, 0);
      var a = st.h * Math.PI / 180, mx = R + Math.cos(a) * st.s * R, my = R + Math.sin(a) * st.s * R;
      ctx.beginPath(); ctx.arc(mx, my, 7 * K, 0, 6.2832);
      ctx.lineWidth = 3 * K; ctx.strokeStyle = "#fff"; ctx.stroke();
      ctx.lineWidth = 1.5 * K; ctx.strokeStyle = "#000"; ctx.stroke();
    }
    function at(e) {
      var r = cv.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      fromWheel((Math.atan2(y, x) * 180 / Math.PI + 360) % 360, Math.min(1, Math.sqrt(x * x + y * y) / (r.width / 2)), st.v < .05 ? 1 : st.v);
    }
    cv.addEventListener("pointerdown", function (e) { down = true; if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId); at(e); if (e.preventDefault) e.preventDefault(); });
    cv.addEventListener("pointermove", function (e) { if (down) at(e); });
    ["pointerup", "pointercancel"].forEach(function (t) { cv.addEventListener(t, function () { down = false; if (document.activeElement !== cv) paint(true); }); });

    /* show the current color everywhere (force: also the box being typed in) */
    function paint(force) {
      chip.style.backgroundColor = cur; label.textContent = name(cur);
      sws.forEach(function (b) {
        var c = b.dataset.c, same = c === cur, taken = !same && o.accept && !o.accept(c);
        b.disabled = !!taken; b.setAttribute("aria-pressed", same);
        b.title = name(c) + (taken ? " (too close to the other side's color)" : "");
        b.setAttribute("aria-label", b.title);
      });
      var c3 = rgb(cur);
      if (force || document.activeElement !== hexIn) hexIn.value = cur.toUpperCase();
      for (var k = 0; k < 3; k++) {
        if (force || document.activeElement !== rng[k]) rng[k].value = c3[k];
        if (force || document.activeElement !== num[k]) num[k].value = c3[k];
      }
      bright.value = Math.round(st.v * 100);
      if (!views.wheel.hidden) drawWheel();
    }

    [["presets", "Presets", vPre], ["hex", "Hex", vHex], ["rgb", "RGB", vRgb], ["wheel", "Wheel", vWheel]].forEach(function (t) {
      var b = mk("button", "cp-tab", t[1]); b.type = "button"; b.setAttribute("role", "tab");
      b.onclick = function () { show(t[0]); };
      tabs.appendChild(b); tabBtns[t[0]] = b; views[t[0]] = t[2]; t[2].hidden = true;
      t[2].setAttribute("role", "tabpanel");
    });
    function show(k) {
      Object.keys(views).forEach(function (n) { views[n].hidden = n !== k; tabBtns[n].setAttribute("aria-selected", n === k); });
      paint(true);
    }
    root.appendChild(head); root.appendChild(tabs);
    Object.keys(views).forEach(function (n) { root.appendChild(views[n]); });
    root.appendChild(msg);
    show("presets");

    return { el:root, refresh:function () { paint(); }, get:function () { return cur; },
      set:function (c) { c = norm(c); if (c) { adopt(c); cur = c; paint(true); } } };
  }

  return { PRESETS:PRESETS, norm:norm, name:name, close:close, diff:diff, rgb:rgb, create:create };
})();
