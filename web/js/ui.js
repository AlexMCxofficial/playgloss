// Play page: setup screen, the wheel, questions, side panels, and online lobby. MIT License (see LICENSE).
(function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  var SL = Wheel.slices, CP = ColorPicker, KEY = "playgloss-session-v3";
  var PU = [["x2","2x"],["x3","3x"],["shield","Shield"]];
  var MODES = [["solo","Solo"],["1v1","1 vs 1"],["2v2","2 vs 2"]]; // Custom is a rules switch (cfg.customOn) on top of these
  var STYLES = [["b","Bold"],["i","Italic"],["u","Underline"]];
  var cfg = defaults(), g = null, sd = null, used = Overlays.used, busy = false, rot = 0, tm = null, tab = "game", pickers = [];
  var customTab = "general", wheelKey = null; // customTab: the open tab of the Custom setup. wheelKey: which colors the wheel is drawn with

  // Online play state
  var online = false, oTab = "join", stopScan = null; // the fourth option, "Online": which view is open
  var host = null, hosting = false, stopping = false, hostCfg = null, qrModule = null, conn = null; // conn: the Connection box (Wi-Fi type, name and password), memory only
  // What the host is waiting for right now (a guest's answer, a power-up choice, an Easter egg click or a draw reply),
  // and what guests are shown. Both are cleared by resetFlow() whenever a game starts or ends.
  var S = { pu:null, q:null, egg:null, drawOffer:null }, pend = null, drawP = null, offering = false, spinN = 0, qN = 0, timers = [];

  // Global error handler so JS errors show visibly instead of silently breaking buttons
  window.onerror = function (msg, url, line) {
    // Only report errors from PlayGloss's own script files (everything lives under js/, there are no inline scripts).
    // Extensions such as crypto wallets inject code into the page and their errors carry the page's own URL, so
    // checking for the page origin is not enough. Browsers also report anonymous errors as "Script error." at line 0.
    var own = typeof url === "string" && /\/js\/[^?#]+\.js([?#]|$)/.test(url);
    if (!own) { console.warn("Ignored error from outside the page:", msg, url, line); return true; }
    var d = $("err-box");
    if (!d) {
      d = h("div", "err-box"); d.style.cssText = "position:fixed;bottom:10px;left:10px;right:10px;background:#800;color:#fff;padding:10px;font-family:sans-serif;z-index:9999;";
      document.body.appendChild(d);
    }
    d.textContent = "JS Error: " + msg + " (line " + line + ")";
    console.error("UI error:", msg, "at", url, line);
    return true;
  };

  var h = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  var fmt = function (n) { return n % 1 ? n.toFixed(1) : String(n); };
  var pl = function (n, w) { return fmt(n) + " " + w + (n === 1 ? "" : "s"); };
  var say = function (t) { $("msg").textContent = t; };
  var who = function () { return g.players[g.turn].name; };
  var tint = function (e, ti) { e.style.setProperty("--team", g.teams[ti].color); return e; };
  var shuffle = function (a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  var clean = function (v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, 16); };
  var fixFmt = function (v) { v = String(v || ""); return STYLES.map(function (s) { return s[0]; }).filter(function (c) { return v.indexOf(c) >= 0; }).join(""); };
  var nm = function (name, f) { return h("span", "nm" + (f ? f.replace(/./g, " $&") : ""), name); };
  var fill = function (el, parts) { el.textContent = ""; parts.forEach(function (x) { el.appendChild(typeof x === "string" ? h("span", "", x) : x); }); };
  var other = function (ti) { return ti ? 0 : 1; };

  /* ---------- settings (names, text styles and colors) ---------- */
  function defaults() {
    return { mode:"1v1", customOn:false, teams:[
      { name:"Red", fmt:"", color:"#e03131", players:["Player 1", "Player 2"], pfmt:["", ""] },
      { name:"Blue", fmt:"", color:"#2f80ed", players:["Player 3", "Player 4"], pfmt:["", ""] }],
      run:null, // the mode picked in the Online host form ({ extreme, inf, color }); null means "as in Settings"
      custom:customOf(null) };
  }
  // The Custom setup: Game.cleanCustom (hearts, targetScore, time, levelColors) plus extreme, inf and color
  // (color is what the host puts on the guests' screens; it is only used when hosting).
  function customOf(c) {
    var k = Game.cleanCustom(c);
    k.extreme = !!(c && c.extreme); k.inf = !!(c && c.inf); k.color = c && c.color === "extreme" ? "extreme" : "default";
    return k;
  }
  // The mode a game is played in. Local games always use Settings. The Online host form can pick its own.
  function settingsRun() { var m = window.PGMode ? PGMode.get() : null; return { extreme:!!(m && m.extreme), inf:!!(m && m.infinite), color:"default" }; }
  function runOf() { return cfg.run ? { extreme:!!cfg.run.extreme, inf:!!cfg.run.inf, color:cfg.run.color || "default" } : settingsRun(); }
  // The rules of a Custom game, in the shape the lobby, Game.create and the guests use.
  function customRun() {
    var c = cfg.custom, k = { hearts:c.hearts, targetScore:c.targetScore, time:c.time, levelColors:c.levelColors };
    var adv = window.PGAdvanced ? PGAdvanced.forGame() : null; // only while Advanced Mode is on, and only what differs from the standard game
    if (adv) k.adv = adv;
    return { extreme:c.extreme, inf:c.inf, color:c.color, custom:k };
  }
  // The rules of a game on this device (a Custom game uses its own setup, the others use Settings).
  function localRun() { return cfg.customOn ? customRun() : settingsRun(); }
  function okName(v, dflt) { v = clean(v); return v && !Filter.bad(v) ? v : dflt; }
  function apart(c) {
    if (CP.close(c.teams[0].color, c.teams[1].color)) c.teams[1].color = CP.close(c.teams[0].color, "#2f80ed") ? "#e03131" : "#2f80ed";
  }
  function fixCfg(c) {
    var d = defaults();
    var legacy = c && c.mode === "custom"; // saved before Custom became a switch: it was a custom 2 vs 2
    if (!c || !(legacy || MODES.some(function (m) { return m[0] === c.mode; })) || !c.teams || c.teams.length !== 2) return d;
    d.mode = legacy ? "2v2" : c.mode; d.customOn = legacy || !!c.customOn;
    if (c.run && typeof c.run === "object") d.run = { extreme:!!c.run.extreme, inf:!!c.run.inf, color:c.run.color === "extreme" ? "extreme" : "default" };
    d.custom = customOf(c.custom);
    d.teams.forEach(function (t, i) {
      var s = c.teams[i] || {};
      t.name = okName(s.name, t.name); t.fmt = fixFmt(s.fmt); t.color = CP.norm(s.color) || t.color;
      t.players = t.players.map(function (p, k) { return okName(s.players && s.players[k], p); });
      t.pfmt = t.pfmt.map(function (f, k) { return fixFmt(s.pfmt && s.pfmt[k]); });
    });
    apart(d);
    return d;
  }

  /* ---------- session storage ---------- */
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify({ v:3, cfg:cfg, g:g, sd:sd, used:used, tab:tab, pending:busy, hosting:hosting })); } catch (e) {}
  }
  function restore() {
    var skipped = false;
    try {
      var s = JSON.parse(sessionStorage.getItem(KEY));
      if (!s || s.v !== 3) return false;
      cfg = fixCfg(s.cfg);
      if (!s.g || !s.g.players || !s.g.teams || !s.g.order) return false;
      g = s.g; sd = s.sd || null; used = s.used || {}; tab = s.tab || "game";
      hosting = false; // the server and its guests cannot survive a page reload; lan_start replaces the old server
      if (s.pending && !g.over && !sd) {
        g.players[g.turn].armed = null;
        if (Game.endTurn(g) === "sudden") startSudden();
        skipped = true;
      }
    } catch (e) { g = null; sd = null; used = {}; hosting = false; }
    return skipped;
  }

  /* ---------- online: check if hosting is available ---------- */
  function onlineEnabled() {
    try { return !!window.__TAURI__ && localStorage.getItem("online") === "1"; } catch (e) { return false; }
  }

  /* ---------- who plays a player ---------- */
  // Seat number = player number. A player is "remote" while a guest on another device holds that seat: only that
  // guest may spin, answer, use power-ups, offer or answer a draw and resign for them, never the host's screen.
  // A seat nobody holds (this device, or its guest was removed) is played from the host's screen.
  function remote(pi) { return !!(host && host.session && host.session.phase === "game" && host.session.guestOf(pi)); }
  function idle() { return !busy && !offering; }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function resetFlow() {
    timers.forEach(clearTimeout); timers = [];
    S = { pu:null, q:null, egg:null, drawOffer:null }; pend = null; drawP = null; offering = false;
    ["pu", "q", "egg"].forEach(function (id) { $(id).hidden = true; });
    Overlays.cancelAsk();
  }

  /* ---------- setup screen ---------- */
  function showSetup() {
    resetFlow();
    g = null; sd = null; busy = false; clearInterval(tm);
    if (host) { host.stop(); host = null; hosting = false; }
    $("game").hidden = true; $("lobby").hidden = true; $("setup").hidden = false;
    $("mtabs").hidden = true; $("online-indicator").hidden = true; conn = null; $("lobby-conn").textContent = ""; // the Wi-Fi password is gone with the lobby
    drawSetup(); save();
  }

  function drawSetup() {
    if (stopScan) stopScan();
    if (online && oTab === "host" && cfg.mode === "solo") cfg.mode = "1v1"; // a hosted game needs two sides
    var box = $("setup-body"), solo = cfg.mode === "solo", isCustom = cfg.customOn, modes = h("div", "row"), panels = h("div", "panels");
    if (!solo) apart(cfg);
    pickers = []; box.textContent = "";
    modes.setAttribute("role", "group"); modes.setAttribute("aria-label", "Game mode");
    MODES.forEach(function (m) {
      var b = h("button", "small", m[1]); b.type = "button";
      b.setAttribute("aria-pressed", !online && cfg.mode === m[0]);
      b.onclick = function () { online = false; cfg.mode = m[0]; drawSetup(); save(); };
      modes.appendChild(b);
    });
    var ob = h("button", "small", "Online"); ob.type = "button";
    ob.setAttribute("aria-pressed", online);
    ob.onclick = function () { online = true; drawSetup(); save(); };
    modes.appendChild(ob);
    box.appendChild(modes);
    if (!online) box.appendChild(customSwitch());
    $("start").parentNode.hidden = online; // "Start game" is for games on this device
    if (online) return drawOnline(box);
    if (isCustom) return drawCustom(box, false);
    box.appendChild(modeNote());
    for (var ti = 0; ti < (solo ? 1 : 2); ti++) panels.appendChild(panel(ti));
    box.appendChild(panels);
  }
  // The Custom rules switch: Off uses Settings, On opens the Custom setup (works with Solo, 1 vs 1 and 2 vs 2).
  function customSwitch() {
    var row = h("div", "row"), b = h("button", "small", "Custom rules: " + (cfg.customOn ? "On" : "Off"));
    b.type = "button"; b.setAttribute("aria-pressed", !!cfg.customOn);
    b.onclick = function () { cfg.customOn = !cfg.customOn; drawSetup(); save(); };
    row.appendChild(b);
    return row;
  }
  // Which mode a game on this device will use, with a way to change it.
  function modeNote() {
    var p = h("p", "modeset"), a = h("a", "", "Settings");
    a.href = "settings.html";
    p.appendChild(h("span", "note", "Mode: " + View.runText(settingsRun()) + ". Change it in "));
    p.appendChild(a); p.appendChild(h("span", "note", "."));
    return p;
  }

  /* ---------- Custom mode configuration ---------- */
  // The Custom setup, in tabs (General, Time, Colors, Advanced, Teams) so it fits on a phone. The same box is used on this device
  // (Play > Custom) and in the Online > Host a game form (online = true), where General also has the guests' Color.
  // Advanced tab only appears when Advanced Mode is ON in Settings.
  function drawCustom(box, online) {
    var c = cfg.custom, tabs = h("div", "ctabs"), views = h("div", "cviews"), btns = {}, vs = {};
    var advMode = PGAdvanced.enabled();
    advDraft = null;
    var names = [["general", "General"], ["time", "Time"], ["colors", "Colors"]];
    if (advMode) names.push(["advanced", "Advanced"]);
    names.push(["teams", "Teams"]);
    tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Custom settings");
    function show(k) {
      customTab = k;
      names.forEach(function (t) {
        var on = t[0] === k;
        vs[t[0]].hidden = !on; btns[t[0]].setAttribute("aria-selected", on); btns[t[0]].tabIndex = on ? 0 : -1;
      });
    }
    names.forEach(function (t, i) {
      var b = h("button", "ctab", t[1]); b.type = "button"; b.id = "ctab-" + t[0];
      b.setAttribute("role", "tab"); b.setAttribute("aria-controls", "cview-" + t[0]);
      b.onclick = function () { show(t[0]); };
      b.onkeydown = function (e) { // arrow keys move between the tabs
        var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        var n = names[(i + d + names.length) % names.length][0];
        show(n); btns[n].focus(); e.preventDefault();
      };
      tabs.appendChild(b); btns[t[0]] = b;
      var v = h("div", "cview"); v.id = "cview-" + t[0]; v.setAttribute("role", "tabpanel"); v.setAttribute("aria-labelledby", b.id);
      vs[t[0]] = v; views.appendChild(v);
    });
    box.appendChild(tabs); box.appendChild(views);

    // two-button choice (Default / Extreme, Off / On); picking one redraws so the dependent fields update
    function choice(parent, label, list, isOn, pick) {
      var lab = h("span", "setlabel", label), row = h("div", "row");
      lab.id = "cc-" + label.replace(/\W+/g, "-").toLowerCase();
      row.setAttribute("role", "group"); row.setAttribute("aria-labelledby", lab.id);
      list.forEach(function (m) {
        var x = h("button", "small", m[1]); x.type = "button"; x.setAttribute("aria-pressed", isOn(m[0]));
        x.onclick = function () { pick(m[0]); drawSetup(); save(); };
        row.appendChild(x);
      });
      parent.appendChild(lab); parent.appendChild(row);
    }
    // a slider with its value shown next to the label (works with touch, no typing)
    function slider(parent, label, min, max, step, val, unit, set) {
      var w = h("div", "field slider"), top = h("div", "sliderhead"), out = h("output", "sliderval"), r = h("input");
      r.type = "range"; r.min = min; r.max = max; r.step = step; r.value = val; r.setAttribute("aria-label", label);
      var paint = function () { out.textContent = r.value + (unit ? " " + unit : ""); r.setAttribute("aria-valuetext", out.textContent); };
      r.oninput = function () { set(Number(r.value)); paint(); save(); };
      top.appendChild(h("span", "flabel", label)); top.appendChild(out); w.appendChild(top); w.appendChild(r); paint();
      parent.appendChild(w);
    }

    // General: modes, Infinite, hearts (Infinite on) or target score (Infinite off)
    var gen = vs.general;
    choice(gen, "Mode", [["default", "Default"], ["extreme", "Extreme"]], function (k) { return c.extreme === (k === "extreme"); }, function (k) { c.extreme = k === "extreme"; });
    choice(gen, "Infinite", [[false, "Off"], [true, "On"]], function (k) { return c.inf === k; }, function (k) { c.inf = k; });
    if (c.inf) slider(gen, "Hearts per player", 1, 10, 1, c.hearts, "", function (v) { c.hearts = v; });
    else slider(gen, "Target score", 100, 1000, 50, c.targetScore, "points", function (v) { c.targetScore = v; });
    gen.appendChild(h("p", "note", c.inf
      ? "Infinite: no target score. A wrong answer or time up costs a heart, and a player with no hearts is out."
      : "The first side to reach the target score wins (the round is finished first, as in the other modes)."));
    gen.appendChild(h("p", "note", "Extreme flips how often the levels come up, so Impossible comes as often as Very Easy does in Default."));
    if (online) {
      choice(gen, "Color (guests)", [["default", "Default"], ["extreme", "Extreme"]], function (k) { return c.color === k; }, function (k) { c.color = k; });
      gen.appendChild(h("p", "note", "Default: guests keep their own theme. Extreme: all guests see the Extreme theme (dark red). Your own theme is never affected, and guests can still switch to light."));
    }

    // Time: how long a question lasts, Very Easy (longest) to Impossible (shortest)
    var tim = vs.time, grid = h("div", "tgrid");
    tim.appendChild(h("h3", "", "Time to answer"));
    tim.appendChild(h("p", "note", "Very Easy gives the most time to answer and Impossible the least. Normal is the standard game."));
    grid.setAttribute("role", "group"); grid.setAttribute("aria-label", "Time to answer");
    Game.TIMES.forEach(function (t) {
      var x = h("button", "small", t[1]); x.type = "button"; x.setAttribute("aria-pressed", c.time === t[0]);
      x.onclick = function () { c.time = t[0]; drawSetup(); save(); };
      grid.appendChild(x);
    });
    tim.appendChild(grid);
    var tb = h("div", "tablewrap"), tt = h("table"), tr = h("tr");
    ["Level", "Standard", "Your game"].forEach(function (x) { tr.appendChild(h("th", "", x)); });
    tt.appendChild(h("thead")).appendChild(tr);
    var body = h("tbody");
    SL.slice(0, 8).forEach(function (lv) {
      var row = h("tr");
      row.appendChild(h("td", "", lv.name)); row.appendChild(h("td", "", lv.time + " s"));
      row.appendChild(h("td", "", Game.seconds({ custom:{ time:c.time } }, lv) + " s"));
      body.appendChild(row);
    });
    tt.appendChild(body); tb.appendChild(tt); tim.appendChild(tb);

    // Colors: one color for each level slice of the wheel (looks only; the odds, points and time stay the same)
    var col = vs.colors;
    col.appendChild(h("h3", "", "Difficulty colors"));
    col.appendChild(h("p", "note", "These are the colors of the level slices on the wheel. They change the look only, not the odds, points or time."));
    SL.slice(0, 8).forEach(function (lv) {
      var d = h("details", "lvcolor"), sm = h("summary"), chip = h("span", "cp-chip"), cur = c.levelColors[lv.id] || lv.color;
      chip.style.backgroundColor = cur;
      sm.appendChild(chip); sm.appendChild(h("span", "", lv.name)); d.appendChild(sm);
      var pk = CP.create({ value:cur, onChange:function (hex) { c.levelColors[lv.id] = hex; chip.style.backgroundColor = hex; reset.disabled = false; save(); } });
      d.appendChild(pk.el); col.appendChild(d);
    });
    var reset = h("button", "small", "Reset to default colors"); reset.type = "button";
    reset.disabled = !Object.keys(c.levelColors).length;
    reset.onclick = function () { c.levelColors = {}; drawSetup(); save(); };
    reset.dataset.role = "reset";
    col.appendChild(h("div", "row")).appendChild(reset);

    // The configuration export and import: in the Advanced tab when Advanced Mode is on, at the end of General when it is off
    if (advMode) drawAdvancedTab(vs.advanced);
    else drawConfigBox(gen, false);

    // Teams: the sides of the chosen mode (one for Solo, two for 1 vs 1, two teams of two for 2 vs 2)
    var tm2 = vs.teams, panels = h("div", "panels");
    tm2.appendChild(h("p", "note", "Custom rules are played as " + (cfg.mode === "solo" ? "Solo." : cfg.mode === "1v1" ? "1 vs 1." : "2 vs 2: two teams of two.")));
    for (var ti = 0; ti < (cfg.mode === "solo" ? 1 : 2); ti++) panels.appendChild(panel(ti));
    tm2.appendChild(panels);

    show(names.some(function (t) { return t[0] === customTab; }) ? customTab : "general");
  }

  /* ---------- the Advanced tab (Advanced Mode on in Settings, and Custom rules on) ---------- */
  // The probability boxes as typed, in hundredths of a percent (so there is never a rounding error): { id: number }.
  // It is null until the Advanced tab is drawn. Start game and Host a game check it, so odds that do not add up to 100% never play.
  var advDraft = null;
  var cents = function (v) { return Math.round(v * 100); };
  var pct = function (c) { return (c / 100).toFixed(2); };
  function draftTotal() { return PGAdvanced.ALL_IDS.reduce(function (s, id) { return s + advDraft[id]; }, 0); }

  // Label and two or more buttons in one group (no redraw: only the pressed state changes).
  function pair(parent, label, items, current, pick) {
    var lab = h("span", "setlabel", label), row = h("div", "row"), btns = [];
    lab.id = "adv-" + label.replace(/\W+/g, "-").toLowerCase();
    row.setAttribute("role", "group"); row.setAttribute("aria-labelledby", lab.id);
    items.forEach(function (m) {
      var x = h("button", "small", m[1]); x.type = "button"; x.setAttribute("aria-pressed", m[0] === current);
      x.onclick = function () { btns.forEach(function (b) { b.setAttribute("aria-pressed", b === x); }); pick(m[0]); };
      btns.push(x); row.appendChild(x);
    });
    parent.appendChild(lab); parent.appendChild(row);
  }

  function drawAdvancedTab(parent) {
    var adv = PGAdvanced.get(), ids = PGAdvanced.ALL_IDS, inputs = {}, maxCells = {}, names = {};
    PGAdvanced.LEVEL_IDS.forEach(function (id) { names[id] = PGAdvanced.LEVEL_NAMES[id]; });
    PGAdvanced.POWER_IDS.forEach(function (id) { names[id] = PGAdvanced.POWER_NAMES[id]; });
    advDraft = {}; ids.forEach(function (id) { advDraft[id] = cents(adv.weights[id]); });

    /* Probabilities */
    parent.appendChild(h("h3", "", "Probabilities"));
    parent.appendChild(h("p", "note", "Choose how often each level and each power-up comes up when the wheel stops. Every box is a percentage with up to two decimals, and together they must add up to exactly 100%. The numbers below tell you how much is left to give out. Extreme mode still flips the eight level chances (what you give Very Easy goes to Impossible, and so on); the power-ups stay as you set them."));
    var remain = h("p", "advremain"); remain.setAttribute("role", "status"); remain.setAttribute("aria-live", "polite");
    parent.appendChild(remain);
    var wrap = h("div", "tablewrap"), table = h("table", "advtable"), head = h("tr");
    ["Level or power-up", "Chance (%)", "Most it can have"].forEach(function (x) { head.appendChild(h("th", "", x)); });
    table.appendChild(h("thead")).appendChild(head);
    var body = h("tbody");
    function refresh() {
      var total = draftTotal(), rem = 10000 - total;
      remain.textContent = rem === 0 ? "Everything is given out: 100.00%. These odds are saved."
        : rem > 0 ? "Left to give out: " + pct(rem) + "% (the total must be 100.00%). Not saved yet."
        : "Over by " + pct(-rem) + "%: take that much away. Not saved yet.";
      remain.className = "advremain " + (rem === 0 ? "ok" : rem > 0 ? "low" : "high");
      ids.forEach(function (id) { maxCells[id].textContent = pct(Math.max(0, 10000 - (total - advDraft[id]))) + "%"; });
    }
    function toWeights() { var w = {}; ids.forEach(function (id) { w[id] = advDraft[id] / 100; }); return w; }
    ids.forEach(function (id) {
      var tr = h("tr"), lab = h("label", "", names[id]), inp = h("input", "advin"), th = h("th"), mx = h("td", "advmax");
      inp.id = "adv-p-" + id; lab.setAttribute("for", inp.id); th.scope = "row"; th.appendChild(lab);
      inp.type = "number"; inp.min = "0"; inp.max = "100"; inp.step = "0.01"; inp.inputMode = "decimal"; inp.value = pct(advDraft[id]);
      inp.oninput = function () {
        var v = parseFloat(inp.value);
        advDraft[id] = isFinite(v) ? Math.max(0, Math.min(10000, cents(v))) : 0;
        refresh();
        if (draftTotal() === 10000) PGAdvanced.set({ weights: toWeights() });
      };
      inp.onchange = function () { inp.value = pct(advDraft[id]); };
      var cell = h("td"); cell.appendChild(inp);
      tr.appendChild(th); tr.appendChild(cell); tr.appendChild(mx); body.appendChild(tr);
      inputs[id] = inp; maxCells[id] = mx;
    });
    table.appendChild(body); wrap.appendChild(table); parent.appendChild(wrap);
    refresh();
    var reset = h("button", "small", "Back to the standard odds"); reset.type = "button";
    reset.onclick = function () {
      PGAdvanced.resetWeights();
      var w = PGAdvanced.get().weights;
      ids.forEach(function (id) { advDraft[id] = cents(w[id]); inputs[id].value = pct(advDraft[id]); });
      refresh();
    };
    parent.appendChild(h("div", "row")).appendChild(reset);

    /* The "?" slice */
    parent.appendChild(h("h3", "", "Surprise slice"));
    pair(parent, "Enable/Disable \"?\"", [[true, "Enable"], [false, "Disable"]], adv.eggEnabled, function (on) { PGAdvanced.set({ eggEnabled: on }); });
    parent.appendChild(h("p", "note", "When disabled, the \"?\" slice never comes up. Its chance cannot be changed."));

    /* Questions */
    parent.appendChild(h("h3", "", "Words and questions"));
    var defNote = h("p", "note", "Default uses the built-in word list, with 1,400 words for every level, so any odds you choose still give fresh words."), box = h("div", "qbox");
    pair(parent, "Questions", [["default", "Default"], ["custom", "Custom"]], adv.questionsMode, function (m) {
      PGAdvanced.set({ questionsMode: m }); defNote.hidden = m === "custom"; box.hidden = m !== "custom";
    });
    defNote.hidden = adv.questionsMode === "custom"; box.hidden = adv.questionsMode !== "custom";
    parent.appendChild(defNote); parent.appendChild(box);
    drawQuestions(box);

    drawConfigBox(parent, true);
  }

  // Custom questions: the list, a form to add one, and the word list import and export.
  function drawQuestions(box) {
    var status = h("p", "note"), count = 4, qs = PGAdvanced.get().customQuestions;
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    box.textContent = "";
    box.appendChild(h("p", "note", "Your own questions replace the built-in words. A random one is asked each turn (none comes back before all have been asked), and the level only decides the points and the time. Add at least one."));
    var list = h("ol", "qlist");
    qs.forEach(function (q, i) {
      var li = h("li", "qitem"), del = h("button", "small", "Delete");
      li.appendChild(h("strong", "", q.word)); li.appendChild(h("span", "", " - " + q.meaning));
      li.appendChild(h("span", "note", " (wrong: " + q.wrong.join(" | ") + ")"));
      del.type = "button"; del.setAttribute("aria-label", "Delete question " + (i + 1) + ", " + q.word);
      del.onclick = function () {
        var next = PGAdvanced.get().customQuestions; next.splice(i, 1);
        PGAdvanced.set({ customQuestions: next }); drawQuestions(box);
      };
      li.appendChild(del); list.appendChild(li);
    });
    if (!qs.length) box.appendChild(h("p", "note", "No questions yet."));
    else box.appendChild(list);

    box.appendChild(h("h4", "", "Add a question"));
    var form = h("div", "qform"), word = h("input"), meaning = h("input"), wrongBox = h("div", "qwrong"), msg = h("p", "note qmsg");
    word.type = meaning.type = "text"; word.maxLength = PGAdvanced.MAX_WORD; meaning.maxLength = PGAdvanced.MAX_TEXT;
    word.placeholder = "Word"; meaning.placeholder = "The right meaning";
    word.setAttribute("aria-label", "Word"); meaning.setAttribute("aria-label", "The right meaning");
    msg.setAttribute("role", "alert");
    var wrongs = [];
    function drawWrong() {
      var old = wrongs.map(function (i) { return i.value; });
      wrongBox.textContent = ""; wrongs = [];
      for (var k = 0; k < count - 1; k++) {
        var i = h("input"); i.type = "text"; i.maxLength = PGAdvanced.MAX_TEXT; i.value = old[k] || "";
        i.placeholder = "Wrong meaning " + (k + 1); i.setAttribute("aria-label", "Wrong meaning " + (k + 1));
        wrongs.push(i); wrongBox.appendChild(i);
      }
    }
    var cl = h("span", "setlabel", "Choices (the right one plus wrong ones)"), cr = h("div", "row");
    cl.id = "adv-choices-label"; cr.setAttribute("role", "group"); cr.setAttribute("aria-labelledby", cl.id);
    var cbtns = [2, 3, 4].map(function (n) {
      var x = h("button", "small", n + " choices"); x.type = "button"; x.setAttribute("aria-pressed", n === count);
      x.onclick = function () { count = n; cbtns.forEach(function (b, j) { b.setAttribute("aria-pressed", j + 2 === n); }); drawWrong(); };
      cr.appendChild(x); return x;
    });
    form.appendChild(cl); form.appendChild(cr);
    form.appendChild(word); form.appendChild(meaning); form.appendChild(wrongBox);
    drawWrong();
    var add = h("button", "spin", "Add question"); add.type = "button";
    add.onclick = function () {
      var r = PGAdvanced.cleanQuestion({ word: word.value, meaning: meaning.value, wrong: wrongs.map(function (i) { return i.value; }), choices: count });
      if (r.error) { msg.textContent = "Could not add it: " + r.error + "."; return; }
      var next = PGAdvanced.get().customQuestions;
      if (next.length >= PGAdvanced.MAX_QUESTIONS) { msg.textContent = "You can keep up to " + PGAdvanced.MAX_QUESTIONS + " questions."; return; }
      next.push(r.q);
      var done = PGAdvanced.set({ customQuestions: next });
      if (!done.ok) { msg.textContent = "Could not add it: " + done.error; return; }
      drawQuestions(box);
      var first = box.querySelector(".qform input"); if (first) first.focus();
    };
    form.appendChild(msg); form.appendChild(add); box.appendChild(form);

    box.appendChild(h("h4", "", "Word list (import and export)"));
    var det = h("details", "qformat"), sum = h("summary", "", "The word list format");
    det.appendChild(sum);
    det.appendChild(h("p", "note", "A text file in CSV format (you can make it in any spreadsheet and save as CSV). The first line is exactly:"));
    det.appendChild(h("pre", "", PGAdvanced.WORDLIST_FORMAT));
    det.appendChild(h("p", "note", "Every other line is one question: the word, the right meaning, up to three wrong meanings, and how many choices it has (2, 3 or 4). A 2-choice question only needs wrong1, a 3-choice question wrong1 and wrong2; leave the unused boxes empty. Put text that has a comma in double quotes. Example:"));
    det.appendChild(h("pre", "", "apple,a round fruit that grows on trees,a tool for cutting wood,a kind of fast car,a large body of water,4\nquick,moving fast,not moving at all,,,2"));
    det.appendChild(h("p", "note", "Importing replaces your current list, and nothing is changed if any line has a problem. Up to " + PGAdvanced.MAX_QUESTIONS + " questions."));
    box.appendChild(det);
    var row = h("div", "row"), imp = h("button", "small", "Import word list"), exp = h("button", "small", "Export word list");
    imp.type = exp.type = "button"; exp.disabled = !qs.length;
    imp.onclick = function () {
      PGTransfer.importFile({
        title: "Import a word list", accept: ".csv,.txt,text/csv,text/plain",
        note: "Choose a CSV file or paste its text. Format: " + PGAdvanced.WORDLIST_FORMAT + ". This replaces your current questions.",
        onText: function (t) { return PGAdvanced.importWordlist(t); },
        onDone: function (r) { drawQuestions(box); var s = box.querySelector(".qstatus"); if (s) s.textContent = "Imported " + r.count + " question" + (r.count === 1 ? "" : "s") + "."; }
      });
    };
    exp.onclick = function () {
      PGTransfer.exportFile({ title: "Export your word list", filename: "playgloss-word-list.csv", mime: "text/csv", text: PGAdvanced.exportWordlist(),
        note: "Save this file to keep your questions, or to edit them in a spreadsheet." });
    };
    row.appendChild(imp); row.appendChild(exp); box.appendChild(row);
    status.className = "note qstatus"; box.appendChild(status);
  }

  /* ---------- export and import of the Custom setup ---------- */
  // "Custom Mode Configurations" are the Custom setup (mode, Infinite, hearts, target score, time, wheel colors). With Advanced Mode on
  // they are "Advanced Custom Mode Configurations": the same plus the probabilities, the "?" switch and the questions.
  var configName = function () { return PGAdvanced.enabled() ? "Advanced Custom Mode Configuration" : "Custom Mode Configuration"; };
  function configObject() {
    var c = cfg.custom, advOn = PGAdvanced.enabled();
    var o = { app: "PlayGloss", kind: advOn ? "advanced-custom-mode" : "custom-mode", version: 1,
      custom: { extreme: !!c.extreme, inf: !!c.inf, hearts: c.hearts, targetScore: c.targetScore, time: c.time, levelColors: c.levelColors } };
    if (advOn) o.advanced = PGAdvanced.exportData();
    return o;
  }
  function exportConfig(onDone) {
    var advOn = PGAdvanced.enabled();
    PGTransfer.exportFile({
      title: "Export " + configName(), filename: advOn ? "playgloss-advanced-custom-mode.json" : "playgloss-custom-mode.json",
      mime: "application/json", text: JSON.stringify(configObject(), null, 2), onDone: onDone,
      note: "Save this file to use the same setup again, or to share it. Import it later from the same place."
    });
  }
  // Checks the whole file before anything is changed.
  function importConfigText(text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { return { ok: false, error: "that is not a configuration file." }; }
    if (!d || typeof d !== "object" || d.app !== "PlayGloss" || d.version !== 1 || ["custom-mode", "advanced-custom-mode"].indexOf(d.kind) < 0 || !d.custom || typeof d.custom !== "object")
      return { ok: false, error: "this is not a PlayGloss configuration file." };
    var k = Game.cleanCustom({ hearts: d.custom.hearts, targetScore: d.custom.targetScore, time: d.custom.time, levelColors: d.custom.levelColors }), skipped = false;
    if (d.advanced !== undefined) {
      if (PGAdvanced.enabled()) { var r = PGAdvanced.importData(d.advanced); if (!r.ok) return { ok: false, error: r.error }; }
      else skipped = true;
    }
    cfg.custom = customOf({ hearts: k.hearts, targetScore: k.targetScore, time: k.time, levelColors: k.levelColors,
      extreme: d.custom.extreme === true, inf: d.custom.inf === true, color: cfg.custom.color });
    return { ok: true, skipped: skipped };
  }
  function importConfig() {
    PGTransfer.importFile({
      title: "Import " + configName(), accept: ".json,application/json,text/plain",
      note: "Choose a configuration file you exported before, or paste its text. Your current Custom setup is replaced.",
      onText: importConfigText,
      onDone: function (r) { drawSetup(); save(); if (r.skipped) notice("The Advanced part of that file was not used because Advanced Mode is off in Settings. The rest was imported."); }
    });
  }
  function drawConfigBox(parent, inAdvanced) {
    var sec = h("section", "box cfgbox"), t = h("h3", "", PGAdvanced.enabled() ? "Advanced Custom Mode Configurations" : "Custom Mode Configurations");
    sec.appendChild(t);
    sec.appendChild(h("p", "note", PGAdvanced.enabled()
      ? "Export or import everything about this Custom game in one file: the rules from the other tabs, the probabilities, the \"?\" switch and your questions."
      : "Export or import the setup of this Custom game (the rules and times from the other tabs) as a file. It works the same on Windows, macOS, Linux, Android and in the browser; if saving a file is not possible on your device, copy the text instead."));
    var row = h("div", "row"), exp = h("button", "spin", "Export"), imp = h("button", "small", "Import");
    exp.type = imp.type = "button";
    exp.onclick = function () { exportConfig(); };
    imp.onclick = importConfig;
    row.appendChild(exp); row.appendChild(imp); sec.appendChild(row);
    var lab = h("label", "xfer-check"), cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = !PGAdvanced.get().dontShowExportPrompt;
    cb.onchange = function () { PGAdvanced.set({ dontShowExportPrompt: !cb.checked }); };
    lab.appendChild(cb); lab.appendChild(document.createTextNode(" Ask me before each Custom game if I want to export this configuration"));
    sec.appendChild(lab);
    parent.appendChild(sec);
  }

  // The question "Would you like to export this configuration?" before Start game or Host a game in Custom mode.
  function showExportPrompt(onContinue) {
    var dlg = $("dlg"), box = $("dlg-btns"), finished = false;
    $("dlg-text").textContent = "Would you like to export this configuration?";
    box.textContent = ""; dlg.oncancel = null; // Escape closes the question and the game does not start
    var chk = h("label", "xfer-check"), cb = document.createElement("input");
    cb.type = "checkbox"; chk.appendChild(cb); chk.appendChild(document.createTextNode(" Don't show this again"));
    function done(exportIt) {
      if (finished) return; finished = true;
      if (cb.checked) PGAdvanced.set({ dontShowExportPrompt: true });
      dlg.close();
      if (exportIt) exportConfig(onContinue); else onContinue();
    }
    var yes = h("button", "spin", "Export, then continue"), no = h("button", "small", "Continue without exporting");
    yes.type = no.type = "button"; yes.onclick = function () { done(true); }; no.onclick = function () { done(false); };
    box.appendChild(chk); box.appendChild(yes); box.appendChild(no);
    dlg.showModal(); yes.focus();
  }

  // Something in the Advanced tab stops the game from starting: returns the reason, or "".
  function advProblem() {
    if (!cfg.customOn || !PGAdvanced.enabled()) return "";
    if (advDraft && draftTotal() !== 10000) return "The probabilities in the Advanced tab add up to " + pct(draftTotal()) + "%. They must add up to exactly 100%.";
    var a = PGAdvanced.get();
    if (a.questionsMode === "custom" && !a.customQuestions.length) return "Questions is set to Custom, but there are no questions yet. Add some in the Advanced tab, or set Questions back to Default.";
    return "";
  }
  function notice(text) { warn(text); }


  /* ---------- the "Online" option: host a game, or join one ---------- */
  function drawOnline(box) {
    var tabs = h("div", "row"), app = !!window.__TAURI__;
    tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", "Online");
    [["join", "Join a game"], ["host", "Host a game"]].forEach(function (t) {
      var b = h("button", "small", t[1]); b.type = "button";
      b.setAttribute("aria-pressed", oTab === t[0]);
      b.onclick = function () { oTab = t[0]; drawSetup(); };
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    if (oTab === "join") return drawJoin(box);
    // host
    if (!app) { box.appendChild(h("p", "note", "Hosting needs the PlayGloss app for Windows, macOS, Linux or Android. In the browser you can join a game that someone else hosts.")); return; }
    if (!onlineEnabled()) {
      var p = h("p", "note", "Play Online is off. Turn it on in "), a = h("a", "", "Settings");
      a.href = "settings.html"; p.appendChild(a); p.appendChild(document.createTextNode(" to host a game on your own network."));
      box.appendChild(p); return;
    }
    var sides = h("div", "row"), panels = h("div", "panels");
    sides.setAttribute("role", "group"); sides.setAttribute("aria-label", "Game mode");
    MODES.slice(1).forEach(function (m) { // Solo is not offered online
      var b = h("button", "small", m[1]); b.type = "button";
      b.setAttribute("aria-pressed", cfg.mode === m[0]);
      b.onclick = function () { cfg.mode = m[0]; drawSetup(); save(); };
      sides.appendChild(b);
    });
    box.appendChild(sides);
    box.appendChild(customSwitch());
    if (cfg.customOn) drawCustom(box, true); // the Custom setup has its own Modes, Time, Colors and Teams
    else {
      box.appendChild(modesBox());
      for (var ti = 0; ti < 2; ti++) panels.appendChild(panel(ti));
      box.appendChild(panels);
    }
    var hostBtn = h("button", "spin", "Host a game"); hostBtn.type = "button";
    hostBtn.onclick = function () {
      var problem = advProblem();
      if (problem) return notice(problem);
      if (cfg.customOn && !PGAdvanced.get().dontShowExportPrompt) showExportPrompt(startHosting); else startHosting();
    };
    box.appendChild(h("div", "row")).appendChild(hostBtn);
    box.appendChild(h("p", "note", "Players on the same Wi-Fi join with your link or QR code. You approve every guest. Nothing goes over the internet."));
  }

  // "Modes" in the Host a game tab: Default or Extreme, and the Infinite switch. Guests are told the choice in the lobby.
  function modesBox() {
    var b = h("section", "box"), r = runOf(), row = h("div", "row"), set = h("div", "setrow"), onoff = h("div", "row");
    b.setAttribute("aria-labelledby", "modes-title");
    var t = h("h3", "", "Modes"); t.id = "modes-title"; b.appendChild(t);
    row.setAttribute("role", "group"); row.setAttribute("aria-labelledby", "modes-title");
    [["default", "Default"], ["extreme", "Extreme"]].forEach(function (m) {
      var x = h("button", "small", m[1]); x.type = "button";
      x.setAttribute("aria-pressed", r.extreme === (m[0] === "extreme"));
      x.onclick = function () { cfg.run = { extreme:m[0] === "extreme", inf:runOf().inf, color:runOf().color }; drawSetup(); save(); };
      row.appendChild(x);
    });
    b.appendChild(row);
    var lab = h("span", "setlabel", "Infinite"); lab.id = "inf-label";
    onoff.setAttribute("role", "group"); onoff.setAttribute("aria-labelledby", "inf-label");
    [[false, "Off"], [true, "On"]].forEach(function (m) {
      var x = h("button", "small", m[1]); x.type = "button";
      x.setAttribute("aria-pressed", r.inf === m[0]);
      x.onclick = function () { cfg.run = { extreme:runOf().extreme, inf:m[0], color:runOf().color }; drawSetup(); save(); };
      onoff.appendChild(x);
    });
    set.appendChild(lab); set.appendChild(onoff); b.appendChild(set);

    // Color override for guests
    var colorRow = h("div", "row"), colorSet = h("div", "setrow"), colorLab = h("span", "setlabel", "Color (guests)");
    colorRow.setAttribute("role", "group"); colorRow.setAttribute("aria-labelledby", "color-label");
    colorLab.id = "color-label";
    [["default", "Default"], ["extreme", "Extreme"]].forEach(function (m) {
      var x = h("button", "small", m[1]); x.type = "button";
      x.setAttribute("aria-pressed", (r.color || "default") === m[0]);
      x.onclick = function () { cfg.run = { extreme:runOf().extreme, inf:runOf().inf, color:m[0] }; drawSetup(); save(); };
      colorRow.appendChild(x);
    });
    colorSet.appendChild(colorLab); colorSet.appendChild(colorRow); b.appendChild(colorSet);
    b.appendChild(h("p", "note", "Default: guests keep their own theme. Extreme: all guests see the Extreme theme (dark red). The host's theme is never affected. Guests can still toggle light/dark."));

    b.appendChild(h("p", "note", "Extreme flips how often the levels come up, so Impossible comes as often as Very Easy does in Default. Points and time per level stay the same."));
    b.appendChild(h("p", "note", "Infinite: no 100 points goal. Everyone has 3 hearts and loses one for each wrong answer or time up. Hosting uses the choice you make here, not the one in Settings."));
    return b;
  }

  function drawJoin(box) {
    var app = !!window.__TAURI__, wrap = h("div", "field"), lab = h("span", "flabel", "Join link"), row = h("div", "frow"), input = h("input");
    var status = h("p", "note"), buttons = h("div", "row");
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    input.type = "text"; input.maxLength = 120; input.autocomplete = "off"; input.spellcheck = false;
    input.setAttribute("inputmode", "url"); input.setAttribute("aria-label", "Join link"); input.placeholder = "http://192.168.1.23:49152/join.html#...";
    row.appendChild(input); wrap.appendChild(lab); wrap.appendChild(row);
    box.appendChild(h("p", "note", "Ask the host for the join link or QR code. Both only work on the same Wi-Fi or network as the host."));
    box.appendChild(wrap);

    function join(text) {
      var l = Link.parse(text);
      if (!l) { status.textContent = "That is not a PlayGloss join link. Ask the host to share it again."; return; }
      status.textContent = "Connecting...";
      location.href = app ? Link.appUrl(l) : l.url; // the host still has to let you in
    }
    var go = h("button", "spin", "Join"); go.type = "button";
    go.onclick = function () { join(input.value); };
    input.onkeydown = function (e) { if (e.key === "Enter") join(input.value); };

    if (navigator.clipboard && navigator.clipboard.readText) {
      var paste = h("button", "small act", "Paste link"); paste.type = "button";
      paste.onclick = function () {
        navigator.clipboard.readText().then(function (t) { input.value = String(t).trim().slice(0, 120); status.textContent = ""; input.focus(); },
          function () { status.textContent = "Could not read the clipboard. Paste the link into the box instead."; });
      };
      buttons.appendChild(paste);
    }
    // Scanning needs the camera and the browser's built-in QR reader; where either is missing the button is not shown.
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.BarcodeDetector) {
      var scan = h("button", "small act", "Scan QR code"); scan.type = "button";
      scan.onclick = function () { startScan(box, status, scan, function (text) { input.value = text; join(text); }); };
      buttons.appendChild(scan);
    }
    box.appendChild(buttons);
    box.appendChild(h("div", "row")).appendChild(go);
    box.appendChild(status);
    box.appendChild(h("p", "note", app
      ? "The app connects to the host for you. The scan happens on this device: the camera picture is never saved or sent anywhere."
      : "The link opens the host's own join page. Joining from the website needs a browser that allows http links on your local network."));
  }

  // Camera preview with live QR reading. Only a valid PlayGloss link is accepted; everything else is ignored.
  function startScan(box, status, btn, done) {
    if (stopScan) return;
    var video = h("video"), cancel = h("button", "small act", "Cancel scan"), cam = h("div", "row"), timer = null, stream = null;
    video.setAttribute("playsinline", ""); video.muted = true; video.setAttribute("aria-label", "Camera"); video.style.cssText = "width:100%;max-width:22rem;border-radius:12px";
    cancel.type = "button"; cam.appendChild(video); cam.appendChild(cancel);
    var end = function () {
      clearInterval(timer); if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null; stopScan = null; btn.disabled = false; if (cam.parentNode) cam.parentNode.removeChild(cam);
    };
    stopScan = end; cancel.onclick = function () { end(); status.textContent = ""; };
    btn.disabled = true; status.textContent = "Asking for the camera...";
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then(function (st) {
      if (stopScan !== end) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = st; video.srcObject = st; box.appendChild(cam); video.play().catch(function () {});
      status.textContent = "Point the camera at the host's QR code.";
      var det = new BarcodeDetector({ formats: ["qr_code"] }), busy2 = false;
      timer = setInterval(function () {
        if (busy2 || video.readyState < 2) return;
        busy2 = true;
        det.detect(video).then(function (codes) {
          for (var i = 0; i < codes.length; i++) { var l = Link.parse(codes[i].rawValue); if (l) { end(); done(l.url); return; } }
        }).catch(function () {}).then(function () { busy2 = false; });
      }, 300);
    }, function () { end(); status.textContent = "The camera is not available. Paste the link instead."; });
  }

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
    var t = cfg.teams[ti], solo = cfg.mode === "solo", two = cfg.mode === "2v2" || cfg.mode === "custom", p = h("section", "panel");
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
  var NAME_WARNING = "That name is not allowed. Please choose a different one.";
  function warn(text) { var d = $("warn"); $("warn-text").textContent = text || NAME_WARNING; if (!d.open) d.showModal(); }

  var startNote = function (game) {
    if (game.inf) return "Infinite: everyone has " + Game.heartsOf(game) + " hearts. A wrong answer or time up costs one heart.";
    if (game.customOn) return game.mode === "solo" ? "Reach " + Game.targetOf(game) + " points." : "The first side to reach " + Game.targetOf(game) + " points wins.";
    return "";
  };

  /* ---------- start local game (non-hosting) ---------- */
  function start() {
    var solo = cfg.mode === "solo", two = cfg.mode === "2v2" || cfg.mode === "custom", teams = [], bad = false, D = defaults();
    for (var ti = 0; ti < (solo ? 1 : 2); ti++) {
      var t = cfg.teams[ti], name = clean(t.name) || D.teams[ti].name;
      var players = two ? t.players.map(function (p, k) { return clean(p) || D.teams[ti].players[k]; }) : [name];
      if (Filter.bad(name) || players.some(function (p) { return Filter.bad(p); })) bad = true;
      teams.push({ name:name, fmt:t.fmt, color:t.color, players:players, pfmt:two ? t.pfmt.slice() : [t.fmt] });
    }
    if (bad) return warn();
    var problem = advProblem();
    if (problem) return notice(problem);
    var go = function (order) {
      resetFlow();
      var run = localRun();
      g = Game.create({ mode:cfg.mode, teams:teams, extreme:run.extreme, infinite:run.inf, customOn:!!run.custom, custom:run.custom }, order);
      sd = null; used = {}; busy = false; tab = "game"; say(startNote(g));
      $("setup").hidden = true; $("game").hidden = false; render();
    };
    var begin = function () {
      if (solo) return go(null);
      var d = two ? Game.drawOrder(teams) : Game.drawFirst(teams), ul = $("order-log");
      $("order-note").textContent = two ? "Everyone draws a number from 0 to 9. The team with the higher total goes first."
        : "Each player draws a number from 0 to 9. The higher number goes first.";
      ul.textContent = "";
      d.log.forEach(function (x) { ul.appendChild(h("li", "", x)); });
      $("order").hidden = false; $("order-go").focus();
      $("order-go").onclick = function () { $("order").hidden = true; go(d.order); };
    };
    // Custom games ask first whether to export the configuration (unless the player ticked "Don't show this again").
    if (cfg.customOn && !PGAdvanced.get().dontShowExportPrompt) showExportPrompt(begin); else begin();
  }

  /* ---------- HOSTING: start the LAN server ---------- */
  function startHosting() {
    if (stopping) { alert("Still stopping, please wait..."); return; }
    // Build seat config from current setup
    // Solo and 1v1 seats are named after the side (one player per side); 2v2 and Custom use the individual player names.
    var seats = [];
    if (cfg.mode === "solo") seats.push({ name: cfg.teams[0].name, open: false });
    else if (cfg.mode === "1v1") cfg.teams.forEach(function (t) { seats.push({ name: t.name, open: false }); });
    else cfg.teams.forEach(function (t) { t.players.forEach(function (n) { seats.push({ name: n, open: false }); }); });
    // For 1v1 and 2v2, mark seats as "open for guest" if user wants (we'll add UI for this in lobby)
    var run = cfg.customOn ? customRun() : runOf();
    hostCfg = { seats: seats, mode: cfg.mode, teams: cfg.teams, run: JSON.parse(JSON.stringify(run)) }; // a copy: the setup form can change later
    conn = { type:"password", ssid:"", pass:"", show:false, username:"", loginpass:"" };

    // Load the QR module dynamically; the lobby waits for it so the code is drawn on the first try.
    var qrReady = qrModule ? Promise.resolve() : import("./online/lean-qr.js")
      .then(function (mod) { qrModule = mod; })
      .catch(function (e) { console.warn("QR module failed to load", e); qrModule = null; });

    // Create and start host
    host = new Host({
      ui: {
        onLobbyUpdate: onLobbyUpdate,
        onGuestRequest: onGuestRequest,
        onGuestLeft: onGuestLeft,
        onGameStart: onGameStart,
        onAction: onGuestAction,
        onResync: function () { broadcastSnap(); },
        onStop: onHostStop
      },
      cfg: hostCfg,
      Proto: Proto,
      Filter: Filter,
      K: Proto.newKey(),
      rnd: function () { return nacl.randomBytes(12); }
    });

    var starting = host;
    Promise.all([starting.start(), qrReady]).then(function (r) {
      if (host !== starting) return; // stopped while starting
      hosting = true;
      showLobby(r[0]);
    }).catch(function (err) {
      alert("Failed to start hosting: " + err);
      if (host === starting) host = null;
    });
  }

  // Draws the QR code with whole-pixel modules, dark on white and a 4-module quiet zone, whatever the theme.
  // (lean-qr's own toCanvas draws 1 pixel per module on a transparent background, which scanners cannot read
  // on a dark page.)
  function drawQR(link, canvas, size) {
    canvas = canvas || $("qr-canvas"); size = size || 256;
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!qrModule) { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.hidden = true; return; }
    try {
      var qr = qrModule.generate(link, { minCorrectionLevel: qrModule.correction.M });
      var quiet = 4, mods = qr.size + quiet * 2, scale = Math.max(4, Math.floor(512 / mods)), px = mods * scale;
      canvas.width = px; canvas.height = px;
      canvas.style.width = size + "px"; canvas.style.height = size + "px";
      canvas.style.maxWidth = "100%"; canvas.style.imageRendering = "pixelated";
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, px, px);
      ctx.fillStyle = "#000000";
      for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++) {
        if (qr.get(x, y)) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
      }
      canvas.hidden = false;
    } catch (e) {
      console.warn("QR generation failed", e);
      canvas.hidden = true;
    }
  }


  /* ---------- Connection: which kind of Wi-Fi everybody is on ---------- */
  // Shown in the lobby once hosting has started. It helps guests get onto the same network as the host. Nothing here
  // is sent to guests or saved: the Wi-Fi name and password only live in this box and in the QR code on this screen.
  var CONN = [
    ["open", "No password", "An open network. Guests connect to the Wi-Fi without a password, then open your link or scan the join QR code. Open networks are not private, so only use one you trust."],
    ["password", "Password", "A normal Wi-Fi with a password (WPA2 or WPA3), like most homes. Guests join the Wi-Fi with the password first, then open your link. You can show a Wi-Fi QR code below so they can connect with their camera."],
    ["portal", "Login page", "A network that shows a login or accept page in the browser, such as school, hotel or cafe Wi-Fi."]
  ];
  // The text a Wi-Fi QR code carries (the standard WIFI: format that phone cameras understand).
  function wifiText(type, ssid, pass) {
    var esc = function (v) { return String(v).replace(/([\\;,:"])/g, "\\$1"); };
    if (!ssid || (type === "password" && !pass)) return "";
    return "WIFI:T:" + (type === "open" ? "nopass" : "WPA") + ";S:" + esc(ssid) + ";" + (type === "open" ? "" : "P:" + esc(pass) + ";") + ";";
  }
  function drawConn() {
    var box = $("lobby-conn");
    if (!box || !conn) return;
    box.textContent = "";
    var t = h("h3", "", "Connection"); t.id = "conn-title"; box.appendChild(t);
    box.appendChild(h("p", "note", "Pick the kind of Wi-Fi you are on. Guests must be on the same network as you."));
    var row = h("div", "row"), info = CONN.filter(function (c) { return c[0] === conn.type; })[0];
    row.setAttribute("role", "group"); row.setAttribute("aria-label", "Wi-Fi type");
    CONN.forEach(function (c) {
      var b = h("button", "small", c[1]); b.type = "button";
      b.setAttribute("aria-pressed", conn.type === c[0]);
      b.onclick = function () { conn.type = c[0]; drawConn(); };
      row.appendChild(b);
    });
    box.appendChild(row);
    box.appendChild(h("p", "note", info[2]));

    if (conn.type === "portal") {
      box.appendChild(h("p", "warnline", "These networks often stop devices from talking to each other, so guests may not reach your game even after they log in."));
      var ol = h("ol", "note");
      ["Log in on the network's page on every device, this one too.",
       "Share the link as usual and check that a guest can connect.",
       "If it does not work, switch on your phone's hotspot (Wi-Fi sharing), connect everybody to it, then press Stop hosting and host again."].forEach(function (x) { ol.appendChild(h("li", "", x)); });
      box.appendChild(ol);

      // Optional login helper: the Wi-Fi name and the username and password of the login page, so the host can read
      // them off this screen (they are often different from a home Wi-Fi: at a school the username can be an ID such
      // as ss12345). Memory only. They are not sent to guests and not part of any QR code or link.
      var loginWrap = h("div", "box inner");
      loginWrap.appendChild(h("h4", "", "Login helper (optional)"));
      var lfield = function (label, key, max, type) {
        var w = h("div", "field"), i = h("input");
        i.type = type || "text"; i.maxLength = max; i.value = conn[key] || ""; i.autocomplete = "off"; i.spellcheck = false; i.setAttribute("aria-label", label);
        i.oninput = function () { conn[key] = i.value; };
        w.appendChild(h("span", "flabel", label)); w.appendChild(i);
        return w;
      };
      loginWrap.appendChild(lfield("Wi-Fi name (e.g. SchoolWiFi)", "ssid", 32));
      loginWrap.appendChild(lfield("Username / ID (e.g. ssxxxxx, where xxxxx is your own number)", "username", 64));
      loginWrap.appendChild(lfield("Password (some networks use the username again)", "loginpass", 64, conn.show ? "text" : "password"));
      var lshow = h("button", "small", conn.show ? "Hide password" : "Show password"); lshow.type = "button"; lshow.setAttribute("aria-pressed", conn.show);
      lshow.onclick = function () { conn.show = !conn.show; drawConn(); };
      loginWrap.appendChild(h("div", "row")).appendChild(lshow);
      loginWrap.appendChild(h("p", "note", "These are only here so you can read them on this screen. They are not saved, not sent to guests and not part of any QR code or link. Guests sign in with their own login."));
      box.appendChild(loginWrap);
      return;
    }

    // Open or password: an optional Wi-Fi QR code
    var qr = h("canvas", "wifi-qr"), hint = h("p", "note"), wrap = h("div", "field");
    var field = function (label, key, max, type) {
      var w = h("div", "field"), i = h("input");
      i.type = type || "text"; i.maxLength = max; i.value = conn[key]; i.autocomplete = "off"; i.spellcheck = false; i.setAttribute("aria-label", label);
      i.oninput = function () { conn[key] = i.value; paintWifi(); };
      w.appendChild(h("span", "flabel", label)); w.appendChild(i);
      return [w, i];
    };
    box.appendChild(field("Wi-Fi name (optional)", "ssid", 32)[0]);
    if (conn.type === "password") {
      var pw = field("Wi-Fi password (optional)", "pass", 63, conn.show ? "text" : "password"), show = h("button", "small", conn.show ? "Hide password" : "Show password");
      show.type = "button"; show.setAttribute("aria-pressed", conn.show);
      show.onclick = function () { conn.show = !conn.show; drawConn(); };
      box.appendChild(pw[0]); box.appendChild(h("div", "row")).appendChild(show);
    }
    qr.setAttribute("aria-label", "Wi-Fi QR code"); qr.hidden = true;
    box.appendChild(hint); box.appendChild(qr);
    box.appendChild(h("p", "note", "The Wi-Fi name and password stay on this screen. They are not saved, not sent to guests by PlayGloss and not part of the join link. Anyone who scans the Wi-Fi QR code gets the password, so do not share a screenshot."));
    function paintWifi() {
      var text = wifiText(conn.type, conn.ssid.trim(), conn.pass);
      if (!text) { qr.hidden = true; hint.textContent = conn.type === "password" ? "Type the Wi-Fi name and password to show a QR code that guests can scan to join the Wi-Fi." : "Type the Wi-Fi name to show a QR code that guests can scan to join the Wi-Fi."; return; }
      hint.textContent = "Guests can scan this with their phone camera to join the Wi-Fi. Then they scan the join QR code below.";
      drawQR(text, qr, 200);
    }
    paintWifi();
  }

  function showLobby(info) {
    $("setup").hidden = true; $("game").hidden = true; $("lobby").hidden = false; $("mtabs").hidden = true;
    $("online-indicator").hidden = false;
    drawConn();
    renderLobby(host.session.seats, "lobby");
    if (info.ips.length) drawQR(host.linkFor(info.ips[0]));
    $("host-link").textContent = info.ips.length ? host.linkFor(info.ips[0]) : "Waiting for IP...";
    $("stop-host").onclick = function () { try { stopHosting(); } catch (e) { console.error("stopHosting error:", e); } };
  }

  function renderLobby(seats, phase) {
    if (!host || !host.session || !hostCfg) return;
    var box = $("lobby-seats"), sess = host.session;
    $("lobby-mode").textContent = "Mode: " + View.runText(hostCfg.run);
    box.textContent = "";
    seats.forEach(function (s, i) {
      // Session seats have no "taken" flag (that only exists in the message sent to guests), so ask the session.
      var p = h("section", "panel"), taken = !!sess.guestOf(i);
      var away = taken && sess.conns[s.guest] && sess.conns[s.guest].away;
      var ti = i < 2 ? 0 : 1, pi = i % 2;
      var label = hostCfg.mode === "solo" ? "You" : (hostCfg.mode === "1v1" ? "Player " + (i + 1) : "Team " + (ti + 1) + " - Player " + (pi + 1));
      p.appendChild(h("h3", "", label + (s.open ? " (open for guest)" : "")));
      p.appendChild(h("p", "", "Name: " + s.name));

      if (s.open) {
        if (taken) {
          p.appendChild(h("p", "note", away ? "Guest is away (seat kept)" : "Taken by guest"));
          var kickBtn = h("button", "small act", "Remove"); kickBtn.type = "button";
          var gid = s.guest;
          kickBtn.onclick = function () { try { removeGuest(gid); } catch (e) { console.error("kick error:", e); } };
          p.appendChild(kickBtn);
        } else {
          var takeBtn = h("button", "small act", "This device"); takeBtn.type = "button";
          takeBtn.onclick = function () { try { setSeatControl(i, false); } catch (e) { console.error("setSeatControl error:", e); } };
          p.appendChild(takeBtn);
        }
      } else {
        // This device controls it
        var openBtn = h("button", "small act", "Open for guest"); openBtn.type = "button";
        openBtn.onclick = function () { try { setSeatControl(i, true); } catch (e) { console.error("setSeatControl error:", e); } };
        p.appendChild(openBtn);
      }
      box.appendChild(p);
    });

    // Everyone connected, including guests who have no seat yet, so the host can remove anyone.
    var guests = Object.keys(sess.conns).filter(function (id) { return sess.conns[id].state === "ok"; });
    if (guests.length) {
      var gp = h("section", "panel");
      gp.appendChild(h("h3", "", "Connected guests"));
      guests.forEach(function (id) {
        var c = sess.conns[id], row = h("p", "", c.name + (c.seat >= 0 ? "" : " (no seat yet)") + (c.away ? " (away)" : "") + " ");
        var rb = h("button", "small act", "Remove"); rb.type = "button";
        rb.onclick = function () { try { removeGuest(id); } catch (e) { console.error("remove error:", e); } };
        row.appendChild(rb); gp.appendChild(row);
      });
      box.appendChild(gp);
    }

    // Start game button (only if all seats have a controller)
    var allControlled = seats.every(function (s, i) { return !s.open || !!sess.guestOf(i); });
    $("lobby-start").hidden = !allControlled || phase !== "lobby";
    $("lobby-start").onclick = function () { try { startHostedGame(); } catch (e) { console.error("startHostedGame error:", e); } };

    // Re-attach Stop Hosting handler (renderLobby recreates seat panels but not this button)
    $("stop-host").onclick = function () { try { stopHosting(); } catch (e) { console.error("stopHosting error:", e); } };
  }

  function removeGuest(id) {
    if (!host || !host.session) return;
    var sess = host.session, names = {};
    sess.seats.forEach(function (st, i) { if (st.guest === id) names[i] = true; });
    host.kick(id);
    // Put the seat's original name back now that its guest is gone.
    Object.keys(names).forEach(function (i) { if (sess.seats[i] && hostCfg.seats[i]) sess.seats[i].name = hostCfg.seats[i].name; });
    renderLobby(sess.seats, sess.phase);
  }

  function setSeatControl(seatIndex, open) {
    if (!host) return;
    try {
      hostCfg.seats[seatIndex].open = open;
      // Start from the session's seats so names that guests picked are kept; a seat taken back by this device
      // gets its original name again.
      var list = host.session.seats.map(function (s, i) {
        if (i !== seatIndex) return { name: s.name, open: s.open };
        return { name: open ? s.name : hostCfg.seats[i].name, open: open };
      });
      host.session.setSeats(list);
    } catch (e) {
      console.error("setSeatControl error:", e);
    }
  }

  function onLobbyUpdate(seats, phase) {
    renderLobby(seats, phase);
  }

  function onGuestRequest(id, name) {
    // Show approval dialog
    Overlays.ask(name + " wants to join. Approve?", ["Approve", "Refuse"]).then(function (k) {
      if (!host || !host.session) return; // hosting stopped while the question was open
      if (k === 0) {
        // Seat the guest in the first free open seat. If none is open yet, let them in anyway: they wait in the
        // lobby and can take a seat as soon as the host opens one.
        var seats = host.session.seats, seat = -1;
        for (var i = 0; i < seats.length; i++) {
          if (seats[i].open && !host.session.guestOf(i)) { seat = i; break; }
        }
        host.approve(id, seat);
      } else {
        host.refuse(id, "Declined by host");
      }
    });
  }

  function onGuestLeft(id) {
    // Handled by lobby update
  }

  function startHostedGame() {
    try {
    // Build teams from current session seats (which have updated names from guests)
    var sessionSeats = host.session.seats;
    var nameOf = function (i, dflt) { return sessionSeats[i] ? sessionSeats[i].name : dflt; };
    var teams = hostCfg.teams.map(function (t, ti) {
      if (hostCfg.mode === "2v2" || hostCfg.mode === "custom") {
        return { name: t.name, fmt: t.fmt, color: t.color,
          players: [nameOf(ti * 2, t.players[0]), nameOf(ti * 2 + 1, t.players[1])], pfmt: t.pfmt.slice() };
      }
      var nm = nameOf(ti, t.name); // solo / 1v1: one player per side, named after the side
      return { name: nm, fmt: t.fmt, color: t.color, players: [nm], pfmt: [t.fmt] };
    });
    if (hostCfg.mode === "solo") teams = teams.slice(0, 1);
    // Determine turn order (draw)
    var solo = hostCfg.mode === "solo", two = hostCfg.mode === "2v2" || hostCfg.mode === "custom";
    var go = function (order) {
      resetFlow();
      g = Game.create({ mode: hostCfg.mode, teams: teams, extreme: hostCfg.run.extreme, infinite: hostCfg.run.inf, customOn: !!hostCfg.run.custom, custom: hostCfg.run.custom }, order);
      sd = null; used = {}; busy = false; tab = "game"; say(startNote(g));
      host.startGame();
      $("lobby").hidden = true; $("game").hidden = false;
      render();
    };
    if (solo) return go(null);
    var d = two ? Game.drawOrder(teams) : Game.drawFirst(teams), ul = $("order-log");
    $("order-note").textContent = two ? "Everyone draws a number from 0 to 9. The team with the higher total goes first."
      : "Each player draws a number from 0 to 9. The higher number goes first.";
    ul.textContent = "";
    d.log.forEach(function (x) { ul.appendChild(h("li", "", x)); });
    $("order").hidden = false; $("order-go").focus();
    $("order-go").onclick = function () { $("order").hidden = true; go(d.order); };
    } catch (e) {
      console.error("startHostedGame error:", e);
      alert("Start game failed: " + e.message);
    }
  }

  function onGameStart() {
    // Game started, UI will handle rendering
  }

  // A guest asked for something. The host decides: it must be that guest's own player, and the game must be
  // waiting for exactly that. Anything else is ignored.
  function onGuestAction(seat, a) {
    if (!g || !host || !remote(seat)) return;
    var A = a.a, fn;
    if (A === "yes" || A === "no") { if (drawP && drawP.seat === seat) drawP.resolve(A === "yes"); return; }
    if (g.over || g.turn !== seat) return;
    if (A === "spin") { if (idle() && !g.players[seat].out) spin(); return; }
    if (A === "resign") { if (idle() && !sd) doResign(true); return; }
    if (A === "draw") { if (idle() && !sd && !g.offered) doDraw(); return; }
    fn = pend && pend.seat === seat ? pend[A] : null; // arm, go, ans, next, ok
    if (typeof fn === "function") fn(a);
  }

  // Sends the game picture to the guests. The power-up choice and the question go only to the guest whose turn it is.
  function broadcastSnap(extra) {
    if (!host || !host.session || host.session.phase !== "game" || !g) return;
    var data = { g: g, sd: !!sd, msg: $("msg").textContent, busy: !idle(), egg: S.egg, drawOffer: S.drawOffer, pu: S.pu, q: S.q };
    if (extra) for (var k in extra) data[k] = extra[k];
    host.broadcastSnap(data, g.turn);
  }

  function stopHosting() {
    if (!host || stopping) return;
    stopping = true;
    hosting = false;
    var h = host;
    host = null;
    try {
      h.stop().then(function () {
        stopping = false;
        hostCfg = null;
        showSetup();
      }).catch(function () {
        stopping = false;
        hostCfg = null;
        showSetup();
      });
    } catch (e) {
      console.error("stopHosting.stop error:", e);
      stopping = false;
      hostCfg = null;
      showSetup();
    }
  }

  function onHostStop() {
    if (!hosting) return;
    host = null;
    hosting = false;
    hostCfg = null;
    showSetup();
  }

  /* ---------- wheel ---------- */
  // Draws the wheel with the level colors of the game on screen (a Custom game can have its own). The drawing is only
  // redone when the colors change, so a spin is never interrupted. Where the wheel is turning is kept on #wheel itself.
  function build() {
    var colors = g && g.custom ? g.custom.levelColors : null, key = JSON.stringify(colors || {});
    if (key === wheelKey) return;
    wheelKey = key;
    var slices = Wheel.getSlices(colors);
    var n = slices.length, a = 360 / n, R = 96;
    var pt = function (d, r) { var t = (d - 90) * Math.PI / 180; return [100 + r * Math.cos(t), 100 + r * Math.sin(t)].map(function (v) { return v.toFixed(2); }); };
    var s = '<svg viewBox="0 0 200 200" aria-hidden="true">';
    slices.forEach(function (c, i) {
      var p1 = pt(i * a, R), p2 = pt((i + 1) * a, R), m = (i + .5) * a, t = pt(m, 58);
      s += '<path d="M100 100L' + p1[0] + " " + p1[1] + "A" + R + " " + R + " 0 0 1 " + p2[0] + " " + p2[1] + 'Z" fill="' + c.color + '" stroke="var(--fg)" stroke-width=".6"/>' +
        '<text x="' + t[0] + '" y="' + t[1] + '" transform="rotate(' + (m > 180 ? m + 90 : m - 90) + " " + t[0] + " " + t[1] + ')" text-anchor="middle" dominant-baseline="central" font-size="6.5" fill="' + c.ink + '">' + c.label + "</text>";
    });
    $("wheel").innerHTML = s + "</svg>";
  }

  /* ---------- drawing the game (uses View.paint) ---------- */
  function render() {
    $("mtabs").hidden = false; // render() only runs while the game is on screen
    build();
    var acts = function (pi) { return idle() && !g.over && !sd && g.turn === pi && !g.players[pi].out && !remote(pi); };
    var shownTab = View.paint(g, Game, { tab: tab, sd: !!sd, acts: acts });
    tab = shownTab;
    $("spin").disabled = !idle() || g.over || remote(g.turn);
    $("new").hidden = !(g.over || g.mode === "solo");
    save();
    broadcastSnap();
  }

  /* ---------- dialogs (use Overlays) ---------- */
  // Overlays.ask, Overlays.egg are used directly

  /* ---------- a turn ---------- */
  function spin() {
    if (!idle() || g.over) return;
    busy = true; say(""); render();
    var res = Wheel.pick(g.extreme, g.custom && g.custom.adv), i = SL.indexOf(res), a = 360 / SL.length; // the wheel is drawn with equal slices; the odds only decide where it stops
    var want = ((-(i + .5) * a) % 360 + 360) % 360, cur = ((rot % 360) + 360) % 360;
    rot += ((want - cur + 360) % 360) + 1800;
    var rm = matchMedia("(prefers-reduced-motion: reduce)").matches, w = $("wheel");
    w.style.transition = rm ? "transform .2s" : "transform 4s cubic-bezier(.15,.7,.1,1)";
    w.style.transform = "rotate(" + rot + "deg)";
    broadcastSnap({ spin: { n: ++spinN, index: i } });
    later(function () { landed(res); }, rm ? 250 : 4100);
  }

  // The level as it is played in this game: the same, with the seconds of the Custom "Time to answer" (if any).
  function withTime(lv) { return Object.assign({}, lv, { time: Game.seconds(g, lv) }); }

  function landed(res) {
    if (sd) return sdLand(res);
    if (res.points !== undefined) return reveal(withTime(res));
    if (res.id === "egg") { say(who() + " hit the Easter egg!"); return eggFlow(false, finish); }
    Game.grant(g, res.id);
    say(who() + " got " + res.name + (res.id === "free" ? ": +5 points." : ". Turn used."));
    finish();
  }

  // The Easter egg. On the host's screen when the host plays that turn, or when both teams hit it. Otherwise only on
  // the screen of the guest who hit it (the host just sees the status line).
  function eggFlow(shared, cb) {
    var seat = g.turn, done = false, t = null;
    var fin = function () {
      if (done) return; done = true; clearTimeout(t);
      pend = null; S.egg = null; $("egg").hidden = true;
      cb();
    };
    S.egg = { shared: shared }; pend = { seat: seat, ok: fin };
    if (shared || !remote(seat)) Overlays.egg(shared, fin); else t = later(fin, 30000);
    broadcastSnap();
  }

  // Power-up choice: after the level is known, before the word. A guest's choice is made on the guest's screen.
  function reveal(lv) {
    var seat = g.turn, p = g.players[seat], i = p.inv;
    if (!(i.x2 || i.x3 || i.shield)) return askQuestion(lv);
    if (!remote(seat)) return Overlays.powerUp(g, lv).then(function () { askQuestion(lv); });
    var done = false, t = null, options = [];
    Overlays.PU.forEach(function (b) { if (i[b[0]]) options.push({ id: b[0], name: b[1], count: i[b[0]] }); });
    var go = function () { if (done) return; done = true; clearTimeout(t); pend = null; S.pu = null; askQuestion(lv); };
    S.pu = { level: lv.name, points: lv.points, time: lv.time, options: options };
    pend = { seat: seat, arm: function (a) { Game.arm(g, a.p); render(); }, go: go };
    t = later(go, 90000); // the guest went away: carry on without a power-up choice
    say(p.name + " is choosing a power-up...");
    render();
  }

  // The question. The host picks the word once. If a guest plays this turn, only that guest sees the words and
  // answers; the host's screen shows a status line and judges the answer. Otherwise the host's screen asks.
  function askQuestion(lv) {
    var seat = g.turn, p = g.players[seat], pre = Overlays.pick(lv, g.extreme, g);
    var announce = function (ok, k, pts) {
      say((k === null ? "Time is up. " : ok ? "Correct. " : "Wrong. ") + p.name + " gets " + pl(pts, "point") + "." +
        (g.inf && !ok ? " " + p.name + " loses a heart (" + p.hearts + " left)." : "")); // the heart is already taken off when this runs
    };
    say(p.name + " is answering...");
    if (!remote(seat)) {
      broadcastSnap();
      return Overlays.question(g, lv, pre).then(function (r) {
        announce(r.ok, r.k, r.pts); render();
        $("q-next").hidden = false; $("q-next").focus();
        $("q-next").onclick = function () { $("q").hidden = true; finish(); };
      });
    }
    var stage = 0, t = null;
    var q = { n: ++qN, word: pre.word, level: lv.name, points: lv.points, secs: lv.time, boost: p.armed, opts: pre.opts.map(function (o) { return o.t; }), res: null };
    var next = function () { if (stage !== 1) return; stage = 2; clearTimeout(t); pend = null; S.q = null; finish(); };
    var ans = function (a) {
      if (stage !== 0) return;
      var k = typeof a.i === "number" && a.i >= 0 && a.i < pre.opts.length ? a.i : null;
      if (a.i !== -1 && k === null) return; // not a valid choice: ignore it
      stage = 1; clearTimeout(t);
      var ok = k !== null && pre.opts[k].ok, pts = Game.answer(g, lv, ok);
      q.res = { k: k === null ? -1 : k, right: pre.right, ok: ok, pts: pts };
      announce(ok, k, pts);
      pend = { seat: seat, next: next };
      t = later(next, 30000);
      render();
    };
    S.q = q; pend = { seat: seat, ans: ans };
    t = later(function () { ans({ i: -1 }); }, lv.time * 1000 + 6000); // the guest went away: counts as time up
    render();
  }

  function finish() {
    var p = g.players[g.turn], dying = g.inf && p.hearts <= 0 && !p.out; // Infinite: that was the last heart
    var r = Game.endTurn(g); busy = false;
    if (dying) say(p.name + " is out of hearts.");
    after(r);
  }
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
      eggFlow(true, function () { g.over = true; g.winner = null; g.reason = "both teams share the win"; sd = null; render(); });
    };
    if (res.id === "egg") eggFlow(false, go); else go();
  }

  /* ---------- resign and draw ---------- */
  var teamsOfTwo = function () { return g.mode === "2v2" || g.mode === "custom"; };
  // skipAsk: a guest already confirmed on their own screen.
  function doResign(skipAsk) {
    var p = g.players[g.turn];
    var go = function () {
      var r = Game.resign(g);
      if (!g.over) say(p.name + " resigned.");
      after(r);
    };
    if (skipAsk) return go();
    Overlays.ask(p.name + ", resign the game?" + (teamsOfTwo() ? " Your teammate can keep playing." : ""), ["Resign", "Cancel"]).then(function (k) { if (k === 0) go(); });
  }
  // The offer goes to the other side only: a dialog on this screen if the host plays that player, otherwise on the
  // guest's own screen. Nothing else can be pressed while it is open.
  function doDraw() {
    var p = g.players[g.turn], o = g.teams[other(p.team)], target = Game.rep(g, other(p.team)), done = false, t = null;
    if (target < 0) return; // Infinite: the other side is out of hearts, nobody is left to answer
    var reply = function (accept) {
      if (done) return; done = true; clearTimeout(t);
      drawP = null; S.drawOffer = null; offering = false;
      if (accept) Game.draw(g); else say("Draw declined.");
      render();
    };
    g.offered = true; offering = true;
    S.drawOffer = { targetSeat: target, fromName: p.name };
    say(p.name + " offers a draw" + (teamsOfTwo() ? " for everyone" : "") + ".");
    render();
    if (remote(target)) {
      drawP = { seat: target, resolve: reply };
      t = later(function () { reply(false); }, 60000);
    } else {
      Overlays.ask(o.name + ", " + p.name + " offers a draw" + (teamsOfTwo() ? " for everyone" : "") + ". Accept?", ["Accept draw", "Decline"]).then(function (k) { reply(k === 0); });
    }
  }

  /* ---------- New game: returns to lobby if hosting, else setup ---------- */
  function newGame() {
    try {
    if (g.over) {
      if (hosting) {
        // Return to lobby with same guests
        resetFlow();
        host.session.setPhase("lobby");
        $("game").hidden = true; $("lobby").hidden = false; $("mtabs").hidden = true;
        renderLobby(host.session.seats, "lobby");
      } else {
        showSetup();
      }
      return;
    }
    Overlays.ask("Leave this game and start a new one?", ["New game", "Keep playing"]).then(function (k) { if (k === 0) showSetup(); });
    } catch (e) {
      console.error("newGame error:", e);
    }
  }

  /* ---------- event wiring ---------- */
  $("spin").onclick = function () { if (g && !remote(g.turn)) spin(); };
  $("start").onclick = start;
  $("warn-ok").onclick = function () { $("warn").close(); };
  $("game").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]");
    if (!b || b.disabled || +b.dataset.p !== g.turn || remote(g.turn) || !idle() || sd) return;
    if (b.dataset.act === "draw") doDraw(); else doResign(false);
  });
  $("mtabs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-tab]");
    if (b) { tab = b.dataset.tab; render(); }
  });
  $("new").onclick = newGame;
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });

  /* ---------- init ---------- */
  build();
  var skipped = restore();
  if (g) { $("setup").hidden = true; $("game").hidden = false; if (skipped) say("Your turn was skipped because you left the page."); render(); }
  else showSetup();
})();
