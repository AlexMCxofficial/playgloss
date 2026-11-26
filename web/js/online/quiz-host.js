// Desktop spectator host page and native relay lifecycle. MIT License (see LICENSE).
(function () {
  "use strict";

  var get = function (id) { return document.getElementById(id); };
  var el = QuizView.el, button = QuizView.button, status = get("quiz-status"), body = get("quiz-body");
  var back = get("quiz-back"), confirm = get("quiz-confirm"), title = get("quiz-title");
  var room, listener, refreshTimer, clockStop, relay, opening = false, stopping = false;
  var queues = new Map(), closing = new Set(), qrModule, joinUrl;
  var wheel, wheelBox, shownSpin = 0, rotation = 0;
  var lobby, lobbyList, lobbyButton, lobbyStatus, game, gameStatus, questionTarget, actions;
  var lastPhase, lastRound;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function invoke(cmd, args) { return window.__TAURI__.core.invoke(cmd, args); }

  function send(id, data) {
    var next = (queues.get(id) || Promise.resolve())
      .then(function () { return invoke("lan_send", { id: id, data: data }); })
      .catch(function () {});
    queues.set(id, next);
    next.then(function () { if (queues.get(id) === next) queues.delete(id); });
  }

  function drop(id) {
    if (closing.has(id)) return;
    closing.add(id);
    setTimeout(function () {
      closing.delete(id);
      if (!stopping) invoke("lan_close", { id: id }).catch(function () {});
    }, 2500);
  }

  function ask(text, action, run) {
    if (confirm.open) return;
    confirm.returnValue = "";
    get("quiz-confirm-text").textContent = text;
    get("quiz-confirm-go").textContent = action;
    confirm.onclose = function () { if (confirm.returnValue === "yes") run(); };
    confirm.showModal();
  }

  function qrFor(url) {
    var canvas = el("canvas", "quiz-qr"), code = qrModule.generate(url, { minCorrectionLevel: qrModule.correction.M });
    var quiet = 4, scale = 6;
    canvas.width = canvas.height = (code.size + quiet * 2) * scale;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "QR code for the invite link");
    var context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000";
    for (var y = 0; y < code.size; y++) {
      for (var x = 0; x < code.size; x++) {
        if (code.get(x, y)) context.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
      }
    }
    return canvas;
  }

  function buildLobby() {
    lobby = el("section", "quiz-lobby");
    var invite = el("div", "quiz-panel quiz-invite"), players = el("div", "quiz-panel");
    var link = el("input");
    link.value = joinUrl;
    link.readOnly = true;
    link.setAttribute("aria-label", "Invite link");
    var copy = button("Copy invite link", function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(joinUrl).then(function () { copy.textContent = "Copied"; }, selectLink);
      } else selectLink();
    });
    function selectLink() {
      link.select();
      var copied = false;
      try { copied = document.execCommand("copy"); } catch (err) {}
      copy.textContent = copied ? "Copied" : "Link selected";
    }
    invite.append(el("h2", "", "Invite players"), el("p", "note", "Share the link or show this QR code. Players need to be on the same network."),
      link, copy);
    if (qrModule) invite.append(qrFor(joinUrl));
    lobbyList = el("div", "quiz-roster");
    lobbyStatus = el("p", "note");
    lobbyButton = button("Start game", function () { room.start(); }, true);
    players.append(el("h2", "", "Waiting lobby"), lobbyStatus, lobbyList, lobbyButton);
    lobby.append(invite, players);
    body.append(lobby);
  }

  function lobbyPlayers() {
    var players = Array.from(room.players.values());
    var present = players.filter(function (p) { return !p.away; }).length;
    lobbyStatus.textContent = present + " connected · " + players.length + " / " + room.settings.maxPlayers + " places taken";
    lobbyButton.disabled = present < 2;
    var table = el("ul", "quiz-player-list");
    players.forEach(function (p) {
      var row = el("li");
      row.append(el("span", "", p.name + (p.away ? " (away)" : "")), button("Remove", function () {
        ask("Remove " + p.name + " from this room?", "Remove player", function () { room.remove(p); });
      }));
      table.append(row);
    });
    room.pending.forEach(function (p, id) {
      var row = el("li"), actions = el("div", "row");
      actions.append(button("Approve", function () { room.approve(id); }), button("Decline", function () { room.refuse(id); }));
      row.append(el("span", "", p.name + " (waiting for approval)"), actions);
      table.append(row);
    });
    lobbyList.replaceChildren(table);
    if (!players.length && !room.pending.size) lobbyList.append(el("p", "note", "Waiting for players to join."));
  }

  function buildWheel(levels) {
    wheelBox = el("section", "quiz-wheelbox");
    var wheelPointer = el("div", "quiz-wheel-pointer");
    wheelPointer.setAttribute("aria-hidden", "true");
    wheel = el("div", "quiz-wheel");
    wheel.setAttribute("aria-hidden", "true");
    wheel.style.background = "conic-gradient(" + levels.map(function (lv, i) { return lv.color + " " + i * 45 + "deg " + (i + 1) * 45 + "deg"; }).join(", ") + ")";
    levels.forEach(function (lv, i) {
      var label = el("span", "", ["VE", "E", "N", "H", "VH", "EH", "IH", "I"][i]);
      label.style.setProperty("--segment", (22.5 + i * 45) + "deg");
      label.style.color = lv.ink;
      wheel.append(label);
    });
    wheelBox.append(wheelPointer, wheel);
  }

  function paintWheel() {
    if (!room.level || shownSpin === room.round) return;
    shownSpin = room.round;
    var index = room.o.levels.indexOf(room.level);
    var target = (360 - (22.5 + index * 45)) % 360;
    var turn = (target - rotation % 360 + 360) % 360;
    rotation += reduce ? turn : 1080 + turn;
    wheel.style.transform = "rotate(" + rotation + "deg)";
  }

  function buildGame() {
    game = el("section", "quiz-panel quiz-stage");
    gameStatus = el("p", "quiz-meta");
    questionTarget = el("div");
    actions = el("div", "row quiz-controls");
    if (room.settings.tiers) {
      buildWheel(room.o.levels);
      game.append(wheelBox);
    }
    game.append(gameStatus, questionTarget, actions);
    body.append(game);
  }

  function render() {
    if (!room || !relay || stopping) return;
    if (room.phase === "lobby") {
      if (!lobby) buildLobby();
      lobbyPlayers();
      return;
    }
    if (lobby) { lobby.remove(); lobby = null; }
    if (!game) buildGame();
    var phase = room.phase;
    if (phase === "question") status.textContent = room.answers.size + " / " + room.players.size + " answered";
    else status.textContent = "";
    if (lastPhase === phase && lastRound === room.round) return;
    lastPhase = phase;
    lastRound = room.round;
    if (clockStop) { clockStop(); clockStop = null; }
    title.textContent = phase === "podium" || phase === "finished" ? "Game finished" : "Kahoot-like game";
    gameStatus.textContent = room.round ? "Question " + room.round + " / " + room.total : room.players.size + " players ready";
    questionTarget.replaceChildren();
    actions.replaceChildren();
    if (wheelBox) {
      wheelBox.hidden = !["ready", "spinning", "preview", "question", "reveal"].includes(phase);
      wheelBox.classList.toggle("quiz-wheel-small", ["preview", "question", "reveal"].includes(phase));
    }
    if (phase === "spinning") {
      paintWheel();
      questionTarget.append(el("h2", "", "Spinning the difficulty wheel…"));
    } else if (phase === "preview" || phase === "question" || phase === "reveal") {
      if (room.level) gameStatus.append(document.createTextNode(" · " + room.level.name));
      if (phase !== "reveal") {
        var time = el("span", "quiz-timer");
        gameStatus.append(time);
        clockStop = QuizView.clock(time, Math.max(0, room.deadline - Date.now()));
      }
      if (phase === "reveal") {
        questionTarget.append(QuizView.roundSummary(room.roundSummary()));
      } else {
        questionTarget.append(el("h2", "", phase === "preview" ? "Players are previewing their questions" : "Players are answering"));
      }
    } else if (phase === "leaderboard") {
      questionTarget.append(QuizView.leaderboard(room.leaders.rows, room.leaders.highest));
    } else if (phase === "podium") {
      questionTarget.append(QuizView.podium(room.leaders.rows.slice(0, 3)));
    } else if (phase === "ready") {
      questionTarget.append(el("p", "note", "All players answer on their own devices."));
    } else if (phase === "finished") {
      questionTarget.append(el("h2", "", "All questions complete"));
    }
    if (phase === "question") actions.append(button("Reveal answers", function () {
      ask("Close the question for everyone and reveal the answers?", "Reveal", function () { room.reveal(); });
    }));
    if (phase === "ready" || phase === "reveal" || phase === "leaderboard") {
      var label = phase === "reveal" && room.settings.leaderboard ? "Show leaderboard"
        : room.round === room.total ? (room.settings.podium ? "Show podium" : "Finish game")
        : room.settings.tiers ? "Spin wheel" : phase === "ready" ? "Show first question" : "Next question";
      actions.append(button(label, function () {
        try { room.next(); } catch (err) { status.textContent = err.message; }
      }, true));
    }
  }

  async function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(refreshTimer);
    if (clockStop) clockStop();
    if (listener) { listener(); listener = null; }
    if (room) room.stop();
    if (relay) {
      await Promise.all(Array.from(queues.values()));
      await new Promise(function (resolve) { setTimeout(resolve, 300); });
      await invoke("lan_stop").catch(function () {});
      relay = null;
    }
    location.href = back.href;
  }

  back.onclick = function (event) {
    if (!relay) return;
    event.preventDefault();
    ask("Close this room for all players?", "Close room", stop);
  };
  window.addEventListener("pagehide", function () {
    clearInterval(refreshTimer);
    if (listener) { listener(); listener = null; }
    if (room) room.stop();
    if ((relay || opening) && !stopping) invoke("lan_stop").catch(function () {});
  });

  async function start() {
    var capacity = await PGQuiz.deviceCapacity();
    try {
      var requested = sessionStorage.getItem(PGQuiz.LAUNCH) === "1";
      sessionStorage.removeItem(PGQuiz.LAUNCH);
      if (!capacity || !requested || !PGQuiz.enabled()) {
        status.textContent = "Open this room from the desktop app's Online → Host a game → Custom rules → Advanced setup.";
        return;
      }
      var settings = PGQuiz.load(capacity), rules = settings.rules;
      if (!rules) throw new Error("Your wheel settings could not be loaded. Set up the room again.");
      if (!settings.tiers && !settings.questions.length) throw new Error("The question set is empty.");
      var levels = Wheel.getSlices(rules.levelColors).slice(0, 8);
      room = new QuizRoom({ settings: settings, rules: rules, levels: levels, words: Words,
        seconds: function (level) { return Game.seconds({ custom: { time: rules.time } }, level); },
        spinMs: reduce ? 350 : 2100, change: render, send: send, drop: drop });
      var qr = import("./lean-qr.js").then(function (module) { qrModule = module; }).catch(function () {});
      listener = await window.__TAURI__.event.listen("lan-msg", function (event) {
        var payload = event.payload;
        if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch (err) { return; } }
        if (payload && !closing.has(payload.id)) room.receive(payload.id, payload.data);
      });
      opening = true;
      var info = await invoke("lan_start_quiz", { maxPlayers: settings.maxPlayers });
      opening = false;
      relay = typeof info === "string" ? JSON.parse(info) : info;
      joinUrl = "http://" + relay.ips[0] + ":" + relay.port + "/quiz-join.html#" + Proto.b64e(room.key);
      await qr;
      refreshTimer = setInterval(function () {
        invoke("lan_status").then(function (res) {
          if (stopping) return;
          var value = typeof res === "string" ? JSON.parse(res) : res;
          if (value.running && value.port === relay.port) room.expire(value.peers);
        }).catch(function () {});
      }, 5000);
      status.textContent = qrModule ? "" : "The QR code is unavailable. Share the invite link.";
      back.textContent = "Close room";
      render();
    } catch (err) {
      opening = false;
      if (listener) { listener(); listener = null; }
      if (relay) { await invoke("lan_stop").catch(function () {}); relay = null; }
      status.textContent = "Could not start the room. " + (err.message || String(err));
    }
  }
  start();
})();
