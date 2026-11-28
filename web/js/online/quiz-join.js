// Guest page for spectator-mode games, in a browser or inside PlayGloss. MIT License (see LICENSE).
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var el = QuizView.el, status = $("quiz-status"), body = $("quiz-body"), title = $("quiz-title");
  var form = $("quiz-join-form"), input = $("quiz-name"), joinButton = $("quiz-join"), score = $("quiz-score");
  var hash = location.hash.slice(1), key, hello, channel, name, timeout, clockStop, lastState, token;
  var lastPhase, lastRound;
  var host = new URLSearchParams(location.search).get("h");

  try { key = Proto.b64d(hash); } catch (err) {}
  if (!key || key.length !== 32 || (host !== null
      ? !window.__TAURI__ || !window.__TAURI__.core || !Link.hostOk(host)
      : location.protocol !== "http:" || !Link.hostOk(location.host))) {
    status.textContent = "Open the full invite link or scan the QR code provided by your host.";
    return;
  }

  var storage = "playgloss-quiz-guest-" + hash;
  try {
    var saved = JSON.parse(sessionStorage.getItem(storage));
    if (saved) { token = saved.token; input.value = saved.name || ""; }
  } catch (err) {}
  var transport = QuizTransport.create(host, receive, disconnected);

  function clearClock() {
    if (clockStop) { clockStop(); clockStop = null; }
  }

  function disconnected(message) {
    PGAudio.stop();
    clearTimeout(timeout);
    clearClock();
    transport.close();
    channel = null;
    hello = null;
    lastState = null;
    lastPhase = lastRound = null;
    body.replaceChildren();
    status.textContent = message;
    title.textContent = "Join the game";
    score.hidden = true;
    form.hidden = false;
    joinButton.disabled = false;
    joinButton.textContent = token ? "Rejoin game" : "Join game";
  }

  function send(message) {
    return transport.send(channel.send(message));
  }

  function leave() {
    token = null;
    try { sessionStorage.removeItem(storage); } catch (err) {}
    if (channel) send({ t: "leave" }).then(function () { disconnected("You left the room."); },
      function () { disconnected("You left the room."); });
    else disconnected("Join canceled.");
  }

  function receive(text) {
    if (!channel) {
      if (!hello) return;
      var answer = Proto.guestAnswer(key, hello.pair, text);
      if (!answer) return;
      if (!answer.ok) return disconnected(answer.why);
      channel = answer.chan;
      send({ t: "join", name: name, token: token || null }).catch(function () {
        disconnected("Could not send your join request. Try again.");
      });
      return;
    }
    var msg = channel.recv(text);
    if (!msg) return;
    clearTimeout(timeout);
    if (msg.t === "waiting") {
      title.textContent = "Waiting for approval";
      status.textContent = "The host will let you in.";
      body.replaceChildren(QuizView.button("Cancel request", leave));
    } else if (msg.t === "closed") {
      if (/removed|declined/.test(msg.why)) {
        token = null;
        try { sessionStorage.removeItem(storage); } catch (err) {}
      }
      disconnected(msg.why);
    } else if (msg.t === "joined") {
      token = msg.token;
      name = msg.name;
      try { sessionStorage.setItem(storage, JSON.stringify({ token: token, name: name })); } catch (err) {}
    } else if (msg.t === "state") {
      lastState = msg;
      render(msg);
    } else if (msg.t === "recorded" && lastState && lastState.phase === "question" && lastState.round === msg.round) {
      lastState.submitted = true;
      render(lastState);
    }
  }

  function render(state) {
    clearClock();
    body.replaceChildren();
    status.textContent = "";
    score.hidden = state.phase === "lobby" || state.phase === "egg";
    score.textContent = state.score + " pts";
    var phase = state.phase;
    if (phase !== lastPhase || state.round !== lastRound) {
      if (phase === "question" && !state.submitted) PGAudio.play("question_open");
      if (phase === "reveal" && state.result) {
        var result = state.result;
        PGAudio.play(result.ok ? "answer_correct" : result.points > 0 ? "round_result" : "answer_incorrect");
      }
      if (phase === "podium" || phase === "finished") PGAudio.play("game_end");
      lastPhase = phase;
      lastRound = state.round;
    }
    if (phase === "lobby") {
      title.textContent = "Waiting lobby";
      status.textContent = "You're in as " + name + ".";
      var lobby = el("section", "quiz-panel"), players = el("ul", "quiz-player-list");
      state.names.forEach(function (n) { players.append(el("li", "", n)); });
      lobby.append(el("h2", "", state.names.length + " joined"), players, QuizView.button("Leave room", leave));
      body.append(lobby);
      return;
    }
    if (phase === "ready" || phase === "spinning") {
      title.textContent = phase === "ready" ? "Get ready" : state.level;
      status.textContent = phase === "ready" ? "Waiting for the first question." : "The host spun the wheel.";
      return;
    }
    var panel = el("section", "quiz-panel quiz-stage");
    body.append(panel);
    if (phase === "egg") {
      title.textContent = "Kahoot-like game";
      panel.append(el("h2", "", "1 in " + state.eggOdds.toLocaleString("en-US")));
    } else if (phase === "preview" || phase === "question" || phase === "reveal") {
      title.textContent = "Question " + state.round + " / " + state.total;
      if (phase === "preview" || phase === "question") {
        var label = el("p", "quiz-meta", phase === "preview" ? "Preview" : state.level || "Time left");
        var countdown = el("span", "quiz-timer");
        label.append(countdown);
        panel.append(label);
        clockStop = QuizView.clock(countdown, state.leftMs);
      }
      if (state.submitted && phase === "question") {
        status.textContent = "Answer recorded. Waiting for the other players.";
        panel.append(QuizView.question(state.question));
      } else if (phase === "question") {
        panel.append(QuizView.question(state.question, null, function (answer) {
          return send({ t: "answer", round: state.round, answer: answer });
        }));
      } else {
        panel.append(QuizView.question(state.question, state.result));
        if (state.result) {
          var message = !state.result.answer ? "No answer submitted" : state.result.ok ? "✓ Correct" : state.result.points > 0 ? "◐ Partly correct" : "✗ Incorrect";
          status.textContent = message + " · +" + state.result.points + " pts";
          panel.append(QuizView.distribution(state.question, state.distribution));
        }
      }
    } else if (phase === "leaderboard") {
      title.textContent = "Question " + state.round + " / " + state.total;
      panel.append(QuizView.leaderboard(state.rows, state.highest));
    } else if (phase === "podium" || phase === "finished") {
      title.textContent = "Game finished";
      status.textContent = name + ", you finished with " + state.score + " points.";
      if (phase === "podium") panel.append(QuizView.podium(state.rows));
      else panel.append(el("h2", "", "All questions complete"));
      panel.append(QuizView.button("Leave room", leave));
    }
  }

  form.onsubmit = function (e) {
    e.preventDefault();
    var nextName = input.value.trim().replace(/\s+/g, " ");
    if (!nextName || nextName.length > 16 || Filter.bad(nextName)) {
      status.textContent = "Choose a different name (1–16 characters).";
      return;
    }
    if (token && name && name !== nextName) token = null;
    name = nextName;
    hello = Proto.guestHello(key, []);
    channel = null;
    joinButton.disabled = true;
    form.hidden = true;
    status.textContent = "Connecting…";
    body.replaceChildren(QuizView.button("Cancel", leave));
    timeout = setTimeout(function () {
      disconnected("The host did not answer. Check the invite and try again.");
    }, 15000);
    var attempt = hello;
    transport.connect(attempt.id, attempt.text).catch(function (err) {
      if (hello === attempt) disconnected(/HTTP 503$/.test(err.message) ? "The room is busy. Try again shortly." : "Could not reach the host. Check the invite and your network.");
    });
  };

  form.hidden = false;
  if (token && input.value) { name = input.value; joinButton.textContent = "Rejoin game"; }
  window.addEventListener("pagehide", function () { clearTimeout(timeout); clearClock(); transport.close(); });
})();
