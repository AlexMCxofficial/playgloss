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

  // Transport: POST to /m/<id>, long-poll GET /p/<id>?a=<n>
  var transport = (function () {
    var id = null, base = location.origin, ack = 0, polling = false, stopped = false;
    function post(path, body) {
      return fetch(base + path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: body }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); });
    }
    function startPoll() {
      if (polling || stopped || !id) return;
      polling = true;
      (function poll() {
        if (stopped || !id) { polling = false; return; }
        fetch(base + "/p/" + id + "?a=" + ack, { headers: { "Accept": "text/plain" } })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
          .then(function (text) {
            if (stopped) return;
            if (text) {
              text.trim().split("\n").forEach(function (line) { onMessage(line); });
              ack += text.trim().split("\n").length;
            }
            setTimeout(poll, 50);
          })
          .catch(function () { setTimeout(poll, 1000); });
      })();
    }
    return {
      connect: function (helloText) {
        return post("/m/", helloText).then(function (r) { return r.text(); }).then(function (text) {
          var o = JSON.parse(text);
          if (o.id) { id = o.id; startPoll(); }
          return o;
        });
      },
      send: function (text) { if (id) post("/m/" + id, text); },
      close: function () { stopped = true; if (id) post("/close/" + id, ""); }
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
    ui: {
      onEvent: function (e) { handleEvent(e); }
    }
  });

  var mySeat = -1, myToken = null, myName = "", phase = "lobby", g = null, sd = false, tab = "game";
  var pendingQuestion = false, pendingPowerUp = false, pendingDrawOffer = false;
  var away = false;

  function show(id) {
    ["join", "lobby", "game"].forEach(function (x) { $(x).hidden = x !== id; });
  }

  function handleEvent(e) {
    if (e.t === "approved") {
      $("join-status").textContent = "Approved! Waiting for seat...";
    } else if (e.t === "refused") {
      show("join");
      $("name-box").hidden = false;
      $("join-go").hidden = false;
      $("join-status").textContent = "Refused: " + (e.why || "No reason given");
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
      renderLobby(e.seats, e.you);
      if (phase === "game") { show("game"); startGame(e); }
      else { show("lobby"); }
    } else if (e.t === "snap") {
      g = Session.cleanSnap(e.g, Filter);
      sd = !!e.sd;
      if (g) renderGame(g, e.msg, e.spin, e.pu, e.q, e.egg, e.drawOffer);
    } else if (e.t === "kick") {
      show("join");
      $("name-box").hidden = false;
      $("join-go").hidden = false;
      $("join-status").textContent = "Removed: " + (e.why || "No reason given");
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
    var box = $("lobby-seats");
    box.textContent = "";
    seats.forEach(function (s, i) {
      var p = h("div", "panel"), taken = s.guest && s.taken;
      p.appendChild(h("h3", "", "Seat " + (i + 1) + (s.open ? " (open)" : "")));
      p.appendChild(h("p", "", "Name: " + s.name));
      if (s.open && !taken) {
        var b = h("button", "small", you === i ? "This is you" : "Take this seat");
        b.type = "button";
        b.disabled = you !== i ? false : true;
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
    } else {
      $("lobby-status").textContent = away ? "Reconnected. Waiting for host to start..." : "Waiting for host to start...";
    }
  }

  // Game rendering (uses View.paint)
  function startGame(e) {
    if (e.g) {
      g = Session.cleanSnap(e.g, Filter);
      sd = !!e.sd;
      if (g) renderGame(g, e.msg, e.spin, e.pu, e.q, e.egg, e.drawOffer);
    }
  }

  function renderGame(g, msg, spin, pu, q, egg, drawOffer) {
    View.paint(g, Game, { tab: tab, sd: sd, acts: function (pi) { return pi === mySeat; } });
    if (msg) $("msg").textContent = msg;

    // Animate wheel if spin data
    if (spin && spin.index !== undefined) animateWheel(spin.index);

    // Power-up overlay
    if (pu && mySeat === g.turn) {
      showPowerUp(pu);
    } else {
      $("pu").hidden = true;
    }

    // Question overlay
    if (q && mySeat === g.turn) {
      showQuestion(q);
    } else {
      $("q").hidden = true;
    }

    // Egg overlay
    if (egg) {
      showEgg(egg.shared);
    } else {
      $("egg").hidden = true;
    }

    // Draw offer overlay (for the target seat)
    if (drawOffer && drawOffer.targetSeat === mySeat) {
      showDrawOffer(drawOffer);
    }

    // Enable/disable spin button
    $("spin").disabled = mySeat !== g.turn || g.over || pendingQuestion || pendingPowerUp;
    $("spin").onclick = function () { if (mySeat === g.turn && !g.over && !pendingQuestion && !pendingPowerUp) guest.sendAction("spin"); };
  }

  function animateWheel(index) {
    var SL = Wheel.slices, n = SL.length, a = 360 / n;
    var want = ((-(index + .5) * a) % 360 + 360) % 360;
    var w = $("wheel");
    w.style.transition = "transform 4s cubic-bezier(.15,.7,.1,1)";
    w.style.transform = "rotate(" + want + "deg)";
  }

  // Power-up overlay (host sends {id: "pu", options: [{id, name, count}], points, time})
  function showPowerUp(pu) {
    pendingPowerUp = true;
    var p = g.players[g.turn];
    $("pu-title").textContent = p.name + ": Power-up";
    $("pu-info").textContent = pl(pu.points, "point") + ", " + pu.time + " seconds. Choose a power-up:";
    var box = $("pu-btns");
    box.textContent = "";
    pu.options.forEach(function (opt) {
      var e = h("button", "small", opt.name + " (" + opt.count + ")");
      e.onclick = function () { guest.sendAction("arm", { p: opt.id }); };
      box.appendChild(e);
    });
    $("pu").hidden = false; $("pu-go").focus();
    $("pu-go").onclick = function () { $("pu").hidden = true; pendingPowerUp = false; };
  }

  // Question overlay (host sends {id: "q", word, level, opts: [texts], secs, rightIndex})
  function showQuestion(q) {
    pendingQuestion = true;
    $("q-level").textContent = q.level + ", " + pl(q.points, "point");
    $("q-word").textContent = q.word;
    var box = $("q-opts"); box.textContent = "";
    q.opts.forEach(function (opt, k) {
      var b = h("button", "opt", opt);
      b.onclick = function () { answerQuestion(k); };
      box.appendChild(b);
    });
    $("q-next").hidden = true; $("q").hidden = false;
    var end = Date.now() + q.secs * 1000;
    var tm = setInterval(function () {
      var left = Math.max(0, end - Date.now());
      $("bar").style.width = (left / (q.secs * 1000) * 100) + "%";
      $("secs").textContent = Math.ceil(left / 1000) + "s";
      if (!left) answerQuestion(null);
    }, 100);
    function answerQuestion(k) {
      if (!pendingQuestion) return;
      pendingQuestion = false;
      clearInterval(tm);
      var kids = box.children;
      for (var j = 0; j < kids.length; j++) { kids[j].disabled = true; }
      guest.sendAction("ans", { i: k === null ? -1 : k });
    }
  }

  // Egg overlay
  function showEgg(shared) {
    try {
      var one = Math.round(Wheel.total / Wheel.slices[Wheel.slices.length - 1].weight / 50) * 50;
      $("egg-odds").textContent = one.toLocaleString("en-US");
    } catch (e) {
      $("egg-odds").textContent = "1 in 50";
    }
    $("egg-extra").textContent = shared ? "Both teams hit it, so both teams win." : "";
    $("egg").hidden = false; $("egg-ok").focus();
    $("egg-ok").onclick = function () { $("egg").hidden = true; guest.sendAction("ok"); };
  }

  // Draw offer overlay
  function showDrawOffer(offer) {
    pendingDrawOffer = true;
    var d = $("dlg"), box = $("dlg-btns");
    $("dlg-text").textContent = offer.fromName + " offers a draw. Accept?";
    box.textContent = "";
    ["Accept draw", "Decline"].forEach(function (btn, k) {
      var e = h("button", "small", btn);
      e.onclick = function () { d.close(); pendingDrawOffer = false; guest.sendAction(k === 0 ? "yes" : "no"); };
      box.appendChild(e);
    });
    d.showModal();
  }

  var fmt = function (n) { return n % 1 ? n.toFixed(1) : String(n); };
  var pl = function (n, w) { return fmt(n) + " " + w + (n === 1 ? "" : "s"); };

  // Tab switching
  $("mtabs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-tab]");
    if (b) { tab = b.dataset.tab; if (g) View.paint(g, Game, { tab: tab, sd: sd, acts: function (pi) { return pi === mySeat; } }); }
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