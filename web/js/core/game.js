// Rules only (no visuals). MIT License (see LICENSE).
// Modes: "solo", "1v1", "2v2". Teams are 0 and 1; players are numbered in order (team 0 first).
// Power-ups (2x, 3x, Shield) are chosen AFTER the difficulty is shown and BEFORE the word is shown.
// Only one can be active per question. Whatever is armed is used up, right or wrong.
var Game = (function () {
  var MULT = { x2:2, x3:3, shield:1 };
  var cur = function (g) { return g.players[g.turn]; };

  // cfg: { mode, teams:[{ name, fmt, color, players:[names], pfmt:[text styles] }] }. order: player numbers in play order.
  // A text style (fmt) is any of "b" (bold), "i" (italic) and "u" (underline).
  function create(cfg, order) {
    var g = { mode:cfg.mode, teams:[], players:[], order:[], pos:0, turn:0, turns:0,
      offered:false, over:false, winner:null, reason:"" };
    cfg.teams.forEach(function (t, ti) {
      var ids = t.players.map(function (name, k) {
        g.players.push({ name:name, fmt:(t.pfmt && t.pfmt[k]) || "", team:ti, score:0, inv:{ x2:0, x3:0, shield:0 }, armed:null, out:false });
        return g.players.length - 1;
      });
      g.teams.push({ name:t.name, fmt:t.fmt || "", color:t.color, players:ids, out:false });
    });
    g.order = order || g.players.map(function (p, i) { return i; });
    g.turn = g.order[0];
    return g;
  }

  function teamScore(g, t) {
    return g.teams[t].players.reduce(function (s, i) { return s + g.players[i].score; }, 0);
  }
  // First player of a team who has not resigned (used for sudden death).
  function rep(g, t) {
    for (var k = 0; k < g.order.length; k++) {
      var i = g.order[k];
      if (g.players[i].team === t && !g.players[i].out) return i;
    }
    return -1;
  }

  // Move to the next player who has not resigned. True if that went past the end of the order (a round ended).
  function advance(g) {
    var n = g.order.length;
    for (var k = 1; k <= n; k++) {
      var raw = g.pos + k, pos = raw % n;
      if (!g.players[g.order[pos]].out) { g.pos = pos; g.turn = g.order[pos]; return raw >= n; }
    }
    return false;
  }
  // At the end of a round: someone at 100 or more? Then the higher team total wins; a tie goes to sudden death.
  function roundEnd(g) {
    var a = teamScore(g, 0), b = teamScore(g, 1);
    if (Math.max(a, b) < 100) return "next";
    if (a === b) return "sudden";
    g.over = true; g.winner = a > b ? 0 : 1; g.reason = "higher score at 100 or more";
    return "win";
  }

  function grant(g, id) {
    var p = cur(g);
    if (id === "free") p.score += 5; else if (id in MULT) p.inv[id]++;
  }
  // Toggle a power-up for the current question (only one at a time).
  function arm(g, id) {
    var p = cur(g);
    if (!(id in MULT) || p.inv[id] < 1) return;
    p.armed = p.armed === id ? null : id;
  }
  function answer(g, lv, ok) {
    var p = cur(g), m = p.armed, pts = 0;
    if (m) { p.inv[m]--; p.armed = null; }
    if (ok) pts = lv.points * (m ? MULT[m] : 1);
    else if (m === "shield") pts = lv.points / 2;
    p.score += pts;
    return pts;
  }
  // Returns "next", "win" or "sudden".
  function endTurn(g) {
    g.turns++; g.offered = false;
    if (g.mode === "solo") {
      if (cur(g).score < 100) return "next";
      g.over = true; g.winner = 0; g.reason = "reached 100 points in " + g.turns + " turns";
      return "win";
    }
    return advance(g) ? roundEnd(g) : "next";
  }
  // The current player leaves. Their team plays on unless nobody on it is left.
  function resign(g) {
    var p = cur(g), t = g.teams[p.team];
    p.out = true; g.offered = false;
    t.out = t.players.every(function (i) { return g.players[i].out; });
    if (t.out) {
      g.over = true; g.winner = 1 - p.team;
      g.reason = t.players.length > 1 ? t.name + " has no players left" : p.name + " resigned";
      return "win";
    }
    return advance(g) ? roundEnd(g) : "next";
  }
  function draw(g) { g.over = true; g.winner = null; g.reason = "draw agreed"; }
  function value(s) { return s.points !== undefined ? s.points : s.id === "free" ? 5 : s.id === "egg" ? 1000 : 0; }

  // 1 vs 1 first turn. teams: [{ name }, { name }]. Each side draws 0 to 9; the higher number goes first,
  // equal numbers draw again.
  function drawFirst(teams, rnd) {
    rnd = rnd || function () { return Math.floor(Math.random() * 10); };
    var log = [], round = 0, a, b;
    do {
      round++; a = rnd(); b = rnd();
      log.push("Draw " + round + ": " + teams[0].name + " " + a + " | " + teams[1].name + " " + b);
      if (a === b) log.push("The numbers are equal, so both draw again.");
    } while (a === b);
    var order = a > b ? [0, 1] : [1, 0];
    log.push(teams[order[0]].name + " has the higher number, so " + teams[order[0]].name + " goes first.");
    log.push("Play order: " + teams[order[0]].name + ", " + teams[order[1]].name + ".");
    return { order:order, log:log };
  }

  // 2 vs 2 turn order. teams: [{ name, players:[a, b] }, ...]. rnd gives a number from 0 to 9.
  // Everyone draws; the higher team total goes first (equal totals: draw again); inside a team the higher
  // number goes first (equal numbers: only those two draw again). The first team plays both of its
  // players, then the other team does.
  function drawOrder(teams, rnd) {
    rnd = rnd || function () { return Math.floor(Math.random() * 10); };
    var log = [], round = 0, nums, sums, first, order = [];
    for (;;) {
      round++;
      nums = teams.map(function (t) { return [rnd(), rnd()]; });
      sums = nums.map(function (a) { return a[0] + a[1]; });
      log.push("Draw " + round + ": " + teams.map(function (t, i) {
        return t.players[0] + " " + nums[i][0] + ", " + t.players[1] + " " + nums[i][1] + " (" + t.name + " " + sums[i] + ")";
      }).join(" | "));
      if (sums[0] !== sums[1]) break;
      log.push("The team totals are tied, so everyone draws again.");
    }
    first = sums[0] > sums[1] ? 0 : 1;
    log.push(teams[first].name + " has the higher total, so " + teams[first].name + " goes first.");
    [first, 1 - first].forEach(function (ti) {
      var t = teams[ti], v = nums[ti].slice();
      while (v[0] === v[1]) {
        log.push(t.name + ": " + t.players[0] + " and " + t.players[1] + " both drew " + v[0] + ", so they draw again.");
        v = [rnd(), rnd()];
        log.push(t.name + ": " + t.players[0] + " " + v[0] + ", " + t.players[1] + " " + v[1] + ".");
      }
      (v[0] > v[1] ? [0, 1] : [1, 0]).forEach(function (k) { order.push(ti * 2 + k); });
    });
    log.push("Play order: " + order.map(function (i) { return teams[i >> 1].players[i & 1]; }).join(", ") + ".");
    return { order:order, log:log };
  }

  return { create:create, teamScore:teamScore, rep:rep, grant:grant, arm:arm, answer:answer,
    endTurn:endTurn, resign:resign, draw:draw, value:value, drawOrder:drawOrder, drawFirst:drawFirst };
})();
