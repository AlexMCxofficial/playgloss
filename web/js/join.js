// Join page logic: transport, guest session, and UI. MIT License (see LICENSE).
(function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  var h = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  // Read the lobby key from the URL hash
  var hash = location.hash.slice(1);
  if (!hash) { $("join-status").textContent = "Invalid link: missing game code."; $("join").hidden = false; return; }
  var K;
  try { K = Proto.b64d(hash); } catch (e) { $("join-status").textContent = "Invalid game code."; $("join").hidden = false; return; }
  if (!K || K.length !== 32) { $("join-status").textContent = "Invalid game code."; $("join").hidden = false; return; }

  // Opened inside the PlayGloss app (join.html?h=<address>#<code>): the app's own small client talks to the host
  // (src-tauri/src/guest.rs). Opened from the host's link in any browser: the page talks to its own address.
  var H = null, invoke = null;
  try {
    var q = new URLSearchParams(location.search).get("h");
    if (q !== null) {
      if (!window.__TAURI__ || !window.__TAURI__.core || !Link.hostOk(q)) { $("join-status").textContent = "Invalid link."; $("join").hidden = false; return; }
      H = q; invoke = window.__TAURI__.core.invoke;
    }
  } catch (e) {}

  // Transport (matches src-tauri/src/lan.rs):
  //   POST /m/<guestId>        one message, answer 204
  //   GET  /p/<guestId>?a=<n>  long poll, answer {"n":<highest number>,"m":["...", ...]}
  var transport = (function () {
    var connId = null, base = location.origin, ack = 0, polling = false, stopped = false, chain = Promise.resolve();
    function post(path, body) {
      if (H) return invoke("guest_post", { host: H, id: path.slice(3), data: body }).catch(function (e) { throw new Error(String(e)); });
      return fetch(base + path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: body, cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r; });
    }
    // Messages carry an increasing counter and the host drops anything out of order, so send them one at a time.
    function enqueue(path, body) {
      var p = chain.then(function () { return post(path, body); });
      chain = p.catch(function () {});
      return p;
    }
    function lost(why) {
      stopped = true; polling = false;
      handleEvent({ t:"lost", why:why });
    }
    // One "wait for messages" call, answered the same way in the browser and in the app: { ok, status, json }.
    function pollOnce() {
      if (H) {
        return invoke("guest_poll", { host: H, id: connId, ack: ack }).then(function (text) { return { ok: true, status: 200, json: JSON.parse(text) }; }, function (e) {
          var m = /^HTTP (\d+)$/.exec(String(e));
          return { ok: false, status: m ? Number(m[1]) : 0 };
        });
      }
      return fetch(base + "/p/" + connId + "?a=" + ack, { cache: "no-store" }).then(function (r) {
        return r.ok ? r.json().then(function (j) { return { ok: true, status: 200, json: j }; }) : { ok: false, status: r.status };
      });
    }
    function startPoll() {
      if (polling || stopped || !connId) return;
      polling = true;
      (function poll() {
        if (stopped || !connId) { polling = false; return; }
        pollOnce()
          .then(function (r) {
            if (r.status === 403) throw { fatal:"The host closed this connection." };
            if (r.status === 404) throw { fatal:"The host stopped the game." };
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json;
          })
          .then(function (res) {
            if (stopped) return;
            if (res && Array.isArray(res.m)) {
              res.m.forEach(function (text) { if (typeof text === "string") guest.receive(text); });
              if (typeof res.n === "number" && res.n > ack) ack = res.n;
            }
            setTimeout(poll, 30);
          })
          .catch(function (err) {
            if (err && err.fatal) return lost(err.fatal);
            setTimeout(poll, 1000); // network hiccup or the phone woke up: try again
          });
      })();
    }
    return {
      // helloText is the sealed hello message; guestId is the 32-char hex id from Proto.guestHello
      connect: function (helloText, guestId) {
        connId = guestId; ack = 0; stopped = false;
        return enqueue("/m/" + guestId, helloText).then(function () { handleEvent({ t:"sent" }); startPoll(); }, function (err) {
          handleEvent({ t:"connfail", why:String(err && err.message || err) });
        });
      },
      send: function (text) { if (connId && !stopped) enqueue("/m/" + connId, text).catch(function () {}); },
      close: function () { stopped = true; }
    };
  })();

  // Resume token from sessionStorage
  var resumeToken = null;
  try { resumeToken = sessionStorage.getItem("pg-resume-" + hash); } catch (e) {}

  var guest = new Guest({
    Proto: Proto,
    Filter: Filter,
    K: K,
    transport: transport,
    sendConnect: function (text, id) {
      transport.connect(text, id);
    },
    ui: {
      onEvent: function (e) { handleEvent(e); }
    }
  });

  var mySeat = -1, myToken = null, myName = "", phase = "lobby", g = null, sd = false, tab = "game";
  var busy = false, qNow = -1, qDone = false, qTimer = null, spinN = 0, rot = 0, dlgKind = null;
  var away = false, rules = { extreme:false, inf:false }; // rules: the mode the host chose, from the lobby message

  function show(id) {
    ["join", "lobby", "game"].forEach(function (x) { $(x).hidden = x !== id; });
    $("mtabs").hidden = id !== "game"; // the phone tabs belong to a running game only
  }

  function backToJoin(text) {
    show("join");
    $("name-box").hidden = false;
    $("join-go").hidden = false;
    $("join-go").disabled = false;
    $("join-status").textContent = text;
  }

  function handleEvent(e) {
    if (e.t === "sent") {
      $("join-status").textContent = "Waiting for the host to let you in...";
    } else if (e.t === "connfail") {
      backToJoin("Could not reach the host (" + e.why + "). Check that you are on the same Wi-Fi and try again. If that Wi-Fi shows a login page (school, hotel, cafe), sign in there first.");
    } else if (e.t === "lost") {
      mySeat = -1; myToken = null; clearGame();
      backToJoin(e.why + " You can try to join again.");
    } else if (e.t === "approved") {
      $("join-status").textContent = "You are in! Waiting for a seat...";
      show("lobby");
      $("lobby-status").textContent = "Waiting for the host to open a seat...";
    } else if (e.t === "refused") {
      backToJoin("Refused: " + (e.why || "No reason given"));
    } else if (e.t === "seated") {
      mySeat = e.seat;
      myToken = e.token;
      if (myToken) {
        try { sessionStorage.setItem("pg-resume-" + hash, myToken); } catch (x) {}
      }
      away = false;
      $("lobby-status").textContent = "Seated at seat " + (mySeat + 1);
      show("lobby");
    } else if (e.t === "lobby") {
      phase = e.phase;
      if (typeof e.you === "number") mySeat = e.you;
      rules = Session.cleanRules(e.rules);
      renderLobby(e.seats, e.you);
      if (phase === "game") show("game");
      else { clearGame(); show("lobby"); }
    } else if (e.t === "snap") {
      var ng = Session.cleanSnap(e.g, Filter);
      if (ng) { g = ng; sd = !!e.sd; show("game"); renderGame(Session.cleanExtras(e)); }
    } else if (e.t === "kick") {
      transport.close(); clearGame();
      backToJoin("Removed: " + (e.why || "No reason given"));
      mySeat = -1; myToken = null; away = false;
      try { sessionStorage.removeItem("pg-resume-" + hash); } catch (x) {}
    } else if (e.t === "err") {
      $("lobby-status").textContent = e.why;
    }
  }

  // Join with name
  $("join-go").onclick = function () {
    var name = $("join-name").value;
    if (!name.trim()) return;
    myName = name;
    $("join-go").disabled = true;
    $("join-status").textContent = "Connecting...";
    guest.join(name, resumeToken);
  };

  // Lobby rendering
  function renderLobby(seats, you) {
    var box = $("lobby-seats"), ml = $("lobby-mode");
    box.textContent = "";
    ml.textContent = "Mode: " + (rules.extreme ? "Extreme" : "Default") + (rules.inf ? ", Infinite (3 hearts, no 100 points goal)" : "");
    ml.hidden = !rules.extreme && !rules.inf;
    seats.forEach(function (s, i) {
      var p = h("div", "panel"), taken = !!s.taken && you !== i; // the host sends name, open, taken and mine
      p.appendChild(h("h3", "", "Seat " + (i + 1) + (s.open ? " (open)" : "")));
      p.appendChild(h("p", "", "Name: " + s.name));
      if (s.open && !taken) {
        var b = h("button", "small act", you === i ? "This is you" : "Take this seat");
        b.type = "button";
        b.disabled = you !== -1;
        if (you === -1) {
          b.onclick = function () { guest.takeSeat(i, myName); };
        }
        p.appendChild(b);
      } else if (taken) {
        var note = you === i ? "You are here" : "Taken";
        if (s.away && you === i) note = "You (reconnecting...)";
        p.appendChild(h("p", "note", note));
      }
      box.appendChild(p);
    });
    $("lobby-leave").hidden = you === -1;
    $("lobby-leave").onclick = function () { guest.session.say({ t: "bye" }); };
    if (phase === "game") {
      $("lobby-status").textContent = "Game in progress...";
    } else if (you === -1) {
      var free = seats.some(function (s) { return s.open && !s.taken; });
      $("lobby-status").textContent = free ? "Pick a seat to play." : "Waiting for the host to open a seat...";
    } else {
      $("lobby-status").textContent = away ? "Reconnected. Waiting for host to start..." : "Waiting for host to start...";
    }
  }

  // Game rendering. The host sends the whole picture with every message, so drawing is always from scratch and
  // sending the same message twice does no harm. The host decides everything; this page only shows what it is
  // told and asks for things. Only the player whose turn it is gets the power-up choice and the question.
  function acts(pi) { return !!g && pi === mySeat && g.turn === pi && !busy && !sd && !g.over && !g.players[pi].out; }
  function paint() { View.paint(g, Game, { tab: tab, sd: sd, acts: acts }); }
  function canSpin() { return !!g && mySeat >= 0 && g.turn === mySeat && !busy && !g.over && !g.players[mySeat].out; }

  function renderGame(x) {
    busy = x.busy;
    paint();
    $("msg").textContent = x.msg;
    if (x.spin && x.spin.n > spinN) { spinN = x.spin.n; animateWheel(x.spin.index); }
    var mine = mySeat >= 0 && g.turn === mySeat && !g.over;
    if (x.pu && mine) showPowerUp(x.pu); else $("pu").hidden = true;
    if (x.q && mine) showQuestion(x.q); else hideQuestion();
    if (x.egg) showEgg(x.egg.shared, mine); else $("egg").hidden = true;
    if (x.drawOffer && x.drawOffer.targetSeat === mySeat && mySeat >= 0 && !g.over) showDrawOffer(x.drawOffer); else if (dlgKind === "draw") closeDlg();
    if (dlgKind === "resign" && !acts(mySeat)) closeDlg();
    $("spin").disabled = !canSpin();
  }
  $("spin").onclick = function () { if (canSpin()) { $("spin").disabled = true; guest.sendAction("spin"); } };

  // Leaving the game screen (the host went back to the lobby): nothing may stay open.
  function clearGame() {
    $("pu").hidden = true; $("egg").hidden = true; hideQuestion(); closeDlg(); busy = false; g = null;
  }

  // Draw the wheel once (same drawing as the host page)
  (function buildWheel() {
    var SL = Wheel.slices, n = SL.length, a = 360 / n, R = 96;
    var pt = function (d, r) { var t = (d - 90) * Math.PI / 180; return [100 + r * Math.cos(t), 100 + r * Math.sin(t)].map(function (v) { return v.toFixed(2); }); };
    var s = '<svg viewBox="0 0 200 200" aria-hidden="true">';
    SL.forEach(function (c, i) {
      var p1 = pt(i * a, R), p2 = pt((i + 1) * a, R), m = (i + .5) * a, t = pt(m, 58);
      s += '<path d="M100 100L' + p1[0] + " " + p1[1] + "A" + R + " " + R + " 0 0 1 " + p2[0] + " " + p2[1] + 'Z" fill="' + c.color + '" stroke="var(--fg)" stroke-width=".6"/>' +
        '<text x="' + t[0] + '" y="' + t[1] + '" transform="rotate(' + (m > 180 ? m + 90 : m - 90) + " " + t[0] + " " + t[1] + ')" text-anchor="middle" dominant-baseline="central" font-size="6.5" fill="' + c.ink + '">' + c.label + "</text>";
    });
    $("wheel").innerHTML = s + "</svg>";
  })();

  // Same turning as the host's wheel: it keeps turning forward from where it stopped.
  function animateWheel(index) {
    var a = 360 / Wheel.slices.length, want = ((-(index + .5) * a) % 360 + 360) % 360, cur = ((rot % 360) + 360) % 360, w = $("wheel");
    var rm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    rot += ((want - cur + 360) % 360) + 1800;
    w.style.transition = rm ? "transform .2s" : "transform 4s cubic-bezier(.15,.7,.1,1)";
    w.style.transform = "rotate(" + rot + "deg)";
  }

  // One dialog (#dlg) is shared by the draw offer and the resign question. dlgKind says which one is open.
  function openDlg(kind, text, btns, cb) {
    var d = $("dlg"), box = $("dlg-btns");
    $("dlg-text").textContent = text; box.textContent = "";
    d.oncancel = function (e) { e.preventDefault(); };
    btns.forEach(function (label, k) {
      var b = h("button", "small", label); b.type = "button";
      b.onclick = function () { closeDlg(); cb(k); };
      box.appendChild(b);
    });
    dlgKind = kind;
    if (!d.open) d.showModal();
  }
  function closeDlg() { var d = $("dlg"); dlgKind = null; if (d.open) d.close(); }

  // Power-up choice: pick 2x, 3x or Shield (pick again to take it back), then ask for the word.
  function showPowerUp(pu) {
    var p = g.players[mySeat], box = $("pu-btns"), first = $("pu").hidden;
    $("pu-title").textContent = p.name + ": " + pu.level;
    $("pu-info").textContent = pl(pu.points, "point") + ", " + pu.time + " seconds. Use a power-up before you see the word?";
    box.textContent = "";
    pu.options.forEach(function (o) {
      var b = h("button", "small", o.name + " (" + o.count + ")"); b.type = "button";
      b.setAttribute("aria-pressed", p.armed === o.id);
      b.onclick = function () { guest.sendAction("arm", { p: o.id }); };
      box.appendChild(b);
    });
    if (first) $("pu-go").disabled = false;
    $("pu-go").onclick = function () { $("pu-go").disabled = true; guest.sendAction("go"); };
    $("pu").hidden = false; if (first) $("pu-go").focus();
  }

  // Question: shown again with the result once the host has judged the answer. The right answer is only in
  // that second message.
  function showQuestion(q) {
    var box = $("q-opts"), first = $("q").hidden;
    if (qNow !== q.n) {
      hideQuestion(); qNow = q.n; qDone = false;
      $("q-level").textContent = q.level + ", " + pl(q.points, "point") + (q.boost ? ", " + (q.boost === "shield" ? "Shield" : q.boost.replace("x", "") + "x") + " active" : "");
      $("q-word").textContent = q.word;
      box.textContent = "";
      q.opts.forEach(function (t, k) {
        var b = h("button", "opt", t); b.type = "button";
        b.onclick = function () { answerQuestion(k); };
        box.appendChild(b);
      });
      $("q-next").hidden = true; $("q-next").disabled = false;
      var end = Date.now() + q.secs * 1000;
      qTimer = setInterval(function () {
        var left = Math.max(0, end - Date.now());
        $("bar").style.width = (left / (q.secs * 1000) * 100) + "%";
        $("secs").textContent = Math.ceil(left / 1000) + "s";
        if (!left) answerQuestion(null);
      }, 100);
      first = true;
    }
    if (q.res) {
      var r = q.res, kids = box.children;
      qDone = true; clearInterval(qTimer); qTimer = null;
      for (var j = 0; j < kids.length; j++) { kids[j].disabled = true; if (j === r.right) kids[j].classList.add("right"); else if (j === r.k) kids[j].classList.add("wrong"); }
      $("q-level").textContent = (r.k < 0 ? "Time is up. " : r.ok ? "Correct. " : "Wrong. ") + pl(r.pts, "point") + ".";
      $("q-next").hidden = false;
      $("q-next").onclick = function () { $("q-next").disabled = true; guest.sendAction("next"); };
      if ($("q-next").disabled === false && first !== false) $("q-next").focus();
    }
    $("q").hidden = false;
  }
  function answerQuestion(k) {
    if (qDone) return;
    qDone = true; clearInterval(qTimer); qTimer = null;
    var kids = $("q-opts").children;
    for (var j = 0; j < kids.length; j++) { kids[j].disabled = true; if (j === k) kids[j].setAttribute("aria-pressed", "true"); }
    guest.sendAction("ans", { i: k === null ? -1 : k });
  }
  function hideQuestion() { clearInterval(qTimer); qTimer = null; qNow = -1; $("q").hidden = true; }

  // Easter egg: everybody sees it, only the player whose turn it is gets the Continue button.
  function showEgg(shared, mine) {
    var first = $("egg").hidden;
    try {
      var one = Math.round(Wheel.total / Wheel.slices[Wheel.slices.length - 1].weight / 50) * 50;
      $("egg-odds").textContent = one.toLocaleString("en-US");
    } catch (e) {
      $("egg-odds").textContent = "1 in 50";
    }
    $("egg-extra").textContent = shared ? "Both teams hit it, so both teams win." : "";
    $("egg-ok").hidden = !mine;
    if (first) $("egg-ok").disabled = false;
    $("egg-ok").onclick = function () { $("egg-ok").disabled = true; guest.sendAction("ok"); };
    $("egg").hidden = false; if (first && mine) $("egg-ok").focus();
  }

  // A draw offer for this player (the host only sends it to the player it is meant for).
  function showDrawOffer(offer) {
    if (dlgKind === "draw") return;
    openDlg("draw", offer.fromName + " offers a draw. Accept?", ["Accept draw", "Decline"], function (k) { guest.sendAction(k === 0 ? "yes" : "no"); });
  }

  // Offer draw and Resign on this player's own card (View draws them; they are only enabled on this player's turn).
  $("game").addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("button[data-act]");
    if (!b || b.disabled || !g || +b.dataset.p !== mySeat || !acts(mySeat)) return;
    if (b.dataset.act === "draw") { b.disabled = true; guest.sendAction("draw"); }
    else openDlg("resign", "Resign the game?" + (g.mode === "2v2" ? " Your teammate can keep playing." : ""), ["Resign", "Cancel"], function (k) { if (k === 0) guest.sendAction("resign"); });
  });

  var fmt = function (n) { return n % 1 ? n.toFixed(1) : String(n); };
  var pl = function (n, w) { return fmt(n) + " " + w + (n === 1 ? "" : "s"); };

  // Tab switching
  $("mtabs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-tab]");
    if (b) { tab = b.dataset.tab; if (g) paint(); }
  });

  // Reconnection handling: resume token when page regains focus
  window.addEventListener("focus", function () {
    if (mySeat >= 0 && myToken) {
      guest.session.say({ t: "take", seat: mySeat, name: myName, resume: myToken });
    }
  });

  // Detect when tab becomes hidden (phone sleeps, app switches away)
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      away = true;
      if (mySeat >= 0) {
        $("lobby-status").textContent = "You went away - seat reserved. Reconnect when you return.";
      }
    }
  });

  // Initial state
  try {
    show("join");
    $("name-box").hidden = false;
    $("join-go").hidden = false;
    $("join-status").textContent = "Enter your name to join";
    $("join-name").focus();
  } catch (e) {
    console.error("Join page init error:", e);
    $("join-status").textContent = "Error loading join page. Please refresh.";
  }

  // Cleanup on leave
  window.addEventListener("pagehide", function () { transport.close(); });
})();
