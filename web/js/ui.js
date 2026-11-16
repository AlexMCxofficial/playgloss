// Play page: setup screen, the wheel, questions and the side panels. MIT License (see LICENSE).
(function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  var SL = Wheel.slices, CP = ColorPicker, KEY = "playgloss-session-v3";
  var PU = [["x2","2x"],["x3","3x"],["shield","Shield"]];
  var MODES = [["solo","Solo"],["1v1","1 vs 1"],["2v2","2 vs 2"]];
  var STYLES = [["b","Bold"],["i","Italic"],["u","Underline"]];
  var cfg = defaults(), g = null, sd = null, used = {}, busy = false, rot = 0, tm = null, tab = "game", pickers = [];

  var h = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  var fmt = function (n) { return n % 1 ? n.toFixed(1) : String(n); };
  var pl = function (n, w) { return fmt(n) + " " + w + (n === 1 ? "" : "s"); };
  var say = function (t) { $("msg").textContent = t; };
  var who = function () { return g.players[g.turn].name; };
  var tint = function (e, ti) { e.style.setProperty("--team", g.teams[ti].color); return e; };
  var shuffle = function (a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  var clean = function (v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, 16); };
  var fixFmt = function (v) { v = String(v || ""); return STYLES.map(function (s) { return s[0]; }).filter(function (c) { return v.indexOf(c) >= 0; }).join(""); };
  // A name with the player's bold / italic / underline choices.
  var nm = function (name, f) { return h("span", "nm" + (f ? f.replace(/./g, " $&") : ""), name); };
  var fill = function (el, parts) { el.textContent = ""; parts.forEach(function (x) { el.appendChild(typeof x === "string" ? h("span", "", x) : x); }); };
  var other = function (ti) { return ti ? 0 : 1; };

  /* ---------- settings (names, text styles and colors) ---------- */
  function defaults() {
    return { mode:"1v1", teams:[
      { name:"Red", fmt:"", color:"#e03131", players:["Player 1", "Player 2"], pfmt:["", ""] },
      { name:"Blue", fmt:"", color:"#2f80ed", players:["Player 3", "Player 4"], pfmt:["", ""] }] };
  }
  function okName(v, dflt) { v = clean(v); return v && !Filter.bad(v) ? v : dflt; }
  // If the two sides ended up with look-alike colors, give side 2 red or blue.
  function apart(c) {
    if (CP.close(c.teams[0].color, c.teams[1].color)) c.teams[1].color = CP.close(c.teams[0].color, "#2f80ed") ? "#e03131" : "#2f80ed";
  }
  function fixCfg(c) {
    var d = defaults();
    if (!c || !MODES.some(function (m) { return m[0] === c.mode; }) || !c.teams || c.teams.length !== 2) return d;
    d.mode = c.mode;
    d.teams.forEach(function (t, i) {
      var s = c.teams[i] || {};
      t.name = okName(s.name, t.name); t.fmt = fixFmt(s.fmt); t.color = CP.norm(s.color) || t.color;
      t.players = t.players.map(function (p, k) { return okName(s.players && s.players[k], p); });
      t.pfmt = t.pfmt.map(function (f, k) { return fixFmt(s.pfmt && s.pfmt[k]); });
    });
    apart(d);
    return d;
  }

  /* ---------- keep the game while you visit Home or Documentation (this tab only) ---------- */
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify({ v:3, cfg:cfg, g:g, sd:sd, used:used, tab:tab, pending:busy })); } catch (e) {}
  }
  // Returns true if a turn was cut short by leaving the page (it is skipped).
  function restore() {
    var skipped = false;
    try {
      var s = JSON.parse(sessionStorage.getItem(KEY));
      if (!s || s.v !== 3) return false;
      cfg = fixCfg(s.cfg);
      if (!s.g || !s.g.players || !s.g.teams || !s.g.order) return false;
      g = s.g; sd = s.sd || null; used = s.used || {}; tab = s.tab || "game";
      if (s.pending && !g.over && !sd) {
        g.players[g.turn].armed = null;
        if (Game.endTurn(g) === "sudden") startSudden();
        skipped = true;
      }
    } catch (e) { g = null; sd = null; used = {}; }
    return skipped;
  }

  /* ---------- setup screen ---------- */
  function showSetup() {
    g = null; sd = null; busy = false; clearInterval(tm);
    $("game").hidden = true; $("setup").hidden = false;
    drawSetup(); save();
  }
  function drawSetup() {
    var box = $("setup-body"), solo = cfg.mode === "solo", modes = h("div", "row"), panels = h("div", "panels");
    if (!solo) apart(cfg);
    pickers = []; box.textContent = "";
    modes.setAttribute("role", "group"); modes.setAttribute("aria-label", "Game mode");
    MODES.forEach(function (m) {
      var b = h("button", "small", m[1]); b.type = "button";
      b.setAttribute("aria-pressed", cfg.mode === m[0]);
      b.onclick = function () { cfg.mode = m[0]; drawSetup(); save(); };
      modes.appendChild(b);
    });
    box.appendChild(modes);
    for (var ti = 0; ti < (solo ? 1 : 2); ti++) panels.appendChild(panel(ti));
    box.appendChild(panels);
  }
  // A name box with bold / italic / underline buttons.
  function field(label, val, f, set, setF) {
    var wrap = h("div", "field"), row = h("div", "frow"), i = h("input"), ok = val;
    i.type = "text"; i.maxLength = 16; i.value = val; i.autocomplete = "off"; i.spellcheck = false; i.setAttribute("aria-label", label);
    var look = function () { i.className = f.replace(/./g, "f$& ").trim(); };
    i.oninput = function () { set(i.value); save(); };
    i.onchange = function () {
      var v = clean(i.value);
      if (v && Filter.bad(v)) { warn(); v = ok; } else if (v) ok = v;
      i.value = v || ok; set(i.value); save();
    };
    row.appendChild(i);
    STYLES.forEach(function (s) {
      var b = h("button", "fmt " + s[0], s[0].toUpperCase()); b.type = "button";
      b.setAttribute("aria-label", s[1]); b.setAttribute("aria-pressed", f.indexOf(s[0]) >= 0);
      b.onclick = function () {
        f = f.indexOf(s[0]) >= 0 ? f.replace(s[0], "") : fixFmt(f + s[0]);
        b.setAttribute("aria-pressed", f.indexOf(s[0]) >= 0); look(); setF(f); save();
      };
      row.appendChild(b);
    });
    look();
    wrap.appendChild(h("span", "flabel", label)); wrap.appendChild(row);
    return wrap;
  }
  function panel(ti) {
    var t = cfg.teams[ti], solo = cfg.mode === "solo", two = cfg.mode === "2v2", p = h("section", "panel");
    p.appendChild(h("h3", "", solo ? "You" : two ? "Team " + (ti + 1) : "Player " + (ti + 1)));
    p.appendChild(field(two ? "Team name" : "Name", t.name, t.fmt, function (v) { t.name = v; }, function (f) { t.fmt = f; }));
    if (two) t.players.forEach(function (n, k) {
      p.appendChild(field("Player " + (k + 1), n, t.pfmt[k], function (v) { t.players[k] = v; }, function (f) { t.pfmt[k] = f; }));
    });
    p.appendChild(h("span", "flabel", "Color"));
    var pk = CP.create({
      value:t.color, refuse:"That color is too close to the other side's color.",
      accept:solo ? null : function (c) { return !CP.close(c, cfg.teams[other(ti)].color); },
      onChange:function (c) { t.color = c; pickers.forEach(function (q) { q.refresh(); }); save(); }
    });
    pickers.push(pk); p.appendChild(pk.el);
    return p;
  }
  function warn() { var d = $("warn"); if (!d.open) d.showModal(); }

  function start() {
    var solo = cfg.mode === "solo", two = cfg.mode === "2v2", teams = [], bad = false, D = defaults();
    for (var ti = 0; ti < (solo ? 1 : 2); ti++) {
      var t = cfg.teams[ti], name = clean(t.name) || D.teams[ti].name;
      var players = two ? t.players.map(function (p, k) { return clean(p) || D.teams[ti].players[k]; }) : [name];
      if (Filter.bad(name) || players.some(function (p) { return Filter.bad(p); })) bad = true;
      teams.push({ name:name, fmt:t.fmt, color:t.color, players:players, pfmt:two ? t.pfmt.slice() : [t.fmt] });
    }
    if (bad) return warn();
    var go = function (order) {
      g = Game.create({ mode:cfg.mode, teams:teams }, order);
      sd = null; used = {}; busy = false; tab = "game"; say("");
      $("setup").hidden = true; $("game").hidden = false; render();
    };
    if (solo) return go(null);
    // Who goes first: everyone draws 0 to 9 (the draw is final).
    var d = two ? Game.drawOrder(teams) : Game.drawFirst(teams), ul = $("order-log");
    $("order-note").textContent = two ? "Everyone draws a number from 0 to 9. The team with the higher total goes first."
      : "Each player draws a number from 0 to 9. The higher number goes first.";
    ul.textContent = "";
    d.log.forEach(function (x) { ul.appendChild(h("li", "", x)); });
    $("order").hidden = false; $("order-go").focus();
    $("order-go").onclick = function () { $("order").hidden = true; go(d.order); };
  }

  /* ---------- wheel ---------- */
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

  /* ---------- drawing the game ---------- */
  function inv(i) {
    return PU.filter(function (b) { return i[b[0]]; }).map(function (b) { return b[1] + " ×" + i[b[0]]; }).join("  ") || "No power-ups";
  }
  function pname(name, f, out) {
    var p = h("p", "pname"); p.appendChild(nm(name, f));
    if (out) p.appendChild(h("span", "", " (resigned)"));
    return p;
  }
  function card(pi, btns) {
    var p = g.players[pi], on = !g.over && g.turn === pi, c = tint(h("div", "pcard" + (on ? " on" : "") + (p.out ? " out" : "")), p.team);
    c.appendChild(h("div", "stripe"));
    c.appendChild(pname(p.name, p.fmt, p.out));
    c.appendChild(h("p", "score", fmt(p.score)));
    c.appendChild(h("p", "inv", inv(p.inv)));
    if (btns) {
      var can = !busy && !g.over && !sd && on && !p.out, r = h("div", "row"), d = h("button", "small", "Offer draw"), z = h("button", "small", "Resign");
      d.type = z.type = "button"; d.dataset.act = "draw"; z.dataset.act = "resign"; d.dataset.p = z.dataset.p = pi;
      d.disabled = !can || g.offered; z.disabled = !can;
      r.appendChild(d); r.appendChild(z); c.appendChild(r);
    }
    return c;
  }
  function tbox(ti) {
    var t = g.teams[ti], d = tint(h("div", "tbox" + (!g.over && g.players[g.turn].team === ti ? " on" : "")), ti);
    d.appendChild(h("div", "stripe")); d.appendChild(pname(t.name, t.fmt)); d.appendChild(h("p", "score", fmt(Game.teamScore(g, ti))));
    return d;
  }
  // 2 vs 2: how much each player adds to the team score.
  function board(ti) {
    var t = g.teams[ti], tot = Game.teamScore(g, ti), box = h("div"), ol = h("ol"), hd = h("h3");
    fill(hd, [nm(t.name, t.fmt), " leaderboard"]); box.appendChild(hd);
    t.players.slice().sort(function (a, b) { return g.players[b].score - g.players[a].score; }).forEach(function (i) {
      var p = g.players[i], pc = tot ? Math.round(p.score / tot * 100) : 0, li = tint(h("li"), ti), bar = h("div", "lbar"), f = h("div"), n = h("span", "ln");
      n.appendChild(nm(p.name, p.fmt)); if (p.out) n.appendChild(h("span", "", " (resigned)"));
      li.appendChild(h("span", "lp", fmt(p.score) + " pts (" + pc + "%)")); li.appendChild(n);
      f.style.width = pc + "%"; bar.appendChild(f); li.appendChild(bar); ol.appendChild(li);
    });
    box.appendChild(ol);
    return box;
  }
  // The play order decided by the draw. It never changes during the game.
  function orderList(box) {
    box.textContent = "";
    if (g.mode === "solo") return;
    var ol = h("ol");
    box.appendChild(h("h3", "", "Turn order"));
    g.order.forEach(function (i) {
      var p = g.players[i], li = tint(h("li", (!g.over && g.turn === i ? "now" : "") + (p.out ? " out" : "")), p.team);
      if (!g.over && g.turn === i) li.setAttribute("aria-current", "true");
      li.appendChild(h("i", "dot")); li.appendChild(nm(p.name, p.fmt)); if (p.out) li.appendChild(h("span", "", " (resigned)"));
      ol.appendChild(li);
    });
    box.appendChild(ol);
  }

  function render() {
    var solo = g.mode === "solo", two = g.mode === "2v2", p = g.players[g.turn], sb = $("sb"), mini = $("mini"), tabs = $("mtabs").children;
    if (solo || (tab === "board" && !two)) tab = "game";
    $("play").dataset.mode = g.mode; $("play").dataset.tab = tab;
    $("scoreboard").hidden = g.mode === "1v1";
    $("sb-title").textContent = two ? "Team Scoreboard" : "";
    sb.className = "teams" + (solo ? " one" : ""); sb.textContent = "";
    if (solo) sb.appendChild(card(0, false)); else if (two) { sb.appendChild(tbox(0)); sb.appendChild(tbox(1)); }
    mini.textContent = "";
    if (g.mode === "1v1") g.players.forEach(function (q, i) {
      var c = tint(h("span", "mchip" + (!g.over && g.turn === i ? " on" : "")), q.team);
      c.appendChild(h("i", "dot")); c.appendChild(nm(q.name, q.fmt)); c.appendChild(h("span", "", " " + fmt(q.score))); mini.appendChild(c);
    });
    [0, 1].forEach(function (ti) {
      var cards = $("cards-" + ti), lb = $("lb-" + ti);
      cards.textContent = ""; lb.textContent = "";
      if (solo) return;
      g.teams[ti].players.forEach(function (i) { cards.appendChild(card(i, true)); });
      if (two) lb.appendChild(board(ti));
    });
    orderList($("order-center")); orderList($("order-mobile"));
    for (var k = 0; k < tabs.length; k++) tabs[k].setAttribute("aria-selected", tabs[k].dataset.tab === tab);
    var team = g.teams[p.team];
    fill($("turn"), g.over
      ? (solo ? [nm(p.name, p.fmt), " " + g.reason + "."] : g.winner === null ? ["Draw: " + g.reason] : [nm(g.teams[g.winner].name, g.teams[g.winner].fmt), " wins: " + g.reason])
      : sd ? ["Sudden death: ", nm(p.name, p.fmt), " spins"]
      : two ? [nm(p.name, p.fmt), " (", nm(team.name, team.fmt), ")'s turn"] : [nm(p.name, p.fmt), "'s turn"]);
    $("spin").disabled = busy || g.over;
    $("new").hidden = !(g.over || solo);
    save();
  }

  /* ---------- dialogs ---------- */
  function ask(text, btns) {
    return new Promise(function (res) {
      var d = $("dlg"), box = $("dlg-btns"); $("dlg-text").textContent = text; box.textContent = "";
      d.oncancel = function (e) { e.preventDefault(); };
      btns.forEach(function (b, k) { var e = h("button", "small", b); e.onclick = function () { d.close(); res(k); }; box.appendChild(e); });
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

  /* ---------- a turn ---------- */
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
    if (res.id === "egg") { say(who() + " hit the Easter egg!"); return egg(false, finish); }
    Game.grant(g, res.id);
    say(who() + " got " + res.name + (res.id === "free" ? ": +5 points." : ". Turn used."));
    finish();
  }

  // Difficulty is shown first; power-ups are chosen here, before the word appears.
  function reveal(lv) {
    var p = g.players[g.turn], i = p.inv;
    if (!(i.x2 || i.x3 || i.shield)) return question(lv);
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
    $("pu-go").onclick = function () { $("pu").hidden = true; question(lv); };
  }

  function finish() { var r = Game.endTurn(g); busy = false; after(r); }
  function after(r) { if (r === "sudden") startSudden(); render(); }
  function turnOf(t) { g.turn = Game.rep(g, t); g.pos = g.order.indexOf(g.turn); }
  function startSudden() {
    sd = { who:0, vals:[null, null] }; turnOf(0);
    say("Tied at " + fmt(Game.teamScore(g, 0)) + ". Each team spins once; the higher result wins.");
  }

  function sdLand(res) {
    sd.vals[sd.who] = Game.value(res); say(who() + " got " + res.name + ".");
    var go = function () {
      busy = false;
      if (sd.who === 0) { sd.who = 1; turnOf(1); return render(); }
      var r = sd.vals[0], b = sd.vals[1];
      if (r !== b) { g.over = true; g.winner = r > b ? 0 : 1; g.reason = "won sudden death"; sd = null; return render(); }
      if (r !== Game.value({ id:"egg" })) { say("Tied again. Each team spins once more."); sd.who = 0; turnOf(0); return render(); }
      egg(true, function () { g.over = true; g.winner = null; g.reason = "both teams share the win"; sd = null; render(); });
    };
    if (res.id === "egg") egg(false, go); else go();
  }

  function question(lv) {
    var list = WORDS[lv.id], u = used[lv.id] || (used[lv.id] = []);
    var pool = list.filter(function (w) { return u.indexOf(w.word) < 0; });
    if (!pool.length) { u.length = 0; pool = list; }
    var w = pool[Math.floor(Math.random() * pool.length)]; u.push(w.word);
    var opts = shuffle([w.meaning].concat(w.wrong).map(function (t, k) { return { t:t, ok:k === 0 }; }));
    var boost = g.players[g.turn].armed, finished = false;
    $("q-level").textContent = lv.name + ", " + pl(lv.points, "point") + (boost ? ", " + (boost === "shield" ? "Shield" : boost.replace("x", "") + "x") + " active" : "");
    $("q-word").textContent = w.word;
    var box = $("q-opts"); box.textContent = "";
    opts.forEach(function (o, k) { var b = h("button", "opt", o.t); b.onclick = function () { done(k); }; box.appendChild(b); });
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
      say((k === null ? "Time is up. " : ok ? "Correct. " : "Wrong. ") + who() + " gets " + pl(pts, "point") + ".");
      render();
      $("q-next").hidden = false; $("q-next").focus();
      $("q-next").onclick = function () { $("q").hidden = true; finish(); };
    }
  }

  /* ---------- resign and draw (on your own turn, before you spin) ---------- */
  function doResign() {
    var p = g.players[g.turn];
    ask(p.name + ", resign the game?" + (g.mode === "2v2" ? " Your teammate can keep playing." : ""), ["Resign", "Cancel"]).then(function (k) {
      if (k !== 0) return;
      var r = Game.resign(g);
      if (!g.over) say(p.name + " resigned.");
      after(r);
    });
  }
  function doDraw() {
    var p = g.players[g.turn], o = g.teams[other(p.team)];
    g.offered = true; render();
    ask(o.name + ", " + p.name + " offers a draw" + (g.mode === "2v2" ? " for everyone" : "") + ". Accept?", ["Accept draw", "Decline"]).then(function (k) {
      if (k === 0) Game.draw(g); else say("Draw declined.");
      render();
    });
  }

  /* ---------- start ---------- */
  $("spin").onclick = spin;
  $("start").onclick = start;
  $("warn-ok").onclick = function () { $("warn").close(); };
  $("game").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]");
    if (!b || b.disabled || +b.dataset.p !== g.turn) return;
    if (b.dataset.act === "draw") doDraw(); else doResign();
  });
  $("mtabs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-tab]");
    if (b) { tab = b.dataset.tab; render(); }
  });
  $("new").onclick = function () {
    if (g.over) return showSetup();
    ask("Leave this game and start a new one?", ["New game", "Keep playing"]).then(function (k) { if (k === 0) showSetup(); });
  };
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });

  build();
  var skipped = restore();
  if (g) { $("setup").hidden = true; $("game").hidden = false; if (skipped) say("Your turn was skipped because you left the page."); render(); }
  else showSetup();
})();
