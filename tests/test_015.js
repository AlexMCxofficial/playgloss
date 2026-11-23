// 0.1.5: Custom mode rules, what guests accept from the network, progress bars, and the host's color for guests.
// Run: node tests/test_015.js
"use strict";
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const ctx = { document: { getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) } };
vm.createContext(ctx);
for (const f of ["web/js/core/wheel.js", "web/js/core/game.js", "web/js/online/session.js", "web/js/view.js"])
  vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
const { Game, Wheel, Session, View } = ctx;
const json = (v) => JSON.stringify(v);
const team = (name, players) => ({ name, color: "#e03131", players, pfmt: players.map(() => "") });
const teams = () => [team("A", ["A1", "A2"]), team("B", ["B1", "B2"])];
const lv = { id: "easy", points: 2, time: 15 };

// --- cleanCustom: anything goes in, a valid setup comes out ---
assert.strictEqual(json(Game.cleanCustom(null)), json({ hearts: 3, targetScore: 100, time: "normal", levelColors: {} }));
const c = Game.cleanCustom({ hearts: 99, targetScore: 5000, time: "nope", levelColors: { easy: "#ABCDEF", hard: "red", bogus: "#000000", "very-easy": "javascript:1" } });
assert.strictEqual(c.hearts, 10); assert.strictEqual(c.targetScore, 1000); assert.strictEqual(c.time, "normal");
assert.strictEqual(json(c.levelColors), json({ easy: "#abcdef" }));
assert.strictEqual(Game.cleanCustom({ hearts: 0 }).hearts, 1);
assert.strictEqual(Game.cleanCustom({ targetScore: 130 }).targetScore, 150);
assert.strictEqual(Game.cleanCustom({ targetScore: 10 }).targetScore, 100);
console.log("ok  custom setup is clamped, rounded and cleaned (hearts 1-10, target 100-1000 by 50, known time, #rrggbb colors)");

// --- time to answer: Very Easy gives the most time, Impossible the least; Normal is the standard game ---
const secs = (t) => Game.seconds({ custom: { time: t } }, { time: 20 });
assert.strictEqual(secs("normal"), 20);
const all = Game.TIMES.map((t) => secs(t[0]));
assert(all.every((v, i) => i === 0 || v < all[i - 1]), "times must shrink from Very Easy to Impossible: " + all);
assert.strictEqual(Game.seconds({ custom: null }, { time: 15 }), 15);
assert(Game.seconds({ custom: { time: "impossible" } }, { time: 15 }) >= 3);
console.log("ok  time to answer shrinks from Very Easy to Impossible, and Normal is unchanged");

// --- hearts exist only with Infinite; a Custom game with Infinite has its own number ---
const plain = Game.create({ mode: "custom", teams: teams(), custom: { hearts: 7, targetScore: 300 } });
assert.strictEqual(plain.players[0].hearts, undefined);
Game.answer(plain, lv, false);
assert.strictEqual(plain.players[0].out, false);
const inf = Game.create({ mode: "custom", teams: teams(), infinite: true, custom: { hearts: 7 } });
assert.strictEqual(inf.players[0].hearts, 7);
Game.answer(inf, lv, false);
assert.strictEqual(inf.players[0].hearts, 6);
const std = Game.create({ mode: "2v2", teams: teams(), infinite: true, custom: { hearts: 9, targetScore: 900 } });
assert.strictEqual(std.players[0].hearts, 3); assert.strictEqual(Game.targetOf(std), 100); // custom is ignored outside Custom mode
console.log("ok  hearts only exist with Infinite (Custom picks how many); other modes ignore the custom setup");

// --- target score ---
const t300 = Game.create({ mode: "custom", teams: teams(), custom: { targetScore: 300 } });
t300.players[0].score = 150; t300.players[2].score = 100;
for (let i = 0; i < 4; i++) { const r = Game.endTurn(t300); assert.strictEqual(r, "next"); }
t300.players[0].score = 310;
let last; for (let i = 0; i < 4; i++) last = Game.endTurn(t300);
assert.strictEqual(last, "win"); assert.strictEqual(t300.winner, 0);
console.log("ok  Custom target score decides when a round ends the game");

// --- progress bar ---
const p = Game.create({ mode: "solo", teams: [team("Solo", ["Me"])] });
assert.strictEqual(View.progress(p, [0]), 0);
p.players[0].score = 50; assert.strictEqual(View.progress(p, [0]), .5);
p.players[0].score = 400; assert.strictEqual(View.progress(p, [0]), 1);
const ct = Game.create({ mode: "custom", teams: teams(), custom: { targetScore: 400 } });
ct.players[0].score = 100; ct.players[1].score = 100; // team A has 200 of 400
assert.strictEqual(View.progress(ct, ct.teams[0].players), .5);
const ih = Game.create({ mode: "solo", teams: [team("Solo", ["Me"])], infinite: true });
assert.strictEqual(View.progress(ih, [0]), 1); // Infinite: full to start with
ih.players[0].hearts = 2; assert(Math.abs(View.progress(ih, [0]) - 2 / 3) < 1e-9);
ih.players[0].hearts = 0; assert.strictEqual(View.progress(ih, [0]), 0);
const ih5 = Game.create({ mode: "custom", teams: teams(), infinite: true, custom: { hearts: 5 } });
ih5.players[0].hearts = 4; ih5.players[1].hearts = 5; // team A has 9 of 10 hearts
assert(Math.abs(View.progress(ih5, ih5.teams[0].players) - .9) < 1e-9);
console.log("ok  progress bar: points toward the goal, or (Infinite) hearts left out of all hearts");

// --- what a guest accepts ---
const bad = { bad: () => false };
const snapOf = (g) => JSON.parse(JSON.stringify(g));
let s = Session.cleanSnap(snapOf(inf), bad);
assert(s && s.inf && s.custom.hearts === 7 && s.players[0].hearts === 6);
const evil = snapOf(plain); evil.custom.levelColors = { easy: '"/><script>alert(1)</script>', hard: "#12ab34" }; evil.custom.hearts = "lots"; evil.custom.time = "<b>";
s = Session.cleanSnap(evil, bad);
assert(s); assert.strictEqual(json(s.custom.levelColors), json({ hard: "#12ab34" })); assert.strictEqual(s.custom.hearts, 3); assert.strictEqual(s.custom.time, "normal");
const faked = snapOf(Game.create({ mode: "2v2", teams: teams() })); faked.custom = { levelColors: { easy: "#ff0000" }, hearts: 10 };
assert.strictEqual(json(Session.cleanSnap(faked, bad).custom.levelColors), "{}"); // only Custom games can recolor the wheel
const tooMany = snapOf(inf); tooMany.players[0].hearts = 8; // more than the 7 this game started with
assert.strictEqual(Session.cleanSnap(tooMany, bad), null);
console.log("ok  guests accept only clean hearts, target, time and #rrggbb wheel colors (nothing can reach the wheel's SVG)");

// --- the rules the lobby tells guests ---
assert.strictEqual(json(Session.cleanRules({ extreme: true, color: "extreme" })), json({ extreme: true, inf: false, color: "extreme" }));
assert.strictEqual(Session.cleanRules({ color: "<x>" }).color, "default");
const r = Session.cleanRules({ inf: true, custom: { hearts: 4, targetScore: 250, time: "hard", levelColors: { easy: "#000000" } } });
assert.strictEqual(json(r.custom), json({ hearts: 4, targetScore: 250, time: "hard" })); // colors are not part of the lobby message
assert.strictEqual(View.runText(r), "Custom - Default, Infinite (4 hearts), time to answer: Hard");
assert.strictEqual(View.runText({ extreme: true, inf: false, color: "default" }), "Extreme");
assert.strictEqual(View.runText({ extreme: false, inf: false, color: "extreme", custom: { hearts: 3, targetScore: 400, time: "normal" } }), "Custom - Default, target 400 points, Extreme look for guests");
console.log("ok  lobby rules carry the mode, hearts, target, time and the guests' color");

// --- wheel colors: looks only ---
const sl = Wheel.getSlices({ easy: "#ffff00", "very-easy": "nope", egg: "#ff0000" });
const easy = sl.find((x) => x.id === "easy");
assert.strictEqual(easy.color, "#ffff00"); assert.strictEqual(easy.ink, "#000"); assert.strictEqual(easy.weight, 300); assert.strictEqual(easy.points, 2);
assert.strictEqual(sl.find((x) => x.id === "very-easy").color, "#8bd88b");
assert.strictEqual(sl.find((x) => x.id === "egg").color, "#5b6170"); // specials keep their look
assert.strictEqual(Wheel.getSlices({ easy: "#101010" }).find((x) => x.id === "easy").ink, "#fff");
console.log("ok  wheel colors change only the look of the eight level slices");

// --- the host's color for guests (theme.js) ---
const data = {}, style = { setProperty() {}, removeProperty() {} };
const root = { attrs: {}, style, setAttribute(k, v) { this.attrs[k] = v; } };
const tctx = { document: { documentElement: root, querySelector() { return null; }, addEventListener() {} }, localStorage: { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } } };
vm.createContext(tctx);
vm.runInContext(fs.readFileSync("web/js/theme.js", "utf8"), tctx, { filename: "theme.js" });
const T = tctx.PGTheme;
T.set({ scheme: "yaru", theme: "dark" });
T.force("extreme");
assert.strictEqual(root.attrs["data-scheme"], "extreme");
assert.strictEqual(T.get().scheme, "yaru"); assert.strictEqual(data.scheme, "yaru"); // nothing is saved
T.set({ theme: "light" });
assert.strictEqual(root.attrs["data-scheme"], "yaru"); assert.strictEqual(root.attrs["data-theme"], "light"); // Light is allowed
T.set({ theme: "dark" });
assert.strictEqual(root.attrs["data-scheme"], "extreme"); // Dark brings the forced look back
T.force(null);
assert.strictEqual(root.attrs["data-scheme"], "yaru");
T.force("neon"); assert.strictEqual(root.attrs["data-scheme"], "yaru"); // only Extreme can be forced
console.log("ok  the host's Extreme look is never saved, Light still works and Dark brings it back");

// --- a Custom game snapshot stays small enough for the relay (host to guest limit is 20000 characters) ---
const colorsAll = {}; Game.LEVELS.forEach((id) => { colorsAll[id] = "#abcdef"; });
const big = Game.create({ mode: "custom", teams: [team("N".repeat(16), ["P".repeat(16), "Q".repeat(16)]), team("M".repeat(16), ["R".repeat(16), "S".repeat(16)])], infinite: true, custom: { hearts: 10, levelColors: colorsAll } });
assert(JSON.stringify({ t: "snap", g: big, msg: "x".repeat(200) }).length < 5000);
console.log("ok  a Custom game picture is small");
