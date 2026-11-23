// Shared overlays: power-up choice, question, egg, and ask dialog. MIT License (see LICENSE).
// Used by both host (ui.js) and guest (join.js). Never sends the right answer to a guest.
var Overlays = (function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  var h = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  var fmt = function (n) { return n % 1 ? n.toFixed(1) : String(n); };
  var pl = function (n, w) { return fmt(n) + " " + w + (n === 1 ? "" : "s"); };
  var PU = [["x2", "2x"], ["x3", "3x"], ["shield", "Shield"]];
  var SL = Wheel.slices;

  // Power-up choice: shown after difficulty, before word. Returns a Promise that resolves with the chosen power-up (or null).
  function powerUp(g, lv) {
    return new Promise(function (resolve) {
      var p = g.players[g.turn], i = p.inv;
      $("pu-title").textContent = p.name + ": " + lv.name;
      $("pu-info").textContent = pl(lv.points, "point") + ", " + lv.time + " seconds. Use a power-up before you see the word?";
      var box = $("pu-btns");
      var paint = function () {
        box.textContent = "";
        PU.forEach(function (b) {
          if (!i[b[0]]) return;
          var e = h("button", "small", b[1] + " (" + i[b[0]] + ")");
          e.setAttribute("aria-pressed", p.armed === b[0]);
          e.onclick = function () { Game.arm(g, b[0]); paint(); };
          box.appendChild(e);
        });
      };
      paint();
      $("pu").hidden = false; $("pu-go").focus();
      $("pu-go").onclick = function () { $("pu").hidden = true; resolve(p.armed); };
    });
  }

  // Picks the next word of a level and shuffles its answers. The host calls this once per question, so the screen
  // that shows the question and the screen that judges it always agree.
  // Extreme mode draws from the Extreme list (words.js), which has many more words on the hard levels because they
  // come up so often. Where that list is missing a level, the normal list is used.
  // Only the picked word is read out of the pack; no list is kept in memory.
  function pick(lv, extreme) {
    var n = Words.count(lv.id, extreme), u = used[lv.id] || (used[lv.id] = []), seen = {}, pool = [], k;
    u.forEach(function (x) { seen[x] = 1; });
    for (k = 0; k < n; k++) if (!seen[Words.word(lv.id, extreme, k)]) pool.push(k);
    if (!pool.length) { u.length = 0; for (k = 0; k < n; k++) pool.push(k); }
    var w = Words.get(lv.id, extreme, pool[Math.floor(Math.random() * pool.length)]); u.push(w.word);
    var opts = shuffle([w.meaning].concat(w.wrong).map(function (t, k) { return { t: t, ok: k === 0 }; }));
    return { word: w.word, opts: opts, right: opts.findIndex(function (o) { return o.ok; }) };
  }

  // Question overlay on this screen: shows word and shuffled options. pre is a question made by pick() (a new one
  // is picked when it is missing). Returns a Promise that resolves with the result.
  function question(g, lv, pre) {
    return new Promise(function (resolve) {
      var q = pre || pick(lv, g.extreme), w = { word: q.word }, opts = q.opts;
      var boost = g.players[g.turn].armed, finished = false;
      $("q-level").textContent = lv.name + ", " + pl(lv.points, "point") + (boost ? ", " + (boost === "shield" ? "Shield" : boost.replace("x", "") + "x") + " active" : "");
      $("q-word").textContent = w.word;
      var box = $("q-opts"); box.textContent = "";
      opts.forEach(function (o, k) { var b = h("button", "opt", o.t); b.onclick = function () { done(k); }; box.appendChild(b); });
      $("q-next").hidden = true; $("q").hidden = false;
      var end = Date.now() + lv.time * 1000;
      var tm = setInterval(function () {
        var left = Math.max(0, end - Date.now());
        $("bar").style.width = (left / (lv.time * 1000) * 100) + "%";
        $("secs").textContent = Math.ceil(left / 1000) + "s";
        if (!left) done(null);
      }, 100);
      function done(k) {
        if (finished) return; finished = true;
        clearInterval(tm);
        var kids = box.children;
        for (var j = 0; j < kids.length; j++) { kids[j].disabled = true; if (opts[j].ok) kids[j].classList.add("right"); else if (j === k) kids[j].classList.add("wrong"); }
        var ok = k !== null && opts[k].ok, pts = Game.answer(g, lv, ok);
        resolve({ ok: ok, pts: pts, k: k, word: w.word, right: opts.findIndex(function (o) { return o.ok; }) });
      }
    });
  }

  // Egg overlay
  function egg(shared, cb) {
    var one = Math.round(Wheel.total / SL[SL.length - 1].weight / 50) * 50;
    $("egg-odds").textContent = one.toLocaleString("en-US");
    $("egg-extra").textContent = shared ? "Both teams hit it, so both teams win." : "";
    $("egg").hidden = false; $("egg-ok").focus();
    $("egg-ok").onclick = function () { $("egg").hidden = true; cb(); };
  }

  // Generic ask dialog. Questions wait their turn, so a second one never tries to open over the first.
  var askQueue = Promise.resolve();
  function ask(text, btns) {
    var p = askQueue.then(function () {
      return new Promise(function (res) {
        var d = $("dlg"), box = $("dlg-btns"); $("dlg-text").textContent = text; box.textContent = "";
        d.oncancel = function (e) { e.preventDefault(); };
        btns.forEach(function (b, k) { var e = h("button", "small", b); e.onclick = function () { d.close(); res(k); }; box.appendChild(e); });
        d.showModal();
      });
    });
    askQueue = p.catch(function () {});
    return p;
  }
  // Drops every open or waiting question (the game they belong to is over). Their answers never arrive.
  function cancelAsk() { askQueue = Promise.resolve(); var d = $("dlg"); if (d.open) d.close(); }

  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // These need to be available globally for the host game loop
  var used = {};

  return { powerUp: powerUp, pick: pick, question: question, egg: egg, ask: ask, cancelAsk: cancelAsk, shuffle: shuffle, PU: PU, used: used };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Overlays;