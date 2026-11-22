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
  var online = false, oTab = "join", stopScan = null; // the fourth option, "Online": which view is open
  var host = null, hosting = false, stopping = false, hostCfg = null, qrModule = null;
  // What the host is waiting for right now (a guest's answer, a power-up choice, an Easter egg click or a draw reply),
  // and what guests are shown. Both are cleared by resetFlow() whenever a game starts or ends.
  var S = { pu:null, q:null, egg:null, drawOffer:null }, pend = null, drawP = null, offering = false, spinN = 0, qN = 0, timers = [];

  // Global error handler so JS errors show visibly instead of silently breaking buttons
  window.onerror = function (msg, url, line) {
    // Only report errors from this page's own scripts. Browser extensions (crypto wallets, ad blockers, Brave's
    // shields) inject code that fails on its own, and browsers report those with no file, or as "Script error."
    // at line 0. They are not ours and must not alarm the player.
    var own = typeof url === "string" && url && (url.indexOf(location.origin) === 0 || /\/js\/[\w\/.-]+\.js/.test(url)) && !/^(chrome|moz|safari|brave)-extension:/.test(url);
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
    drawSetup(); save();
  }

  function drawSetup() {
    if (stopScan) stopScan();
    if (online && oTab === "host" && cfg.mode === "solo") cfg.mode = "1v1"; // a hosted game needs two sides
    var box = $("setup-body"), solo = cfg.mode === "solo", modes = h("div", "row"), panels = h("div", "panels");
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
    $("start").parentNode.hidden = online; // "Start game" is for games on this device
    if (online) return drawOnline(box);
    for (var ti = 0; ti < (solo ? 1 : 2); ti++) panels.appendChild(panel(ti));
    box.appendChild(panels);
  }

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
    MODES.slice(1).forEach(function (m) {
      var b = h("button", "small", m[1]); b.type = "button";
      b.setAttribute("aria-pressed", cfg.mode === m[0]);
      b.onclick = function () { cfg.mode = m[0]; drawSetup(); save(); };
      sides.appendChild(b);
    });
    box.appendChild(sides);
    for (var ti = 0; ti < 2; ti++) panels.appendChild(panel(ti));
    box.appendChild(panels);
    var hostBtn = h("button", "spin", "Host a game"); hostBtn.type = "button";
    hostBtn.onclick = startHosting;
    box.appendChild(h("div", "row")).appendChild(hostBtn);
    box.appendChild(h("p", "note", "Players on the same Wi-Fi join with your link or QR code. You approve every guest. Nothing goes over the internet."));
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
      resetFlow();
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
    if (stopping) { alert("Still stopping, please wait..."); return; }
    // Build seat config from current setup
    // Solo and 1v1 seats are named after the side (one player per side); only 2v2 uses the individual player names.
    var seats = [];
    if (cfg.mode === "solo") seats.push({ name: cfg.teams[0].name, open: false });
    else if (cfg.mode === "1v1") cfg.teams.forEach(function (t) { seats.push({ name: t.name, open: false }); });
    else cfg.teams.forEach(function (t) { t.players.forEach(function (n) { seats.push({ name: n, open: false }); }); });
    // For 1v1 and 2v2, mark seats as "open for guest" if user wants (we'll add UI for this in lobby)
    hostCfg = { seats: seats, mode: cfg.mode, teams: cfg.teams };

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
  function drawQR(link) {
    var canvas = $("qr-canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!qrModule) { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.hidden = true; return; }
    try {
      var qr = qrModule.generate(link, { minCorrectionLevel: qrModule.correction.M });
      var quiet = 4, mods = qr.size + quiet * 2, scale = Math.max(4, Math.floor(512 / mods)), px = mods * scale;
      canvas.width = px; canvas.height = px;
      canvas.style.width = "256px"; canvas.style.height = "256px";
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

  function showLobby(info) {
    $("setup").hidden = true; $("game").hidden = true; $("lobby").hidden = false;
    $("online-indicator").hidden = false;
    renderLobby(host.session.seats, "lobby");
    if (info.ips.length) drawQR(host.linkFor(info.ips[0]));
    $("host-link").textContent = info.ips.length ? host.linkFor(info.ips[0]) : "Waiting for IP...";
    $("stop-host").onclick = function () { try { stopHosting(); } catch (e) { console.error("stopHosting error:", e); } };
  }

  function renderLobby(seats, phase) {
    if (!host || !host.session || !hostCfg) return;
    var box = $("lobby-seats"), sess = host.session;
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
      if (hostCfg.mode === "2v2") {
        return { name: t.name, fmt: t.fmt, color: t.color,
          players: [nameOf(ti * 2, t.players[0]), nameOf(ti * 2 + 1, t.players[1])], pfmt: t.pfmt.slice() };
      }
      var nm = nameOf(ti, t.name); // solo / 1v1: one player per side, named after the side
      return { name: nm, fmt: t.fmt, color: t.color, players: [nm], pfmt: [t.fmt] };
    });
    if (hostCfg.mode === "solo") teams = teams.slice(0, 1);
    // Determine turn order (draw)
    var solo = hostCfg.mode === "solo", two = hostCfg.mode === "2v2";
    var go = function (order) {
      resetFlow();
      g = Game.create({ mode: hostCfg.mode, teams: teams }, order);
      sd = null; used = {}; busy = false; tab = "game"; say("");
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
    var res = Wheel.pick(), i = SL.indexOf(res), a = 360 / SL.length;
    var want = ((-(i + .5) * a) % 360 + 360) % 360, cur = ((rot % 360) + 360) % 360;
    rot += ((want - cur + 360) % 360) + 1800;
    var rm = matchMedia("(prefers-reduced-motion: reduce)").matches, w = $("wheel");
    w.style.transition = rm ? "transform .2s" : "transform 4s cubic-bezier(.15,.7,.1,1)";
    w.style.transform = "rotate(" + rot + "deg)";
    broadcastSnap({ spin: { n: ++spinN, index: i } });
    later(function () { landed(res); }, rm ? 250 : 4100);
  }

  function landed(res) {
    if (sd) return sdLand(res);
    if (res.points !== undefined) return reveal(res);
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
    var seat = g.turn, p = g.players[seat], pre = Overlays.pick(lv);
    var announce = function (ok, k, pts) { say((k === null ? "Time is up. " : ok ? "Correct. " : "Wrong. ") + p.name + " gets " + pl(pts, "point") + "."); };
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
      eggFlow(true, function () { g.over = true; g.winner = null; g.reason = "both teams share the win"; sd = null; render(); });
    };
    if (res.id === "egg") eggFlow(false, go); else go();
  }

  /* ---------- resign and draw ---------- */
  // skipAsk: a guest already confirmed on their own screen.
  function doResign(skipAsk) {
    var p = g.players[g.turn];
    var go = function () {
      var r = Game.resign(g);
      if (!g.over) say(p.name + " resigned.");
      after(r);
    };
    if (skipAsk) return go();
    Overlays.ask(p.name + ", resign the game?" + (g.mode === "2v2" ? " Your teammate can keep playing." : ""), ["Resign", "Cancel"]).then(function (k) { if (k === 0) go(); });
  }
  // The offer goes to the other side only: a dialog on this screen if the host plays that player, otherwise on the
  // guest's own screen. Nothing else can be pressed while it is open.
  function doDraw() {
    var p = g.players[g.turn], o = g.teams[other(p.team)], target = Game.rep(g, other(p.team)), done = false, t = null;
    var reply = function (accept) {
      if (done) return; done = true; clearTimeout(t);
      drawP = null; S.drawOffer = null; offering = false;
      if (accept) Game.draw(g); else say("Draw declined.");
      render();
    };
    g.offered = true; offering = true;
    S.drawOffer = { targetSeat: target, fromName: p.name };
    say(p.name + " offers a draw" + (g.mode === "2v2" ? " for everyone" : "") + ".");
    render();
    if (remote(target)) {
      drawP = { seat: target, resolve: reply };
      t = later(function () { reply(false); }, 60000);
    } else {
      Overlays.ask(o.name + ", " + p.name + " offers a draw" + (g.mode === "2v2" ? " for everyone" : "") + ". Accept?", ["Accept draw", "Decline"]).then(function (k) { reply(k === 0); });
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
        $("game").hidden = true; $("lobby").hidden = false;
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
