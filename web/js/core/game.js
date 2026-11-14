// Rules only (no visuals). Red always starts.
// Power-ups (2x, 3x, Shield) are chosen AFTER the difficulty is shown and BEFORE the word is shown.
// Only one can be active per question. Whatever is armed is used up, right or wrong.
var Game = (function () {
  var other = function (t) { return t === "red" ? "blue" : "red"; };
  var nameOf = function (t) { return t === "red" ? "Red" : "Blue"; };
  var MULT = { x2:2, x3:3, shield:1 };

  function create() {
    return { score:{red:0,blue:0}, turn:"red",
      inv:{red:{x2:0,x3:0,shield:0}, blue:{x2:0,x3:0,shield:0}},
      armed:{red:null,blue:null}, offered:false, over:false, winner:null, reason:"" };
  }
  function grant(g, id) {
    var p = g.turn, i = g.inv[p];
    if (id === "free") g.score[p] += 5;
    else if (id in MULT) i[id]++;
  }
  // Toggle a power-up for the current question (only one at a time).
  function arm(g, id) {
    var p = g.turn;
    if (!(id in MULT) || g.inv[p][id] < 1) return;
    g.armed[p] = g.armed[p] === id ? null : id;
  }
  function answer(g, lv, ok) {
    var p = g.turn, m = g.armed[p], pts = 0;
    if (m) { g.inv[p][m]--; g.armed[p] = null; }
    if (ok) pts = lv.points * (m ? MULT[m] : 1);
    else if (m === "shield") pts = lv.points / 2;
    g.score[p] += pts;
    return pts;
  }
  function endTurn(g) {
    var r = g.score.red, b = g.score.blue;
    if (g.turn === "blue" && Math.max(r, b) >= 100) {   // Blue always gets the last turn of the round
      if (r !== b) { g.over = true; g.winner = r > b ? "red" : "blue"; g.reason = "higher score at 100 or more"; return "win"; }
      return "sudden";
    }
    g.turn = other(g.turn); g.offered = false;
    return "next";
  }
  function resign(g) { g.over = true; g.winner = other(g.turn); g.reason = nameOf(g.turn) + " resigned"; }
  function draw(g) { g.over = true; g.winner = null; g.reason = "draw agreed"; }
  function value(s) { return s.points !== undefined ? s.points : s.id === "free" ? 5 : s.id === "egg" ? 1000 : 0; }
  return { create:create, other:other, grant:grant, arm:arm, answer:answer, endTurn:endTurn, resign:resign, draw:draw, value:value };
})();
