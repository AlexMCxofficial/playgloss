// Drawing the game (cards, scores, leaderboard, turn order, turn banner). MIT License (see LICENSE).
// Shared by the host's play page (ui.js) and the guests' join page, so both look exactly the same.
// It only draws what it is given and uses textContent for every name (never innerHTML), so a name from
// another device can never run code. It does not know the rules and keeps no state of its own.
var View = (function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  var PU = [["x2", "2x"], ["x3", "3x"], ["shield", "Shield"]];

  var h = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  var fmt = function (n) { return n % 1 ? n.toFixed(1) : String(n); };
  var pl = function (n, w) { return fmt(n) + " " + w + (n === 1 ? "" : "s"); };
  // A name with the player's bold / italic / underline choices.
  var nm = function (name, f) { return h("span", "nm" + (f ? f.replace(/./g, " $&") : ""), name); };
  var fill = function (el, parts) { el.textContent = ""; parts.forEach(function (x) { el.appendChild(typeof x === "string" ? h("span", "", x) : x); }); };
  var tint = function (g, e, ti) { e.style.setProperty("--team", g.teams[ti].color); return e; };

  function inv(i) {
    return PU.filter(function (b) { return i[b[0]]; }).map(function (b) { return b[1] + " ×" + i[b[0]]; }).join("  ") || "No power-ups";
  }
  // out: the player left the game. dead: they left because their hearts ran out (Infinite mode), not because they resigned.
  var gone = function (p) { return p.dead ? " (out of hearts)" : " (resigned)"; };
  function pname(name, f, out, dead) {
    var p = h("p", "pname"); p.appendChild(nm(name, f));
    if (out) p.appendChild(h("span", "", dead ? " (out of hearts)" : " (resigned)"));
    return p;
  }
  // Infinite mode: three hearts, the lost ones grey. The picture is from the Minecraft Wiki (see CREDITS.md).
  function hearts(n) {
    n = Math.max(0, Math.min(3, Math.floor(Number(n)) || 0));
    var box = h("span", "hearts");
    box.setAttribute("role", "img"); box.setAttribute("aria-label", n + " of 3 hearts");
    for (var i = 0; i < 3; i++) {
      var im = h("img", "heart" + (i < n ? "" : " lost"));
      im.src = "img/heart.png"; im.alt = ""; im.width = 27; im.height = 27;
      box.appendChild(im);
    }
    return box;
  }
  // The small line above the turn banner: which mode this game is played in.
  function modeLine(g) {
    var el = $("modeline");
    if (!el) return;
    var parts = [];
    if (g.extreme) parts.push("Extreme");
    if (g.inf) parts.push("Infinite");
    el.textContent = parts.join(" - ");
    el.hidden = !parts.length;
  }
  // o.acts(pi): true if the buttons of player pi may be used right now (by this device).
  function card(g, pi, btns, o) {
    var p = g.players[pi], on = !g.over && g.turn === pi, c = tint(g, h("div", "pcard" + (on ? " on" : "") + (p.out ? " out" : "")), p.team);
    c.appendChild(h("div", "stripe"));
    c.appendChild(pname(p.name, p.fmt, p.out, p.dead));
    c.appendChild(h("p", "score", fmt(p.score)));
    if (g.inf) c.appendChild(hearts(p.hearts));
    c.appendChild(h("p", "inv", inv(p.inv)));
    if (btns) {
      var can = !!(o && o.acts && o.acts(pi)), r = h("div", "row"), d = h("button", "small", "Offer draw"), z = h("button", "small", "Resign");
      d.type = z.type = "button"; d.dataset.act = "draw"; z.dataset.act = "resign"; d.dataset.p = z.dataset.p = pi;
      var foe = g.teams[1 - p.team];
      d.disabled = !can || g.offered || !!(foe && foe.out); z.disabled = !can; // nobody is left to answer a draw offer
      r.appendChild(d); r.appendChild(z); c.appendChild(r);
    }
    return c;
  }
  function tbox(g, ti, Game) {
    var t = g.teams[ti], d = tint(g, h("div", "tbox" + (!g.over && g.players[g.turn].team === ti ? " on" : "")), ti);
    d.appendChild(h("div", "stripe")); d.appendChild(pname(t.name, t.fmt)); d.appendChild(h("p", "score", fmt(Game.teamScore(g, ti))));
    return d;
  }
  // 2 vs 2: how much each player adds to the team score.
  function board(g, ti, Game) {
    var t = g.teams[ti], tot = Game.teamScore(g, ti), box = h("div"), ol = h("ol"), hd = h("h3");
    fill(hd, [nm(t.name, t.fmt), " leaderboard"]); box.appendChild(hd);
    t.players.slice().sort(function (a, b) { return g.players[b].score - g.players[a].score; }).forEach(function (i) {
      var p = g.players[i], pc = tot ? Math.round(p.score / tot * 100) : 0, li = tint(g, h("li"), ti), bar = h("div", "lbar"), f = h("div"), n = h("span", "ln");
      n.appendChild(nm(p.name, p.fmt)); if (p.out) n.appendChild(h("span", "", gone(p)));
      li.appendChild(h("span", "lp", fmt(p.score) + " pts (" + pc + "%)")); li.appendChild(n);
      f.style.width = pc + "%"; bar.appendChild(f); li.appendChild(bar); ol.appendChild(li);
    });
    box.appendChild(ol);
    return box;
  }
  // The play order decided by the draw. It never changes during the game.
  function orderList(g, box) {
    box.textContent = "";
    if (g.mode === "solo") return;
    var ol = h("ol");
    box.appendChild(h("h3", "", "Turn order"));
    g.order.forEach(function (i) {
      var p = g.players[i], li = tint(g, h("li", (!g.over && g.turn === i ? "now" : "") + (p.out ? " out" : "")), p.team);
      if (!g.over && g.turn === i) li.setAttribute("aria-current", "true");
      li.appendChild(h("i", "dot")); li.appendChild(nm(p.name, p.fmt)); if (p.out) li.appendChild(h("span", "", gone(p)));
      ol.appendChild(li);
    });
    box.appendChild(ol);
  }
  // The line above the wheel ("Ann (Reds)'s turn", "Reds wins: ...").
  function banner(g, sd, el) {
    var solo = g.mode === "solo", two = g.mode === "2v2", p = g.players[g.turn], team = g.teams[p.team];
    fill(el, g.over
      ? (solo ? [nm(p.name, p.fmt), " " + g.reason + "."] : g.winner === null ? ["Draw: " + g.reason] : [nm(g.teams[g.winner].name, g.teams[g.winner].fmt), " wins: " + g.reason])
      : sd ? ["Sudden death: ", nm(p.name, p.fmt), " spins"]
      : two ? [nm(p.name, p.fmt), " (", nm(team.name, team.fmt), ")'s turn"] : [nm(p.name, p.fmt), "'s turn"]);
  }

  // Draws the whole game screen into the page. Game is the rules object (only teamScore is used).
  // o: { tab, sd (true during sudden death), acts(pi) }. Returns the tab that is really shown.
  function paint(g, Game, o) {
    var solo = g.mode === "solo", two = g.mode === "2v2", sb = $("sb"), mini = $("mini"), tabs = $("mtabs").children, tab = o.tab;
    if (solo || (tab === "board" && !two)) tab = "game";
    $("play").dataset.mode = g.mode; $("play").dataset.tab = tab;
    $("scoreboard").hidden = g.mode === "1v1";
    $("sb-title").textContent = two ? "Team Scoreboard" : "";
    sb.className = "teams" + (solo ? " one" : ""); sb.textContent = "";
    if (solo) sb.appendChild(card(g, 0, false, o)); else if (two) { sb.appendChild(tbox(g, 0, Game)); sb.appendChild(tbox(g, 1, Game)); }
    mini.textContent = "";
    if (g.mode === "1v1") g.players.forEach(function (q, i) {
      var c = tint(g, h("span", "mchip" + (!g.over && g.turn === i ? " on" : "")), q.team);
      c.appendChild(h("i", "dot")); c.appendChild(nm(q.name, q.fmt)); c.appendChild(h("span", "", " " + fmt(q.score)));
      if (g.inf) c.appendChild(hearts(q.hearts));
      mini.appendChild(c);
    });
    [0, 1].forEach(function (ti) {
      var cards = $("cards-" + ti), lb = $("lb-" + ti);
      cards.textContent = ""; lb.textContent = "";
      if (solo) return;
      g.teams[ti].players.forEach(function (i) { cards.appendChild(card(g, i, true, o)); });
      if (two) lb.appendChild(board(g, ti, Game));
    });
    orderList(g, $("order-center")); orderList(g, $("order-mobile"));
    for (var k = 0; k < tabs.length; k++) tabs[k].setAttribute("aria-selected", tabs[k].dataset.tab === tab);
    banner(g, o.sd, $("turn")); modeLine(g);
    return tab;
  }

  return { PU:PU, hearts:hearts, h:h, fmt:fmt, pl:pl, nm:nm, fill:fill, tint:tint, paint:paint, card:card, tbox:tbox, board:board, orderList:orderList, banner:banner };
})();
