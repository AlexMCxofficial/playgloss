// Play page: setup screen, the wheel, questions, side panels, and online lobby. MIT License (see LICENSE).
(function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  var SL = Wheel.slices, CP = ColorPicker, KEY = "playgloss-session-v3";
  var PU = [["x2","2x"],["x3","3x"],["shield","Shield"]];
  var MODES = [["solo","Solo"],["1v1","1 vs 1"],["2v2","2 vs 2"]];
  var STYLES = [["b","Bold"],["i","Italic"],["u","Underline"]];
  var cfg = defaults(), g = null, sd = null, used = Overlays.used, busy = false, rot = 0, tm = null, tab = "game", pickers = [];

  // Online play state
  var host = null, hosting = false, hostCfg = null, qrModule = null;

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
    return { mode:"1v1", teams:[
      { name:"Red", fmt:"", color:"#e03131", players:["Player 1", "Player 2"], pfmt:["", ""] },
      { name:"Blue", fmt:"", color:"#2f80ed", players:["Player 3", "Player 4"], pfmt:["", ""] }] };
  }
  function okName(v, dflt) { v = clean(v); return v && !Filter.bad(v) ? v : dflt; }
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
      hosting = !!s.hosting;
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

  /* ---------- setup screen ---------- */
  function showSetup() {
    g = null; sd = null; busy = false; clearInterval(tm);
    if (host) { host.stop(); host = null; hosting = false; }
    $("game").hidden = true; $("lobby").hidden = true; $("setup").hidden = false;
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

    // Host a game button (only in app with online enabled)
    if (onlineEnabled()) {
      var hostBtn = h("button", "spin", "Host a game"); hostBtn.type = "button";
      hostBtn.onclick = startHosting;
      box.appendChild(h("div", "row")).appendChild(hostBtn);
    }
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

  /* ---------- start local game (non-hosting) ---------- */
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
    var d = two ? Game.drawOrder(teams) : Game.drawFirst(teams), ul = $("order-log");
    $("order-note").textContent = two ? "Everyone draws a number from 0 to 9. The team with the higher total goes first."
      : "Each player draws a number from 0 to 9. The higher number goes first.";
    ul.textContent = "";
    d.log.forEach(function (x) { ul.appendChild(h("li", "", x)); });
    $("order").hidden = false; $("order-go").focus();
    $("order-go").onclick = function () { $("order").hidden = true; go(d.order); };
  }

  /* ---------- HOSTING: start the LAN server ---------- */
  function startHosting() {
    // Build seat config from current setup
    var solo = cfg.mode === "solo", two = cfg.mode === "2v2", np = solo ? 1 : two ? 4 : 2;
    var seats = [];
    for (var i = 0; i < np; i++) {
      var ti = solo || cfg.mode === "1v1" ? i : (i < 2 ? 0 : 1);
      var pi = solo ? 0 : two ? (i % 2) : i;
      seats.push({ name: cfg.teams[ti].players[pi], open: false }); // default: this device controls all seats
    }
    // For 1v1 and 2v2, mark seats as "open for guest" if user wants (we'll add UI for this in lobby)
    hostCfg = { seats: seats, mode: cfg.mode, teams: cfg.teams };

    // Load QR module dynamically
    import("./online/lean-qr.js").then(function (mod) { qrModule = mod; }).catch(function () { qrModule = null; });

    // Create and start host
    host = new Host({
      ui: {
        onLobbyUpdate: onLobbyUpdate,
        onGuestRequest: onGuestRequest,
        onGuestLeft: onGuestLeft,
        onGameStart: onGameStart,
        onAction: onGuestAction,
        onStop: onHostStop
      },
      cfg: hostCfg,
      Proto: Proto,
      Filter: Filter,
      K: Proto.newKey(),
      rnd: function () { return nacl.randomBytes(12); }
    });

    host.start().then(function (info) {
      hosting = true;
      showLobby(info);
    }).catch(function (err) {
      alert("Failed to start hosting: " + err);
      host = null;
    });
  }

  function showLobby(info) {
    $("setup").hidden = true; $("game").hidden = true; $("lobby").hidden = false;
    $("online-indicator").hidden = false;
    renderLobby(hostCfg.seats, "lobby", info);
    // Show QR code
    if (qrModule && info.ips.length) {
      var canvas = $("qr-canvas");
      var link = host.linkFor(info.ips[0]);
      try {
        var qr = qrModule.generate(link);
        qr.toCanvas(canvas);
      } catch (e) { console.warn("QR generation failed", e); }
    }
    $("host-link").textContent = info.ips.length ? host.linkFor(info.ips[0]) : "Waiting for IP...";
    $("stop-host").onclick = stopHosting;
  }

  function renderLobby(seats, phase, info) {
    var box = $("lobby-seats");
    box.textContent = "";
    seats.forEach(function (s, i) {
      var p = h("section", "panel"), taken = s.guest && s.taken;
      var ti = hostCfg.mode === "solo" ? 0 : (hostCfg.mode === "1v1" ? i : (i < 2 ? 0 : 1));
      var pi = hostCfg.mode === "solo" ? 0 : (hostCfg.mode === "1v1" ? i : (i % 2));
      var label = hostCfg.mode === "solo" ? "You" : (hostCfg.mode === "1v1" ? "Player " + (i + 1) : "Team " + (ti + 1) + " - Player " + (pi + 1));
      p.appendChild(h("h3", "", label + (s.open ? " (open for guest)" : "")));
      p.appendChild(h("p", "", "Name: " + s.name));

      if (s.open) {
        if (taken) {
          p.appendChild(h("p", "note", "Taken by guest"));
          var kickBtn = h("button", "small", "Kick"); kickBtn.type = "button";
          kickBtn.onclick = function () { host.kick(s.guest); };
          p.appendChild(kickBtn);
        } else {
          var takeBtn = h("button", "small", "This device"); takeBtn.type = "button";
          takeBtn.onclick = function () { setSeatControl(i, false); };
          p.appendChild(takeBtn);
        }
      } else {
        // This device controls it
        var openBtn = h("button", "small", "Open for guest"); openBtn.type = "button";
        openBtn.onclick = function () { setSeatControl(i, true); };
        p.appendChild(openBtn);
      }
      box.appendChild(p);
    });

    // Start game button (only if all seats have a controller)
    var allControlled = seats.every(function (s) { return !s.open || (s.guest && s.taken); });
    $("lobby-start").hidden = !allControlled || phase !== "lobby";
    $("lobby-start").onclick = startHostedGame;

    // Update link and QR if info provided
    if (info && info.ips && info.ips.length) {
      var link = host.linkFor(info.ips[0]);
      $("host-link").textContent = link;
      if (qrModule) {
        var canvas = $("qr-canvas");
        try { var qr = qrModule.generate(link); qr.toCanvas(canvas); } catch (e) {}
      }
    }
  }

  function setSeatControl(seatIndex, open) {
    hostCfg.seats[seatIndex].open = open;
    if (open) hostCfg.seats[seatIndex].guest = null;
    host.session.setSeats(hostCfg.seats);
  }

  function onLobbyUpdate(seats, phase) {
    renderLobby(seats, phase);
  }

  function onGuestRequest(id, name) {
    // Show approval dialog
    Overlays.ask(name + " wants to join. Approve?", ["Approve", "Refuse"]).then(function (k) {
      if (k === 0) {
        // Find first open seat
        var seat = -1;
        for (var i = 0; i < hostCfg.seats.length; i++) {
          if (hostCfg.seats[i].open && !hostCfg.seats[i].guest) { seat = i; break; }
        }
        if (seat >= 0) host.approve(id, seat);
        else host.refuse(id, "No open seats");
      } else {
        host.refuse(id, "Declined by host");
      }
    });
  }

  function onGuestLeft(id) {
    // Handled by lobby update
  }

  function startHostedGame() {
    // Build teams from current session seats (which have updated names from guests)
    var sessionSeats = host.session.seats;
    var teams = hostCfg.teams.map(function (t, ti) {
      var playerNames = [], playerFmts = [];
      t.players.forEach(function (_, pi) {
        var seatIndex = (ti === 0 ? pi : (hostCfg.mode === "2v2" ? 2 + pi : 1));
        var seat = sessionSeats[seatIndex];
        playerNames.push(seat ? seat.name : t.players[pi]);
        playerFmts.push(t.pfmt[pi] || "");
      });
      return { name: t.name, fmt: t.fmt, color: t.color, players: playerNames, pfmt: playerFmts };
    });
    // Determine turn order (draw)
    var solo = hostCfg.mode === "solo", two = hostCfg.mode === "2v2";
    var go = function (order) {
      g = Game.create({ mode: hostCfg.mode, teams: teams }, order);
      sd = null; used = {}; busy = false; tab = "game"; say("");
      host.startGame();
      $("lobby").hidden = true; $("game").hidden = false;
      render();
      broadcastSnap({});
    };
    if (solo) return go(null);
    var d = two ? Game.drawOrder(teams) : Game.drawFirst(teams), ul = $("order-log");
    $("order-note").textContent = two ? "Everyone draws a number from 0 to 9. The team with the higher total goes first."
      : "Each player draws a number from 0 to 9. The higher number goes first.";
    ul.textContent = "";
    d.log.forEach(function (x) { ul.appendChild(h("li", "", x)); });
    $("order").hidden = false; $("order-go").focus();
    $("order-go").onclick = function () { $("order").hidden = true; go(d.order); };
  }

  function onGameStart() {
    // Game started, UI will handle rendering
  }

  function onGuestAction(seat, action) {
    // Called when a guest sends an action. The host must verify it's that seat's turn.
    if (g.over || busy || g.turn !== seat) return; // Ignore invalid actions
    handleGuestAction(seat, action);
  }

  function handleGuestAction(seat, action) {
    var p = g.players[seat];
    if (action.a === "spin") {
      spin();
    } else if (action.a === "arm") {
      Game.arm(g, action.p);
      broadcastSnap({});
    } else if (action.a === "ans") {
      // Answer handled in question overlay callback
    } else if (action.a === "next") {
      // Next button after question
      if ($("q-next").onclick) $("q-next").onclick();
    } else if (action.a === "resign") {
      doResign();
    } else if (action.a === "draw") {
      doDraw();
    } else if (action.a === "yes" || action.a === "no") {
      // Draw offer response
      if (g.offered) {
        var otherTeam = other(p.team);
        var responder = Game.rep(g, otherTeam);
        if (responder === seat) {
          if (action.a === "yes") Game.draw(g); else say("Draw declined.");
          render();
          broadcastSnap({});
        }
      }
    } else if (action.a === "ok") {
      // Egg continue
      if ($("egg-ok").onclick) $("egg-ok").onclick();
    }
  }

  function broadcastSnap(snapData) {
    if (host && host.session && host.session.phase === "game") {
      var msg = $("msg").textContent;
      var data = { g: g, sd: sd, msg: msg };
      if (snapData) for (var k in snapData) data[k] = snapData[k];
      host.broadcastSnap(data);
    }
  }

  function stopHosting() {
    if (host) {
      host.stop().then(function () {
        host = null; hosting = false; hostCfg = null;
        showSetup();
      });
    }
  }

  function onHostStop() {
    host = null; hosting = false; hostCfg = null;
    showSetup();
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

  /* ---------- drawing the game (uses View.paint) ---------- */
  function render() {
    var acts = function (pi) { return !busy && !g.over && !sd && g.turn === pi && !g.players[pi].out; };
    var shownTab = View.paint(g, Game, { tab: tab, sd: !!sd, acts: acts });
    tab = shownTab;
    $("spin").disabled = busy || g.over;
    $("new").hidden = !(g.over || g.mode === "solo");
    save();
  }

  /* ---------- dialogs (use Overlays) ---------- */
  // Overlays.ask, Overlays.egg are used directly

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
    var spinData = { index: i, name: res.name, id: res.id, points: res.points };
    setTimeout(function () { landed(res, spinData); }, rm ? 250 : 4100);
    broadcastSnap({ spin: spinData });
  }

  function landed(res, spinData) {
    if (sd) return sdLand(res);
    if (res.points !== undefined) return reveal(res);
    if (res.id === "egg") { say(who() + " hit the Easter egg!"); broadcastSnap({ egg: { shared: false } }); return Overlays.egg(false, function () { broadcastSnap({ egg: null }); finish(); }); }
    Game.grant(g, res.id);
    say(who() + " got " + res.name + (res.id === "free" ? ": +5 points." : ". Turn used."));
    finish();
  }

  function reveal(lv) {
    var p = g.players[g.turn], i = p.inv;
    if (!(i.x2 || i.x3 || i.shield)) return askQuestion(lv);
    // Build power-up data for guest
    var puData = { id: "pu", points: lv.points, time: lv.time, options: [] };
    Overlays.PU.forEach(function (b) {
      if (i[b[0]]) puData.options.push({ id: b[0], name: b[1], count: i[b[0]] });
    });
    broadcastSnap({ pu: puData });
    Overlays.powerUp(g, lv).then(function (chosen) {
      broadcastSnap({ pu: null });
      askQuestion(lv);
    });
  }

  function askQuestion(lv) {
    // Build question data for guest (host picks word and shuffles)
    var list = WORDS[lv.id], u = Overlays.used[lv.id] || (Overlays.used[lv.id] = []);
    var pool = list.filter(function (w) { return u.indexOf(w.word) < 0; });
    if (!pool.length) { u.length = 0; pool = list; }
    var w = pool[Math.floor(Math.random() * pool.length)]; u.push(w.word);
    var opts = Overlays.shuffle([w.meaning].concat(w.wrong).map(function (t, k) { return { t: t, ok: k === 0 }; }));
    var rightIndex = opts.findIndex(function (o) { return o.ok; });
    var qData = { id: "q", word: w.word, level: lv.name, points: lv.points, opts: opts.map(function (o) { return o.t; }), secs: lv.time, rightIndex: rightIndex };
    broadcastSnap({ q: qData });
    Overlays.question(g, lv).then(function (result) {
      var p = g.players[g.turn];
      say((result.k === null ? "Time is up. " : result.ok ? "Correct. " : "Wrong. ") + who() + " gets " + pl(result.pts, "point") + ".");
      render();
      broadcastSnap({ q: null });
      // Show continue button
      $("q-next").hidden = false; $("q-next").focus();
      $("q-next").onclick = function () { $("q").hidden = true; finish(); };
    });
  }

  function finish() { var r = Game.endTurn(g); busy = false; after(r); }
  function after(r) { if (r === "sudden") startSudden(); render(); broadcastSnap({}); }
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
      broadcastSnap({ egg: { shared: true } });
      Overlays.egg(true, function () { broadcastSnap({ egg: null }); g.over = true; g.winner = null; g.reason = "both teams share the win"; sd = null; render(); });
    };
    if (res.id === "egg") { broadcastSnap({ egg: { shared: false } }); Overlays.egg(false, function () { broadcastSnap({ egg: null }); go(); }); } else go();
  }

  /* ---------- resign and draw ---------- */
  function doResign() {
    var p = g.players[g.turn];
    Overlays.ask(p.name + ", resign the game?" + (g.mode === "2v2" ? " Your teammate can keep playing." : ""), ["Resign", "Cancel"]).then(function (k) {
      if (k !== 0) return;
      var r = Game.resign(g);
      if (!g.over) say(p.name + " resigned.");
      after(r);
    });
  }
  function doDraw() {
    var p = g.players[g.turn], o = g.teams[other(p.team)];
    g.offered = true; render(); broadcastSnap({});
    // Find target seat for draw offer (first player of other team)
    var targetSeat = Game.rep(g, other(p.team));
    broadcastSnap({ drawOffer: { targetSeat: targetSeat, fromName: p.name } });
    Overlays.ask(o.name + ", " + p.name + " offers a draw" + (g.mode === "2v2" ? " for everyone" : "") + ". Accept?", ["Accept draw", "Decline"]).then(function (k) {
      broadcastSnap({ drawOffer: null });
      if (k === 0) Game.draw(g); else say("Draw declined.");
      render(); broadcastSnap({});
    });
  }

  /* ---------- New game: returns to lobby if hosting, else setup ---------- */
  function newGame() {
    if (g.over) {
      if (hosting) {
        // Return to lobby with same guests
        host.session.setPhase("lobby");
        $("game").hidden = true; $("lobby").hidden = false;
        renderLobby(hostCfg.seats, "lobby");
      } else {
        showSetup();
      }
      return;
    }
    Overlays.ask("Leave this game and start a new one?", ["New game", "Keep playing"]).then(function (k) { if (k === 0) showSetup(); });
  }

  /* ---------- event wiring ---------- */
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
  $("new").onclick = newGame;
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });

  /* ---------- init ---------- */
  build();
  var skipped = restore();
  if (g) { $("setup").hidden = true; $("game").hidden = false; if (skipped) say("Your turn was skipped because you left the page."); render(); }
  else showSetup();
})();