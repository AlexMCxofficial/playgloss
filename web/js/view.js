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
  // Infinite mode: one picture per heart (3, or up to 10 in a Custom game), the lost ones grey. The picture is from the
  // Minecraft Wiki (see CREDITS.md).
  function hearts(n, max) {
    max = Math.max(1, Math.min(10, Math.floor(Number(max)) || 3));
    n = Math.max(0, Math.min(max, Math.floor(Number(n)) || 0));
    var box = h("span", "hearts" + (max > 5 ? " many" : ""));
    box.setAttribute("role", "img"); box.setAttribute("aria-label", n + " of " + max + " hearts");
    for (var i = 0; i < max; i++) {
      var im = h("img", "heart" + (i < n ? "" : " lost"));
      im.src = "img/heart.png"; im.alt = ""; im.width = 27; im.height = 27;
      box.appendChild(im);
    }
    return box;
  }
  var maxHearts = function (g) { return g.custom && g.custom.hearts ? g.custom.hearts : 3; };
  var target = function (g) { return g.custom && g.custom.targetScore ? g.custom.targetScore : 100; };

  // How full the progress bar of a side is, from 0 to 1. ids: the player numbers the bar is about.
  //  - Default and Extreme (and Custom without Infinite): points toward the goal, 0 empty and the goal (100, or the
  //    Custom target score) full.
  //  - Infinite: the other way round. The bar starts full and every lost heart takes away one share of it
  //    (a third with 3 hearts, a tenth with 10).
  function progress(g, ids) {
    if (!ids.length) return 0;
    var f;
    if (g.inf) {
      var left = 0; ids.forEach(function (i) { left += Math.max(0, Number(g.players[i].hearts) || 0); });
      f = left / (maxHearts(g) * ids.length);
    } else {
      var pts = 0; ids.forEach(function (i) { pts += g.players[i].score; });
      f = pts / target(g);
    }
    return Math.max(0, Math.min(1, f));
  }
  // The bar above a name: a track in the side's color that fills from left to right. It shows no number.
  function stripe(g, ids) {
    var f = progress(g, ids), bar = h("div", "stripe"), fill = h("div", "fill");
    bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-label", g.inf ? "Hearts left" : "Progress toward the goal");
    bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", "100"); bar.setAttribute("aria-valuenow", String(Math.round(f * 100)));
    fill.style.width = (f * 100) + "%";
    bar.appendChild(fill);
    return bar;
  }
  // The rules of a game in words, for the lobby and the setup page. r is { extreme, inf, custom? } (see Session.cleanRules).
  function runText(r) {
    if (!r) return "";
    var c = r.custom, parts = [r.extreme ? "Extreme" : "Default"];
    if (r.inf) parts.push("Infinite" + (c ? " (" + c.hearts + (c.hearts === 1 ? " heart" : " hearts") + ")" : ""));
    else if (c) parts.push("target " + c.targetScore + " points");
    if (c && c.time && c.time !== "normal") {
      var t = Game.TIMES.filter(function (x) { return x[0] === c.time; })[0];
      if (t) parts.push("time to answer: " + t[1]);
    }
    if (r.color === "extreme") parts.push("Extreme look for guests");
    return (c ? "Custom - " : "") + parts.join(", ");
  }
  // The small line above the turn banner: which mode this game is played in.
  function modeLine(g) {
    var el = $("modeline");
    if (!el) return;
    var parts = [];
    if (g.customOn || g.mode === "custom") parts.push("Custom");
    if (g.extreme) parts.push("Extreme");
    if (g.inf) parts.push("Infinite");
    el.textContent = parts.join(" - ");
    el.hidden = !parts.length;
  }
  // o.acts(pi): true if the buttons of player pi may be used right now (by this device).
  function card(g, pi, btns, o) {
    var p = g.players[pi], on = !g.over && g.turn === pi, c = tint(g, h("div", "pcard" + (on ? " on" : "") + (p.out ? " out" : "")), p.team);
    // Infinite: the bar is this player's own hearts. Otherwise it is the whole side's progress toward the goal.
    c.appendChild(stripe(g, g.inf ? [pi] : g.teams[p.team].players));
    c.appendChild(pname(p.name, p.fmt, p.out, p.dead));
    c.appendChild(h("p", "score", fmt(p.score)));
    if (g.inf) c.appendChild(hearts(p.hearts, maxHearts(g)));
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
    d.appendChild(stripe(g, t.players)); d.appendChild(pname(t.name, t.fmt)); d.appendChild(h("p", "score", fmt(Game.teamScore(g, ti))));
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
    var solo = g.mode === "solo", two = g.mode === "2v2" || g.mode === "custom", p = g.players[g.turn], team = g.teams[p.team];
    fill(el, g.over
      ? (solo ? [nm(p.name, p.fmt), " " + g.reason + "."] : g.winner === null ? ["Draw: " + g.reason] : [nm(g.teams[g.winner].name, g.teams[g.winner].fmt), " wins: " + g.reason])
      : sd ? ["Sudden death: ", nm(p.name, p.fmt), " spins"]
      : two ? [nm(p.name, p.fmt), " (", nm(team.name, team.fmt), ")'s turn"] : [nm(p.name, p.fmt), "'s turn"]);
  }

  // Draws the whole game screen into the page. Game is the rules object (only teamScore is used).
  // o: { tab, sd (true during sudden death), acts(pi) }. Returns the tab that is really shown.
  function paint(g, Game, o) {
    var solo = g.mode === "solo", two = g.mode === "2v2", isCustom = g.mode === "custom", sb = $("sb"), mini = $("mini"), tabs = $("mtabs").children, tab = o.tab;
    var hasTeams = two || isCustom;
    if (solo || (tab === "board" && !hasTeams)) tab = "game";
    $("play").dataset.mode = g.mode; $("play").dataset.tab = tab;
    $("scoreboard").hidden = g.mode === "1v1";
    $("sb-title").textContent = hasTeams ? "Team Scoreboard" : "";
    sb.className = "teams" + (solo ? " one" : ""); sb.textContent = "";
    if (solo) sb.appendChild(card(g, 0, false, o)); else if (hasTeams) { sb.appendChild(tbox(g, 0, Game)); sb.appendChild(tbox(g, 1, Game)); }
    mini.textContent = "";
    if (g.mode === "1v1") g.players.forEach(function (q, i) {
      var c = tint(g, h("span", "mchip" + (!g.over && g.turn === i ? " on" : "")), q.team);
      c.appendChild(h("i", "dot")); c.appendChild(nm(q.name, q.fmt)); c.appendChild(h("span", "", " " + fmt(q.score)));
      if (g.inf) c.appendChild(hearts(q.hearts, maxHearts(g)));
      mini.appendChild(c);
    });
    [0, 1].forEach(function (ti) {
      var cards = $("cards-" + ti), lb = $("lb-" + ti);
      cards.textContent = ""; lb.textContent = "";
      if (solo) return;
      g.teams[ti].players.forEach(function (i) { cards.appendChild(card(g, i, true, o)); });
      if (hasTeams) lb.appendChild(board(g, ti, Game));
    });
    orderList(g, $("order-center")); orderList(g, $("order-mobile"));
    for (var k = 0; k < tabs.length; k++) tabs[k].setAttribute("aria-selected", tabs[k].dataset.tab === tab);
    banner(g, o.sd, $("turn")); modeLine(g);
    return tab;
  }

  return { PU:PU, runText:runText, hearts:hearts, progress:progress, stripe:stripe, h:h, fmt:fmt, pl:pl, nm:nm, fill:fill, tint:tint, paint:paint, card:card, tbox:tbox, board:board, orderList:orderList, banner:banner };
})();
