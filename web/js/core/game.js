// Rules only (no visuals). MIT License (see LICENSE).
// Modes: "solo", "1v1", "2v2", "custom". Teams are 0 and 1; players are numbered in order (team 0 first).
// Power-ups (2x, 3x, Shield) are chosen AFTER the difficulty is shown and BEFORE the word is shown.
// Only one can be active per question. Whatever is armed is used up, right or wrong.
//
// 0.1.4 adds two flags that are stored in the game itself, so a guest's screen gets them with every picture:
//   extreme  : Extreme mode (the wheel flips the level odds, see wheel.js). The rules below do not change.
//   inf      : Infinite mode. There is no 100 points goal. Every player has 3 hearts, a wrong answer or a time-up
//              costs one, and a player with no hearts left is out (skipped, like after resigning).
//              Solo: the game ends when the hearts are gone. 1 vs 1 and 2 vs 2: when every player of one side is
//              out, the other side plays on until it passes the score the first side ended with (then it wins) or
//              loses its own hearts (then the higher score wins; the same score is a draw).
// 0.1.5 adds the "custom" mode (two teams of two, like 2 vs 2) with its own settings, stored in g.custom:
//   hearts      1 to 10, only used when Infinite is on (every other mode has 3)
//   targetScore 100 to 1000 in steps of 50, only used when Infinite is off (every other mode has 100)
//   time        how long a question lasts: "very-easy" (longest) to "impossible" (shortest), see TIMES below
//   levelColors { levelId: "#rrggbb" } colors of the eight level slices on the wheel (looks only)
// 0.1.6 adds an optional Advanced Mode part, g.custom.adv (left out when Advanced Mode is off):
//   weights   { id: percent } for the eight levels, 2x, 3x, Shield and Free 5: two decimals, adding up to exactly 100
//   egg       false turns the Easter egg off
//   questions "custom" asks the player's own questions (the questions themselves stay on the host's device)
// Hearts exist if and only if Infinite is on, in every mode.
var Game = (function () {
  var MULT = { x2:2, x3:3, shield:1 };
  var HEARTS = 3, TARGET = 100;
  var LEVELS = ["very-easy", "easy", "normal", "hard", "very-hard", "extremely-hard", "insanely-hard", "impossible"];
  // Time to answer: every base time of the wheel is multiplied by this. "normal" is the standard game.
  var TIMES = [["very-easy", "Very Easy", 2], ["easy", "Easy", 1.5], ["normal", "Normal", 1], ["hard", "Hard", .75],
    ["very-hard", "Very Hard", .6], ["extremely-hard", "Extremely Hard", .5], ["insanely-hard", "Insanely Hard", .4], ["impossible", "Impossible", .25]];
  var cur = function (g) { return g.players[g.turn]; };

  // Turns anything (a saved game, a form, a message) into a valid custom setup.
  function cleanCustom(c) {
    c = c && typeof c === "object" ? c : {};
    var n = function (v, lo, hi, step, d) { v = Math.round(Number(v) / step) * step; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
    var colors = {};
    if (c.levelColors && typeof c.levelColors === "object") LEVELS.forEach(function (id) {
      var v = c.levelColors[id];
      if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) colors[id] = v.toLowerCase();
    });
    var time = TIMES.some(function (t) { return t[0] === c.time; }) ? c.time : "normal";
    var out = { hearts:n(c.hearts, 1, 10, 1, HEARTS), targetScore:n(c.targetScore, 100, 1000, 50, TARGET), time:time, levelColors:colors };
    var adv = cleanAdv(c.adv);
    if (adv) out.adv = adv;
    return out;
  }
  // The twelve slices whose chance the player sets in Advanced Mode (the Easter egg's chance is fixed).
  var ADV_IDS = LEVELS.concat(["x2", "x3", "shield", "free"]);
  // Advanced Mode setup -> clean copy or null. The weights are only kept when every one is a number from 0 to 100 with at
  // most two decimals and they add up to exactly 100 (counted in hundredths, so there is no rounding error).
  function cleanAdv(a) {
    if (!a || typeof a !== "object") return null;
    var out = {}, any = false;
    if (a.weights && typeof a.weights === "object") {
      var w = {}, sum = 0, ok = true;
      ADV_IDS.forEach(function (id) {
        var v = a.weights[id], cents = typeof v === "number" ? Math.round(v * 100) : NaN;
        if (!isFinite(cents) || cents < 0 || cents > 10000 || Math.abs(v * 100 - cents) > 1e-6) { ok = false; return; }
        w[id] = cents / 100; sum += cents;
      });
      if (ok && sum === 10000) { out.weights = w; any = true; }
    }
    if (a.egg === false) { out.egg = false; any = true; }
    if (a.questions === "custom") { out.questions = "custom"; any = true; }
    return any ? out : null;
  }
  // Seconds for a question of this level in this game.
  function seconds(g, lv) {
    var t = TIMES.filter(function (x) { return x[0] === (g.custom && g.custom.time); })[0];
    return Math.max(3, Math.round(lv.time * (t ? t[2] : 1)));
  }
  var targetOf = function (g) { return g.custom && g.custom.targetScore ? g.custom.targetScore : TARGET; };
  var heartsOf = function (g) { return g.custom && g.custom.hearts ? g.custom.hearts : HEARTS; };

  // cfg: { mode, teams:[{ name, fmt, color, players:[names], pfmt:[text styles] }], extreme, infinite, customOn, custom }.
  // custom: see cleanCustom. When customOn is true (or mode is the old "custom"), the game uses Custom rules (g.customOn).
  // order: player numbers in play order.
  // A text style (fmt) is any of "b" (bold), "i" (italic) and "u" (underline).
  function create(cfg, order) {
    // Custom rules are a switch on any structure (solo, 1v1, 2v2). The old "custom" mode is a custom 2v2.
    var customOn = cfg.mode === "custom" || !!cfg.customOn, mode = cfg.mode === "custom" ? "2v2" : cfg.mode;
    var custom = customOn ? cleanCustom(cfg.custom) : { hearts:HEARTS, targetScore:TARGET, time:"normal", levelColors:{} };
    var g = { mode:mode, customOn:customOn, teams:[], players:[], order:[], pos:0, turn:0, turns:0,
      offered:false, over:false, winner:null, reason:"", extreme:!!cfg.extreme, inf:!!cfg.infinite, custom:custom };
    cfg.teams.forEach(function (t, ti) {
      var ids = t.players.map(function (name, k) {
        g.players.push({ name:name, fmt:(t.pfmt && t.pfmt[k]) || "", team:ti, score:0, inv:{ x2:0, x3:0, shield:0 }, armed:null, out:false });
        if (cfg.infinite) g.players[g.players.length - 1].hearts = custom.hearts;
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
  // At the end of a round: someone at targetScore or more? Then the higher team total wins; a tie goes to sudden death.
  function roundEnd(g) {
    var target = targetOf(g);
    var a = teamScore(g, 0), b = teamScore(g, 1);
    if (Math.max(a, b) < target) return "next";
    if (a === b) return "sudden";
    g.over = true; g.winner = a > b ? 0 : 1; g.reason = "higher score at " + target + " or more";
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
    if (!ok && g.inf && p.hearts > 0) p.hearts--; // a wrong answer or a time-up costs a heart, a Shield or not
    return pts;
  }
  // Infinite mode: the current player has just lost the last heart. Marks them out and decides if the game is over.
  // Returns "win" when it is, otherwise "".
  function infElim(g) {
    var p = cur(g), t = g.teams[p.team];
    if (p.hearts > 0 || p.out) return "";
    p.out = true; p.dead = true;
    t.out = t.players.every(function (i) { return g.players[i].out; });
    if (g.mode === "solo") {
      g.over = true; g.winner = 0;
      g.reason = "ran out of hearts with " + fmtN(p.score) + " " + (p.score === 1 ? "point" : "points") + " after " + g.turns + " " + (g.turns === 1 ? "turn" : "turns");
      return "win";
    }
    return infCheck(g);
  }
  // Two sides. Both out: the higher team score wins (equal: draw). One side out: the other wins as soon as it is ahead.
  function infCheck(g) {
    var a = g.teams[0].out, b = g.teams[1].out, sa = teamScore(g, 0), sb = teamScore(g, 1);
    if (!a && !b) return "";
    if (a && b) {
      g.over = true; g.winner = sa === sb ? null : sa > sb ? 0 : 1;
      g.reason = sa === sb ? "same score when the hearts ran out" : "higher score when the hearts ran out";
      return "win";
    }
    var live = a ? 1 : 0, dead = 1 - live;
    if (teamScore(g, live) > teamScore(g, dead)) {
      g.over = true; g.winner = live; g.reason = g.teams[dead].name + " ran out of hearts and " + g.teams[live].name + " is ahead";
      return "win";
    }
    return "";
  }
  function fmtN(n) { return n % 1 ? n.toFixed(1) : String(n); }

  // Returns "next", "win" or "sudden".
  function endTurn(g) {
    g.turns++; g.offered = false;
    if (g.inf) {
      var r = infElim(g);
      if (r) return r;
      if (g.mode === "solo") return "next";
      advance(g); // no rounds and no sudden death in Infinite mode
      // The side that is still playing may have just passed the side that is out.
      return g.teams.some(function (t) { return t.out; }) ? (infCheck(g) || "next") : "next";
    }
    if (g.mode === "solo") {
      var target = targetOf(g);
      if (cur(g).score < target) return "next";
      g.over = true; g.winner = 0; g.reason = "reached " + target + " points in " + g.turns + " turns";
      return "win";
    }
    return advance(g) ? roundEnd(g) : "next";
  }
  // The current player leaves. Their team plays on unless nobody on it is left.
  function resign(g) {
    var p = cur(g), t = g.teams[p.team];
    p.out = true; g.offered = false;
    t.out = t.players.every(function (i) { return g.players[i].out; });
    if (t.out && !g.inf) {
      g.over = true; g.winner = 1 - p.team;
      g.reason = t.players.length > 1 ? t.name + " has no players left" : p.name + " resigned";
      return "win";
    }
    if (g.inf) {
      if (infCheck(g)) return "win";
      advance(g); // no 100-point rounds or sudden death in Infinite mode
      return g.teams.some(function (team) { return team.out; }) ? (infCheck(g) || "next") : "next";
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
    endTurn:endTurn, resign:resign, draw:draw, value:value, drawOrder:drawOrder, drawFirst:drawFirst,
    cleanCustom:cleanCustom, cleanAdv:cleanAdv, ADV_IDS:ADV_IDS, seconds:seconds, targetOf:targetOf, heartsOf:heartsOf, TIMES:TIMES, LEVELS:LEVELS };
})();
