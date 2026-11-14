(function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  var NAME = { red:"Red", blue:"Blue" }, SL = Wheel.slices;
  var PU = [["x2","2x"],["x3","3x"],["shield","Shield"]];
  var g = Game.create(), busy = false, rot = 0, used = {}, tm = null, sd = null;
  var fmt = function (n) { return n % 1 ? n.toFixed(1) : String(n); };
  var pl = function (n, w) { return fmt(n) + " " + w + (n === 1 ? "" : "s"); };
  var say = function (t) { $("msg").textContent = t; };
  var shuffle = function (a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

  function build() {
    var n = SL.length, a = 360 / n, R = 96;
    var pt = function (d, r) { var t = (d - 90) * Math.PI / 180; return [100 + r * Math.cos(t), 100 + r * Math.sin(t)].map(function (v) { return v.toFixed(2); }); };
    var s = '<svg viewBox="0 0 200 200" aria-hidden="true">';
    SL.forEach(function (c, i) {
      var p1 = pt(i * a, R), p2 = pt((i + 1) * a, R), m = (i + .5) * a, t = pt(m, 58);
      s += '<path d="M100 100L' + p1[0] + " " + p1[1] + "A" + R + " " + R + " 0 0 1 " + p2[0] + " " + p2[1] + 'Z" fill="' + c.color + '" stroke="var(--fg)" stroke-width=".6"/>' +
        '<text x="' + t[0] + '" y="' + t[1] + '" transform="rotate(' + (m > 180 ? m + 90 : m - 90) + " " + t[0] + " " + t[1] + ')" text-anchor="middle" dominant-baseline="central" font-size="6.5" fill="' + c.ink + '">' + c.label + "</text>";
    });
    $("wheel").innerHTML = s + "</svg>";
  }

  function inv(i) {
    var out = PU.filter(function (b) { return i[b[0]]; }).map(function (b) { return b[1] + " ×" + i[b[0]]; });
    return out.join("  ") || "No power-ups";
  }

  function render() {
    ["red", "blue"].forEach(function (p) {
      $("s-" + p).textContent = fmt(g.score[p]);
      $("i-" + p).textContent = inv(g.inv[p]);
      $("c-" + p).classList.toggle("on", !g.over && g.turn === p);
    });
    var idle = !busy && !g.over;
    $("turn").textContent = g.over ? (g.winner ? NAME[g.winner] + " wins: " + g.reason : "Draw: " + g.reason)
      : sd ? "Sudden death: " + NAME[g.turn] + " spins" : NAME[g.turn] + "'s turn";
    $("spin").disabled = !idle;
    $("resign").disabled = !idle || !!sd;
    $("draw").disabled = !idle || !!sd || g.offered;
    $("new").hidden = !g.over;
  }

  function ask(text, btns) {
    return new Promise(function (res) {
      var d = $("dlg"), box = $("dlg-btns"); $("dlg-text").textContent = text; box.innerHTML = "";
      d.oncancel = function (e) { e.preventDefault(); };
      btns.forEach(function (b, k) { var e = document.createElement("button"); e.className = "small"; e.textContent = b; e.onclick = function () { d.close(); res(k); }; box.appendChild(e); });
      d.showModal();
    });
  }

  function egg(shared, cb) {
    var one = Math.round(Wheel.total / SL[SL.length - 1].weight / 50) * 50;
    $("egg-odds").textContent = one.toLocaleString("en-US");
    $("egg-extra").textContent = shared ? "Both teams hit it, so both teams win." : "";
    $("egg").hidden = false; $("egg-ok").focus();
    $("egg-ok").onclick = function () { $("egg").hidden = true; cb(); };
  }

  function spin() {
    if (busy || g.over) return;
    busy = true; say(""); render();
    var res = Wheel.pick(), i = SL.indexOf(res), a = 360 / SL.length;
    var want = ((-(i + .5) * a) % 360 + 360) % 360, cur = ((rot % 360) + 360) % 360;
    rot += ((want - cur + 360) % 360) + 1800;
    var rm = matchMedia("(prefers-reduced-motion: reduce)").matches, w = $("wheel");
    w.style.transition = rm ? "transform .2s" : "transform 4s cubic-bezier(.15,.7,.1,1)";
    w.style.transform = "rotate(" + rot + "deg)";
    setTimeout(function () { landed(res); }, rm ? 250 : 4100);
  }

  function landed(res) {
    if (sd) return sdLand(res);
    if (res.points !== undefined) return reveal(res);
    if (res.id === "egg") { say(NAME[g.turn] + " hit the Easter egg!"); return egg(false, finish); }
    Game.grant(g, res.id);
    say(NAME[g.turn] + " got " + res.name + (res.id === "free" ? ": +5 points." : ". Turn used."));
    finish();
  }

  // Difficulty is shown first; power-ups are chosen here, before the word appears.
  function reveal(lv) {
    var p = g.turn, i = g.inv[p];
    if (!(i.x2 || i.x3 || i.shield)) return question(lv);
    $("pu-title").textContent = NAME[p] + ": " + lv.name;
    $("pu-info").textContent = pl(lv.points, "point") + ", " + lv.time + " seconds. Use a power-up before you see the word?";
    var box = $("pu-btns");
    var paint = function () {
      box.innerHTML = "";
      PU.forEach(function (b) {
        if (!i[b[0]]) return;
        var e = document.createElement("button"); e.className = "small"; e.textContent = b[1] + " (" + i[b[0]] + ")";
        e.setAttribute("aria-pressed", g.armed[p] === b[0]);
        e.onclick = function () { Game.arm(g, b[0]); paint(); };
        box.appendChild(e);
      });
    };
    paint();
    $("pu").hidden = false; $("pu-go").focus();
    $("pu-go").onclick = function () { $("pu").hidden = true; question(lv); };
  }

  function finish() {
    var r = Game.endTurn(g); busy = false;
    if (r === "sudden") { sd = { who:"red", vals:{} }; g.turn = "red"; say("Tied at " + fmt(g.score.red) + ". Each team spins once; the higher result wins."); }
    render();
  }

  function sdLand(res) {
    sd.vals[sd.who] = Game.value(res); say(NAME[sd.who] + " got " + res.name + ".");
    var go = function () {
      if (sd.who === "red") { sd.who = "blue"; g.turn = "blue"; busy = false; return render(); }
      var r = sd.vals.red, b = sd.vals.blue;
      if (r !== b) { g.over = true; g.winner = r > b ? "red" : "blue"; g.reason = "won sudden death"; sd = null; busy = false; return render(); }
      if (r !== Game.value({ id:"egg" })) { say("Tied again. Each team spins once more."); sd.who = "red"; g.turn = "red"; busy = false; return render(); }
      egg(true, function () { g.over = true; g.winner = null; g.reason = "both teams share the win"; sd = null; busy = false; render(); });
    };
    if (res.id === "egg") egg(false, go); else go();
  }

  function question(lv) {
    var list = WORDS[lv.id], u = used[lv.id] || (used[lv.id] = []);
    var pool = list.filter(function (w) { return u.indexOf(w.word) < 0; });
    if (!pool.length) { u.length = 0; pool = list; }
    var w = pool[Math.floor(Math.random() * pool.length)]; u.push(w.word);
    var opts = shuffle([w.meaning].concat(w.wrong).map(function (t, k) { return { t:t, ok:k === 0 }; }));
    var boost = g.armed[g.turn], finished = false;
    $("q-level").textContent = lv.name + ", " + pl(lv.points, "point") + (boost ? ", " + (boost === "shield" ? "Shield" : boost.replace("x", "") + "x") + " active" : "");
    $("q-word").textContent = w.word;
    var box = $("q-opts"); box.innerHTML = "";
    opts.forEach(function (o, k) { var b = document.createElement("button"); b.className = "opt"; b.textContent = o.t; b.onclick = function () { done(k); }; box.appendChild(b); });
    $("q-next").hidden = true; $("q").hidden = false;
    var end = Date.now() + lv.time * 1000;
    clearInterval(tm);
    tm = setInterval(function () {
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
      say((k === null ? "Time is up. " : ok ? "Correct. " : "Wrong. ") + NAME[g.turn] + " gets " + pl(pts, "point") + ".");
      render();
      $("q-next").hidden = false; $("q-next").focus();
      $("q-next").onclick = function () { $("q").hidden = true; finish(); };
    }
  }

  $("spin").onclick = spin;
  $("resign").onclick = function () {
    ask(NAME[g.turn] + ", resign the game?", ["Resign", "Cancel"]).then(function (k) { if (k === 0) { Game.resign(g); render(); } });
  };
  $("draw").onclick = function () {
    g.offered = true; render();
    ask(NAME[Game.other(g.turn)] + ", " + NAME[g.turn] + " offers a draw. Accept?", ["Accept draw", "Decline"]).then(function (k) {
      if (k === 0) Game.draw(g); else say("Draw declined.");
      render();
    });
  };
  $("new").onclick = function () { g = Game.create(); used = {}; sd = null; busy = false; say(""); render(); };

  build(); render();
})();
