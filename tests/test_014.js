// 0.1.4 mode rules: the level odds flip, the specials stay identical, and Infinite uses hearts instead of 100 points.
"use strict";
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const ctx = {}; vm.createContext(ctx);
for (const f of ["web/js/core/wheel.js", "web/js/core/game.js", "web/js/online/session.js"])
  vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename:f });

const slices = ctx.Wheel.slices;
const level = (id) => slices.find((x) => x.id === id);
assert.strictEqual(ctx.Wheel.weight(level("very-easy"), false), 500);
assert.strictEqual(ctx.Wheel.weight(level("very-easy"), true), 25);
assert.strictEqual(ctx.Wheel.weight(level("impossible"), false), 25);
assert.strictEqual(ctx.Wheel.weight(level("impossible"), true), 500);
for (const id of ["x2", "x3", "shield", "free", "egg"])
  assert.strictEqual(ctx.Wheel.weight(level(id), true), ctx.Wheel.weight(level(id), false), `${id} must not change`);
assert.strictEqual(ctx.Wheel.total, slices.reduce((a, x) => a + x.weight, 0));
console.log("ok  Extreme reverses the level weights, but not the specials or egg odds");

const team = (name, players) => ({ name, color:"#1565c0", players });
const solo = ctx.Game.create({ mode:"solo", infinite:true, teams:[team("Me", ["Me"])] });
assert.strictEqual(solo.players[0].hearts, 3);
const lv = { points:15 };
for (let i=0;i<3;i++) {
  ctx.Game.answer(solo, lv, false);
  const r = ctx.Game.endTurn(solo);
  assert.strictEqual(solo.players[0].hearts, 2-i);
  if (i<2) assert.strictEqual(r,"next"); else assert.strictEqual(r,"win");
}
assert.strictEqual(solo.over,true);
assert.strictEqual(solo.turns,3);
console.log("ok  Solo Infinite ends only after three wrong answers and shows hearts");

const oneVsOne = ctx.Game.create({ mode:"1v1", infinite:true, teams:[team("A",["A"]),team("B",["B"])] });
oneVsOne.players[0].hearts = 1;
oneVsOne.players[0].score = 1;
oneVsOne.players[1].score = 2;
ctx.Game.answer(oneVsOne, lv, false);
assert.strictEqual(ctx.Game.endTurn(oneVsOne),"win");
assert.strictEqual(oneVsOne.players[0].out,true);
assert.strictEqual(oneVsOne.teams[0].out,true);
assert.strictEqual(oneVsOne.winner,1);
console.log("ok  Online-style Infinite game removes the out player and ends when the other side is ahead");

const teamGame = ctx.Game.create({ mode:"2v2", infinite:true, teams:[team("A",["A1","A2"]),team("B",["B1","B2"])] });
teamGame.players[0].score = 150; // Infinite has no 100-point win condition
assert.strictEqual(ctx.Game.endTurn(teamGame),"next");
assert.strictEqual(teamGame.over,false);
console.log("ok  Infinite does not trigger a score goal or sudden death");

const snap = ctx.Session.cleanSnap(Object.assign({}, oneVsOne), { bad:() => false });
assert(snap && snap.inf && snap.players[0].hearts === 0 && snap.players[0].dead);
assert.strictEqual(JSON.stringify(ctx.Session.cleanRules({ extreme:true, inf:true })), JSON.stringify({ extreme:true, inf:true }));
console.log("ok  Online game snapshots preserve modes and hearts");

// Settings: mode automatically follows Extreme's look, but a separately chosen Extreme color stays independent.
const style = { values:{}, setProperty(k,v){this.values[k]=v;}, removeProperty(k){delete this.values[k];} };
const root = { attrs:{}, style, setAttribute(k,v){this.attrs[k]=v;} };
const data = {};
const themeCtx = { document:{ documentElement:root, querySelector(){return null;}, addEventListener(){} }, localStorage:{ getItem(k){return data[k] ?? null;}, setItem(k,v){data[k]=String(v);} } };
vm.createContext(themeCtx);
for (const f of ["web/js/theme.js", "web/js/modes.js"])
  vm.runInContext(fs.readFileSync(f, "utf8"), themeCtx, { filename:f });
themeCtx.PGMode.set({ mode:"extreme" });
assert.strictEqual(themeCtx.PGTheme.get().scheme,"extreme");
themeCtx.PGMode.set({ mode:"default" });
assert.strictEqual(themeCtx.PGTheme.get().scheme,"playgloss");
themeCtx.PGTheme.set({ scheme:"extreme" });
themeCtx.PGMode.set({ mode:"extreme" });
themeCtx.PGMode.set({ mode:"default" });
assert.strictEqual(themeCtx.PGTheme.get().scheme,"extreme");
console.log("ok  Mode changes set and restore the look without overriding a separately chosen color");

