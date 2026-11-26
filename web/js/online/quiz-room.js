// The desktop host owns admission, round transitions, deadlines and scoring. MIT License (see LICENSE).
var QuizRoom = (function () {
  "use strict";

  function Room(o) {
    this.o = o;
    this.settings = o.settings;
    this.key = Proto.newKey();
    this.peers = new Map();
    this.players = new Map();
    this.tokens = new Map();
    this.pending = new Map();
    this.phase = "lobby";
    this.round = 0;
    this.total = this.settings.tiers ? this.settings.rounds : this.settings.questions.length;
    this.timer = null;
    this.lobbyTimer = null;
    this.questions = new Map();
    this.answers = new Map();
    this.previous = new Map();
    this.order = 0;
    this.closed = false;
    this.random = o.random || Math.random;
    this.now = o.now || Date.now;
  }

  Room.prototype.tell = function (peer, message) {
    if (peer) this.o.send(peer.id, peer.channel.send(message));
  };

  Room.prototype.drop = function (peer, why) {
    this.tell(peer, { t: "closed", why: why });
    this.peers.delete(peer.id);
    this.pending.delete(peer.id);
    this.o.drop(peer.id);
  };

  Room.prototype.receive = function (id, text) {
    if (this.closed) return;
    var peer = this.peers.get(id);
    if (!peer) {
      var hello = Proto.hostReadHello(this.key, text);
      if (!hello) return;
      if (this.peers.size >= this.settings.maxPlayers * 2 + 8) {
        this.o.send(id, Proto.hostRefuse(this.key, "The room is busy. Try again shortly."));
        this.o.drop(id);
        return;
      }
      var accepted = Proto.hostAccept(this.key, hello);
      this.peers.set(id, { id: id, channel: accepted.chan, created: this.now() });
      this.o.send(id, accepted.text);
      return;
    }
    var msg = peer.channel.recv(text);
    if (!msg) return;
    if (msg.t === "join" && !peer.player && !this.pending.has(id)) this.join(peer, msg);
    else if (msg.t === "answer" && peer.player) this.answer(peer.player, msg.round, msg.answer);
    else if (msg.t === "leave") {
      if (peer.player && this.phase === "lobby") this.remove(peer.player);
      else {
        if (peer.player) peer.player.peer = null;
        this.drop(peer, "You left the room.");
        this.lobbyChanged();
      }
    }
  };

  Room.prototype.join = function (peer, msg) {
    var existing = this.tokens.get(msg.token);
    if (existing) {
      if (existing.peer) this.drop(existing.peer, "This player rejoined on another connection.");
      this.connect(peer, existing);
      this.lobbyChanged();
      return;
    }
    if (this.phase !== "lobby") return this.drop(peer, "The game has already started.");
    var name = typeof msg.name === "string" ? msg.name.trim().replace(/\s+/g, " ") : "";
    if (!name || name.length > 16 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(name) || Filter.bad(name)) {
      return this.drop(peer, "Enter a suitable name of 1–16 characters.");
    }
    if (this.players.size + this.pending.size >= this.settings.maxPlayers) return this.drop(peer, "The room is full.");
    var lower = name.toLowerCase();
    if (Array.from(this.players.values()).some(function (p) { return p.name.toLowerCase() === lower; })
      || Array.from(this.pending.values()).some(function (p) { return p.name.toLowerCase() === lower; })) {
      return this.drop(peer, "That player name is in use.");
    }
    peer.name = name;
    this.pending.set(peer.id, peer);
    if (this.settings.approve) {
      this.tell(peer, { t: "waiting" });
      this.o.change();
    } else this.approve(peer.id);
  };

  Room.prototype.connect = function (peer, player) {
    peer.player = player;
    player.peer = peer;
    player.away = false;
    this.tell(peer, { t: "joined", token: player.token, name: player.name });
    this.sendState(player);
  };

  Room.prototype.approve = function (id) {
    var peer = this.pending.get(id);
    if (!peer || this.phase !== "lobby") return;
    this.pending.delete(id);
    var player = { id: id, name: peer.name, token: Proto.hexId(), score: 0, streak: 0, order: this.order++, away: false };
    this.players.set(id, player);
    this.tokens.set(player.token, player);
    this.connect(peer, player);
    this.lobbyChanged();
  };

  Room.prototype.refuse = function (id) {
    var peer = this.pending.get(id);
    if (!peer) return;
    this.drop(peer, "The host declined your request.");
    this.lobbyChanged();
  };

  Room.prototype.remove = function (player) {
    if (this.phase !== "lobby" || !this.players.has(player.id)) return;
    this.tokens.delete(player.token);
    this.players.delete(player.id);
    if (player.peer) this.drop(player.peer, "You were removed from the room.");
    this.lobbyChanged();
  };

  Room.prototype.expire = function (peers) {
    var me = this, changed = false;
    var idle = new Map(peers.map(function (p) { return [p.id, p.idle]; }));
    this.peers.forEach(function (peer) {
      var absent = !idle.has(peer.id) || idle.get(peer.id) >= 35;
      if (peer.player) {
        if (peer.player.away !== absent) {
          peer.player.away = absent;
          changed = true;
        }
      } else if ((me.now() - peer.created) >= 35000 && (absent || !me.pending.has(peer.id))) {
        me.drop(peer, "The join request expired.");
        changed = true;
      }
    });
    if (changed && this.phase === "lobby") this.lobbyChanged();
  };

  Room.prototype.lobbyChanged = function () {
    this.o.change();
    if (this.phase !== "lobby" || this.lobbyTimer) return;
    var me = this;
    this.lobbyTimer = setTimeout(function () {
      me.lobbyTimer = null;
      if (!me.closed && me.phase === "lobby") me.broadcast();
    }, 200);
  };

  Room.prototype.sendState = function (player) {
    if (!player.peer) return;
    var phase = this.phase, q = this.questions.get(player.id);
    var state = { t: "state", phase: phase, round: this.round, total: this.total, score: player.score };
    if (phase === "lobby") {
      state.names = Array.from(this.players.values()).map(function (p) { return p.name; });
    } else if (phase === "spinning") {
      state.level = this.level.name;
    } else if (q && (phase === "preview" || phase === "question" || phase === "reveal")) {
      state.question = PGQuiz.publicQuestion(q, phase === "preview");
      state.level = this.level && this.level.name;
      state.leftMs = Math.max(0, this.deadline - this.now());
      state.submitted = this.answers.has(player.id);
      if (phase === "reveal") {
        var a = this.answers.get(player.id);
        state.result = { answer: a ? a.answer : null, correct: q.correct,
          ok: !!(a && a.correct), points: a ? a.points : 0 };
        state.distribution = this.distribution(player.id);
      }
    } else if (phase === "leaderboard") {
      state.rows = this.leaders.rows;
      state.highest = this.leaders.highest;
    } else if (phase === "podium") {
      state.rows = this.leaders.rows.slice(0, 3);
    }
    this.tell(player.peer, state);
  };

  Room.prototype.broadcast = function () {
    var me = this;
    this.players.forEach(function (player) { me.sendState(player); });
  };

  Room.prototype.setPhase = function (phase, fn, ms) {
    clearTimeout(this.timer);
    this.phase = phase;
    this.timer = fn ? setTimeout(fn.bind(this), ms) : null;
    this.broadcast();
    this.o.change();
  };

  Room.prototype.start = function () {
    if (this.phase !== "lobby" || Array.from(this.players.values()).filter(function (p) { return !p.away; }).length < 2) return;
    var me = this;
    this.pending.forEach(function (p) { me.drop(p, "The game has started."); });
    this.setPhase("ready");
  };

  Room.prototype.pickLevel = function () {
    var levels = this.o.levels, run = this.o.rules;
    var weights = levels.map(function (lv, i) {
      var id = run.extreme ? levels[levels.length - 1 - i].id : lv.id;
      return run.weights[id];
    });
    var r = this.random() * weights.reduce(function (a, b) { return a + b; }, 0);
    for (var i = 0; i < levels.length; i++) {
      r -= weights[i];
      if (r < 0) return levels[i];
    }
    for (var j = levels.length - 1; j >= 0; j--) if (weights[j] > 0) return levels[j];
    throw new Error("At least one difficulty tier needs a nonzero probability.");
  };

  Room.prototype.next = function () {
    if (this.phase !== "ready" && this.phase !== "leaderboard" && this.phase !== "reveal") return;
    if (this.phase === "reveal" && this.settings.leaderboard) return this.setPhase("leaderboard");
    if (this.round === this.total) return this.setPhase(this.settings.podium ? "podium" : "finished");
    var ids = Array.from(this.players.keys());
    if (this.settings.tiers) {
      this.level = this.pickLevel();
      this.questions = PGQuiz.assignWords(ids, this.o.words, this.level, this.settings, this.o.rules.extreme, this.random);
      this.duration = this.o.seconds(this.level) * 1000;
    } else {
      this.level = null;
      var q = PGQuiz.customQuestion(this.settings.questions[this.round], this.random);
      this.questions = new Map(ids.map(function (id) { return [id, q]; }));
      this.duration = PGQuiz.CUSTOM_SECONDS * 1000;
    }
    this.round++;
    this.answers.clear();
    if (this.level) this.setPhase("spinning", this.preview, this.o.spinMs);
    else this.preview();
  };

  Room.prototype.preview = function () {
    if (!this.settings.preview) return this.openQuestion();
    var delay = this.settings.previewSeconds * 1000;
    this.deadline = this.now() + delay;
    this.setPhase("preview", this.openQuestion, delay);
  };

  Room.prototype.openQuestion = function () {
    this.opened = this.now();
    this.deadline = this.opened + this.duration;
    this.setPhase("question", this.reveal, this.duration);
  };

  Room.prototype.answer = function (player, round, answer) {
    if (this.phase !== "question" || round !== this.round || this.answers.has(player.id)) return;
    var now = this.now();
    if (now >= this.deadline) return this.reveal();
    var q = this.questions.get(player.id);
    if (!PGQuiz.validAnswer(q, answer)) return;
    var grade = PGQuiz.grade(q, answer, this.settings.timed, now - this.opened, this.duration);
    this.answers.set(player.id, { answer: answer, correct: grade.correct, points: grade.points });
    if (this.answers.size === this.players.size) this.reveal();
    else {
      this.tell(player.peer, { t: "recorded", round: this.round });
      this.o.change();
    }
  };

  Room.prototype.reveal = function () {
    if (this.phase !== "question") return;
    var me = this;
    this.players.forEach(function (player) {
      var a = me.answers.get(player.id);
      player.score += a ? a.points : 0;
      player.streak = a && a.correct ? player.streak + 1 : 0;
    });
    this.leaders = PGQuiz.standings(this.players.values(), this.previous, this.settings.streaks, this.random);
    this.previous = this.leaders.ranks;
    this.setPhase("reveal");
  };

  Room.prototype.distribution = function (id) {
    var me = this, q = this.questions.get(id), counts = q.options.map(function () { return 0; });
    var matches = q.format === "pairs" ? q.left.map(function () { return counts.slice(); }) : null;
    var summary = { correct: 0, incorrect: 0, unanswered: 0 };
    var assigned = 0;
    this.questions.forEach(function (other, playerId) {
      var a = me.answers.get(playerId);
      summary[!a ? "unanswered" : a.correct ? "correct" : "incorrect"]++;
      if (other !== q) return;
      assigned++;
      if (a) a.answer.forEach(function (i, k) {
        if (matches) matches[k][i]++;
        else counts[i]++;
      });
    });
    return { counts: counts, matches: matches, assigned: assigned, summary: summary };
  };

  Room.prototype.stop = function () {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    clearTimeout(this.lobbyTimer);
    var me = this;
    this.peers.forEach(function (peer) { me.tell(peer, { t: "closed", why: "The host closed the room." }); });
  };

  return Room;
})();
if (typeof module !== "undefined" && module.exports) module.exports = QuizRoom;
