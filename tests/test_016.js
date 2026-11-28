// 0.1.6: Advanced Mode odds and questions, the saved settings (fonts, background), word counts and what a game accepts.
// Run: node tests/test_016.js
"use strict";
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const store = {};
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const style = { setProperty() {}, removeProperty() {} };
const root = { attrs: {}, style, setAttribute(k, v) { this.attrs[k] = v; } };
const ctx = { localStorage, document: { documentElement: root, querySelector: () => null, addEventListener() {}, getElementById: () => null } };
vm.createContext(ctx);
for (const f of ["web/js/words.js", "web/js/core/wheel.js", "web/js/core/game.js", "web/js/online/session.js", "web/js/advanced.js", "web/js/overlays.js", "web/js/theme.js"])
  vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
const { Wheel, Game, Session, PGAdvanced, Overlays, PGTheme, Words } = ctx;
const slice = (id) => Wheel.slices.find((s) => s.id === id);
const std = { weights: { "very-easy": 34.08, easy: 20.44, normal: 13.63, hard: 10.22, "very-hard": 6.81, "extremely-hard": 5.11, "insanely-hard": 3.41, impossible: 1.7, x2: 1.02, x3: 0.68, shield: 2.56, free: 0.34 } };

// --- 1,400 words in every level, Extreme reads the same list ---
Words.levels().forEach((id) => { assert.strictEqual(Words.count(id, false), 1400); assert.strictEqual(Words.count(id, true), 1400); });
console.log("ok  every level has 1,400 words (11,200 in all), in Default and in Extreme");

// --- odds: without Advanced Mode nothing changes, with it the player's percentages decide ---
assert.strictEqual(Wheel.weight(slice("very-easy"), false), 500);
assert.strictEqual(Wheel.weight(slice("very-easy"), true), 25); // Extreme still flips the standard odds
assert.strictEqual(Wheel.weight(slice("very-easy"), false, std), 34.08);
assert.strictEqual(Wheel.weight(slice("very-easy"), true, std), 1.7); // and the player's level odds
assert.strictEqual(Wheel.weight(slice("shield"), true, std), 2.56); // the power-ups never flip
const sum = (adv, ex) => Wheel.slices.reduce((t, s) => t + Wheel.percent(s, ex, adv), 0);
assert(Math.abs(sum(std, false) - 100) < 1e-9 && Math.abs(sum(null, true) - 100) < 1e-9);
const onlyVE = { weights: Object.fromEntries(Object.keys(std.weights).map((k) => [k, k === "very-easy" ? 100 : 0])) };
const seen = {}; for (let i = 0; i < 20000; i++) { const r = Wheel.pick(false, onlyVE); seen[r.id] = (seen[r.id] || 0) + 1; }
assert(seen["very-easy"] > 19990 && Object.keys(seen).every((k) => k === "very-easy" || k === "egg"), "100% Very Easy: " + JSON.stringify(seen));
assert.strictEqual(Wheel.pick(true, onlyVE).id === "impossible" || Wheel.pick(true, onlyVE).id === "egg", true); // Extreme flips it
const noEgg = Object.assign({ egg: false }, std);
for (let i = 0; i < 20000; i++) assert.notStrictEqual(Wheel.pick(false, noEgg).id, "egg");
assert.strictEqual(Wheel.weight(slice("egg"), false, noEgg), 0);
// the egg keeps its own chance whatever the player sets (the same share as in the standard game)
assert(Math.abs(Wheel.percent(slice("egg"), false, std) - Wheel.percent(slice("egg"), false, null)) < 1e-6);
assert(Wheel.slices.includes(Wheel.pick(false, std))); // the wheel can find the slice it stopped on
console.log("ok  odds: standard, Extreme flip, 100% on one level, and the default chance with the egg on or off");

// --- what a game accepts: only exact, clean odds ---
assert.strictEqual(JSON.stringify(Game.cleanAdv(std).weights), JSON.stringify(std.weights));
assert.strictEqual(Game.cleanAdv({ weights: Object.assign({}, std.weights, { easy: 20.45 }) }), null); // 100.01
assert.strictEqual(Game.cleanAdv({ weights: Object.assign({}, std.weights, { easy: 20.444 }) }), null); // three decimals
assert.strictEqual(Game.cleanAdv({ weights: Object.assign({}, std.weights, { easy: "20.44" }) }), null);
assert.strictEqual(Game.cleanAdv({ weights: Object.assign({}, std.weights, { easy: -1, normal: 34.07 }) }), null);
assert.strictEqual(Game.cleanAdv({ weights: { easy: 100 } }), null);
assert.strictEqual(Game.cleanAdv("x"), null);
assert.strictEqual(JSON.stringify(Game.cleanAdv({ egg: false, questions: "custom", junk: 1 })), JSON.stringify({ egg: false, questions: "custom" }));
const cc = Game.cleanCustom({ hearts: 4, adv: { egg: false, weights: std.weights } });
assert.strictEqual(cc.adv.egg, false); assert.strictEqual(cc.adv.weights.impossible, 1.7);
assert.strictEqual(JSON.stringify(Game.cleanCustom({ hearts: 4 })), JSON.stringify({ hearts: 4, targetScore: 100, time: "normal", levelColors: {} })); // no adv key when unused
const team = (name, players) => ({ name, color: "#e03131", players, pfmt: players.map(() => "") });
const g = Game.create({ mode: "1v1", customOn: true, teams: [team("A", ["A"]), team("B", ["B"])], custom: { adv: { egg: false } } });
assert.strictEqual(g.custom.adv.egg, false);
const plain = Game.create({ mode: "1v1", teams: [team("A", ["A"]), team("B", ["B"])], custom: { adv: { egg: false } } });
assert.strictEqual(plain.custom.adv, undefined); // a game without Custom rules ignores Advanced Mode
// guests never get the odds or the questions in the game picture
assert.strictEqual(Session.cleanCustom({ adv: { egg: false, weights: std.weights } }).adv, undefined);
console.log("ok  a game keeps only exact odds (two decimals, total 100), and only in Custom games");

// --- Advanced Mode storage ---
const sumCents = (w) => Object.values(w).reduce((t, v) => t + Math.round(v * 100), 0);
assert.strictEqual(sumCents(PGAdvanced.DEFAULT_WEIGHTS), 10000);
assert.strictEqual(PGAdvanced.checkWeights(PGAdvanced.DEFAULT_WEIGHTS).ok, true);
assert.strictEqual(PGAdvanced.get().weights["very-easy"], 34.08);
assert.strictEqual(PGAdvanced.enabled(), false); assert.strictEqual(PGAdvanced.forGame(), null);
PGAdvanced.setEnabled(true);
assert.strictEqual(PGAdvanced.forGame(), null); // nothing differs from the standard game yet
const bad = Object.assign({}, std.weights, { easy: 25 });
assert.strictEqual(PGAdvanced.set({ weights: bad }).ok, false);
assert.strictEqual(PGAdvanced.get().weights.easy, 20.44); // nothing was saved
assert.match(PGAdvanced.set({ weights: bad }).error, /105\.00%|add up/);
const mine = Object.assign({}, std.weights, { easy: 10.44, normal: 23.63 });
assert.strictEqual(PGAdvanced.set({ weights: mine }).ok, true);
assert.strictEqual(PGAdvanced.forGame().weights.normal, 23.63);
assert.strictEqual(JSON.parse(store["adv-weights"]).normal, 23.63);
PGAdvanced.set({ eggEnabled: false });
assert.strictEqual(PGAdvanced.forGame().egg, false);
PGAdvanced.setEnabled(false);
assert.strictEqual(PGAdvanced.forGame(), null); // Advanced Mode off: the standard game, whatever is saved
assert.strictEqual(PGAdvanced.resetWeights().ok, true); PGAdvanced.set({ eggEnabled: true });
console.log("ok  odds must total exactly 100%, bad ones are refused without saving, Advanced Mode off means the standard game");

// --- hidden rate unlock, range, and game odds ---
assert.strictEqual(PGAdvanced.unlockHiddenRate(), false);
PGAdvanced.setEnabled(true);
PGAdvanced.setHiddenRate(true);
assert.strictEqual(PGAdvanced.hiddenRateEnabled(), false);
assert.strictEqual(PGAdvanced.unlockHiddenRate(), true);
assert.strictEqual(PGAdvanced.hiddenRateEnabled(), false);
PGAdvanced.setHiddenRate(true);
assert.strictEqual(PGAdvanced.get().eggMultiplier, 1);
assert.strictEqual(PGAdvanced.forGame().eggMultiplier, 1);
store["adv-egg-multiplier"] = "0";
assert.strictEqual(PGAdvanced.get().eggMultiplier, 1);
assert.strictEqual(PGAdvanced.set({ eggMultiplier: 0 }).ok, false);
assert.strictEqual(PGAdvanced.set({ eggMultiplier: 1001 }).ok, false);
assert.strictEqual(PGAdvanced.set({ eggMultiplier: 1.5 }).ok, false);
assert.strictEqual(PGAdvanced.set({ eggMultiplier: 1000 }).ok, true);
const boosted = PGAdvanced.forGame();
assert.strictEqual(Game.cleanAdv(boosted).eggMultiplier, 1000);
assert.strictEqual(Game.cleanAdv({ eggMultiplier: 1001 }), null);
const baseChance = Wheel.percent(slice("egg"), false);
for (const [multiplier, odds] of [[1, 146751], [2, 73376], [1000, 147]]) {
  const rules = { eggMultiplier: multiplier };
  assert(Math.abs(Wheel.percent(slice("egg"), false, rules) - baseChance * multiplier) < 1e-12);
  assert(Math.abs(Wheel.percent(slice("egg"), true, { ...rules, ...std }) - baseChance * multiplier) < 1e-12);
  assert.strictEqual(Wheel.eggOdds(rules), odds);
}
assert.strictEqual(Wheel.weight(slice("egg"), false, { ...boosted, egg: false }), 0);
assert.strictEqual(Game.value(slice("egg")), 0);
assert.strictEqual(Session.cleanExtras({ egg: { odds: 147 } }).egg.odds, 147);
assert.strictEqual(Session.cleanExtras({ egg: { odds: "147" } }).egg.odds, undefined);
assert.strictEqual(PGAdvanced.exportData().eggMultiplier, 1000);
assert.strictEqual(PGAdvanced.importData({ eggMultiplier: 0 }).ok, true);
assert.strictEqual(PGAdvanced.get().eggMultiplier, 1);
PGAdvanced.set({ eggMultiplier: 1000 });
PGAdvanced.setEnabled(false);
assert.strictEqual(PGAdvanced.forGame(), null);
PGAdvanced.setHiddenRate(false);
assert.strictEqual(PGAdvanced.hiddenRateEnabled(), true);
PGAdvanced.setEnabled(true);
assert.strictEqual(PGAdvanced.forGame().eggMultiplier, 1000);
PGAdvanced.setHiddenRate(false);
assert.strictEqual(PGAdvanced.forGame(), null);
assert.strictEqual(PGAdvanced.get().eggMultiplier, 1000);
PGAdvanced.setEnabled(false);
console.log("ok  hidden-rate gates, multiplier bounds, wheel odds and LAN result");

// --- questions and the word list (CSV) ---
const q1 = { word: "apple", meaning: "a fruit, round", wrong: ["a tool", "a car", "a lake"], choices: 4 };
const q2 = { word: "quick", meaning: 'said "fast"', wrong: ["not moving"], choices: 2 };
const q3 = { word: "=SUM(A1)", meaning: "+a formula\nwith a line break" /* line breaks become spaces */, wrong: ["x", "y"], choices: 3 };
assert.strictEqual(PGAdvanced.set({ customQuestions: [q1, q2, q3] }).ok, true);
const csv = PGAdvanced.exportWordlist();
assert(csv.startsWith("word,meaning,wrong1,wrong2,wrong3,choices\r\n"));
assert(/\r\n'=SUM\(A1\),'\+a formula with a line break,x,y,,3\r\n/.test(csv), "formulas are marked so a spreadsheet does not run them: " + JSON.stringify(csv));
PGAdvanced.set({ customQuestions: [] });
const back = PGAdvanced.importWordlist(csv);
assert.strictEqual(back.ok, true); assert.strictEqual(back.count, 3);
const got = PGAdvanced.get().customQuestions;
assert.strictEqual(got[0].meaning, "a fruit, round"); assert.strictEqual(got[1].meaning, 'said "fast"');
assert.strictEqual(got[1].wrong.length, 1); assert.strictEqual(got[2].word, "=SUM(A1)"); assert.strictEqual(got[2].meaning, "+a formula with a line break");
const keep = PGAdvanced.get().customQuestions.length;
for (const [text, why] of [
  ["word,meaning,wrong1,wrong2,wrong3,choices\nonly,one", "short line"],
  ["a,b,c,d,e,f\nx,y,z,,,2", "wrong header"],
  ["word,meaning,wrong1,wrong2,wrong3,choices\nx,y,z,,,3", "3 choices need 2 wrong"],
  ["word,meaning,wrong1,wrong2,wrong3,choices\nx,y,y,,,2", "wrong equals right"],
  ["word,meaning,wrong1,wrong2,wrong3,choices\nx,y,z,,,5", "5 choices"],
  ["word,meaning,wrong1,wrong2,wrong3,choices\n,y,z,,,2", "no word"],
  ["word,meaning,wrong1,wrong2,wrong3,choices\n", "only a header"]
]) { assert.strictEqual(PGAdvanced.importWordlist(text).ok, false, why); }
assert.strictEqual(PGAdvanced.get().customQuestions.length, keep); // a bad file changes nothing
assert.strictEqual(PGAdvanced.importWordlist("word,meaning,wrong1,wrong2,wrong3,choices\r\nx,y,z,,,2").ok, true); // a 2-choice line needs one wrong meaning only
assert.strictEqual(PGAdvanced.set({ customQuestions: new Array(1001).fill(q1) }).ok, false);
const dirty = PGAdvanced.cleanQuestion({ word: "w\u0000\u0007ord", meaning: "m", wrong: ["a"], choices: 2 });
assert.strictEqual(dirty.q.word, "w ord");
store["adv-custom-questions"] = JSON.stringify([{ word: "x", meaning: "y", wrong: [], choices: 4 }]); // a damaged saved list is ignored
vm.runInContext(fs.readFileSync("web/js/advanced.js", "utf8").replace("var PGAdvanced", "var PGAdvanced2"), ctx);
assert.strictEqual(ctx.PGAdvanced2.get().customQuestions.length, 0);
console.log("ok  questions: 2 to 4 choices, CSV round trip (commas, quotes, line breaks, formulas), bad files change nothing");

// --- the player's own questions are asked, level or not ---
PGAdvanced.set({ customQuestions: [q1, q2], questionsMode: "custom" });
const lv = { id: "easy" }, gg = { custom: { adv: { questions: "custom" } } };
const asked = new Set();
for (let i = 0; i < 6; i++) { const p = Overlays.pick(lv, false, gg); asked.add(p.word); assert.strictEqual(p.opts[p.right].t, p.word === "apple" ? q1.meaning : q2.meaning); assert.strictEqual(p.opts.length, p.word === "apple" ? 4 : 2); }
assert.strictEqual(asked.size, 2);
const std1 = Overlays.pick(lv, false, { custom: {} });
assert.strictEqual(std1.opts.length, 4); assert(!asked.has(std1.word)); // no Advanced setup: the built-in words
console.log("ok  Custom questions (2 and 4 choices) are asked instead of the built-in words, and only when the game says so");

// --- fonts and background ---
const T = PGTheme;
T.set({ fontFamily: "jetbrains-mono", fontSize: 2 }); assert.strictEqual(T.get().fontFamily, "jetbrains-mono"); assert.strictEqual(T.get().fontSize, 1.5);
T.set({ fontSize: 0.1 }); assert.strictEqual(T.get().fontSize, 0.75);
T.set({ fontFamily: "comic-sans" }); assert.strictEqual(T.get().fontFamily, "jetbrains-mono");
T.set({ bgBlur: 99 }); assert.strictEqual(T.get().bgBlur, 10);
T.set({ bgBlur: -3 }); assert.strictEqual(T.get().bgBlur, 0);
T.set({ bgType: "color", bgColor: "red" }); assert.strictEqual(T.get().bgColor, "#000000");
T.set({ bgColor: "#336699" }); assert.strictEqual(root.attrs["data-bg"], "color");
T.set({ bgType: "image" }); assert.strictEqual(T.get().bgType, "scheme"); // image without a picture falls back
T.set({ bgType: "image", bgImage: 'data:image/png;base64,AAAA");background:url(//evil' }); assert.strictEqual(T.get().bgImage, null);
T.set({ bgImage: "javascript:alert(1)" }); assert.strictEqual(T.get().bgImage, null);
const pic = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
T.set({ bgType: "image", bgImage: pic, bgFit: "contain" }); assert.strictEqual(T.get().bgType, "image"); assert.strictEqual(root.attrs["data-bg"], "image");
T.set({ bgImage: null }); assert.strictEqual(T.get().bgType, "scheme"); assert.strictEqual(store["bg-image"], undefined); // the word "null" is never saved
assert.strictEqual(T.get().bgImage, null);
console.log("ok  fonts and background: values are clamped, bad colors and pictures are refused, no picture means the scheme background");

// --- saved garbage is ignored when the page loads ---
store["bg-image"] = "data:image/svg+xml;base64,PHN2Zz4="; store["bg-color"] = "javascript"; store["font-size"] = "NaN"; store["bg-type"] = "image"; store["bg-blur"] = "abc";
vm.runInContext(fs.readFileSync("web/js/theme.js", "utf8").replace("var PGTheme", "var PGTheme2"), ctx);
const g2 = ctx.PGTheme2.get();
assert.strictEqual(g2.bgImage, null); assert.strictEqual(g2.bgType, "scheme"); assert.strictEqual(g2.bgColor, "#000000"); assert.strictEqual(g2.fontSize, 1); assert.strictEqual(g2.bgBlur, 0);
console.log("ok  damaged saved settings are ignored on load");
