// Custom rules are a switch on Solo, 1 vs 1 and 2 vs 2 (not a separate mode).
// Run: node tests/test_custom_modes.js
"use strict";
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const ctx = { document: { getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) } };
vm.createContext(ctx);
for (const f of ["web/js/core/wheel.js", "web/js/core/game.js", "web/js/online/session.js", "web/js/view.js"])
  vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
const { Game, Session } = ctx;
const side = (name, players) => ({ name, color: "#e03131", players, pfmt: players.map(() => "") });
const custom = { hearts: 5, targetScore: 150, time: "hard", levelColors: {} };
const bad = { bad: () => false };

// Solo with Custom rules: target score and time apply
let g = Game.create({ mode: "solo", teams: [side("Me", ["Me"])], customOn: true, custom });
assert.strictEqual(g.mode, "solo"); assert.strictEqual(g.customOn, true);
assert.strictEqual(Game.targetOf(g), 150);
g.players[0].score = 120; assert.strictEqual(Game.endTurn(g), "next");
g.players[0].score = 150; assert.strictEqual(Game.endTurn(g), "win");
console.log("ok  Solo with Custom rules uses its own target score");

// Solo without Custom rules is the standard game
g = Game.create({ mode: "solo", teams: [side("Me", ["Me"])] });
assert.strictEqual(g.customOn, false); assert.strictEqual(Game.targetOf(g), 100);
console.log("ok  Solo without Custom rules keeps the standard 100 points");

// 1 vs 1 with Custom rules and hearts
g = Game.create({ mode: "1v1", teams: [side("A", ["A"]), side("B", ["B"])], infinite: true, customOn: true, custom });
assert.strictEqual(g.customOn, true); assert.strictEqual(g.players[0].hearts, 5);
let snap = Session.cleanSnap(JSON.parse(JSON.stringify(g)), bad);
assert(snap, "a custom 1 vs 1 picture is accepted"); assert.strictEqual(snap.mode, "1v1"); assert.strictEqual(snap.customOn, true);
assert.strictEqual(snap.players[0].hearts, 5);
console.log("ok  1 vs 1 with Custom rules (hearts) survives the guest picture");

// 2 vs 2 with Custom rules, and the old "custom" mode becomes a custom 2 vs 2
const two = () => [side("A", ["A1", "A2"]), side("B", ["B1", "B2"])];
g = Game.create({ mode: "2v2", teams: two(), customOn: true, custom });
assert.strictEqual(g.customOn, true); assert.strictEqual(Session.cleanSnap(JSON.parse(JSON.stringify(g)), bad).customOn, true);
g = Game.create({ mode: "custom", teams: two(), customOn: true, custom });
assert.strictEqual(g.mode, "2v2"); assert.strictEqual(g.customOn, true);
const legacy = JSON.parse(JSON.stringify(g)); legacy.mode = "custom"; delete legacy.customOn;
snap = Session.cleanSnap(legacy, bad);
assert.strictEqual(snap.mode, "2v2"); assert.strictEqual(snap.customOn, true);
console.log("ok  2 vs 2 with Custom rules, and the old custom mode is a custom 2 vs 2");

// A game without the switch cannot carry custom settings over the network
g = Game.create({ mode: "1v1", teams: [side("A", ["A"]), side("B", ["B"])] });
const forged = JSON.parse(JSON.stringify(g)); forged.custom = { hearts: 9, targetScore: 1000, time: "impossible", levelColors: {} };
snap = Session.cleanSnap(forged, bad);
assert.strictEqual(snap.customOn, false); assert.strictEqual(snap.custom.targetScore, 100);
console.log("ok  a game without Custom rules ignores forged custom settings");

// Lobby rules for a custom 1 vs 1 reach the guests
const r = Session.cleanRules({ extreme: false, inf: false, color: "default", custom: { hearts: 4, targetScore: 200, time: "easy" } });
assert.strictEqual(r.custom.targetScore, 200);
console.log("ok  lobby rules carry Custom settings");
