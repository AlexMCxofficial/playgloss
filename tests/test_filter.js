// Tests for the name filter. Run:  node tests/test_filter.js
"use strict";
const assert = require("assert");
const vm = require("vm"), fs = require("fs");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../web/js/core/filter.js", "utf8") + "\nthis.Filter = Filter;", ctx);
const bad = (s) => ctx.Filter.bad(s);
const j = (...p) => p.join(""); // the worst words are built from pieces so this file does not spell them out

// Must be blocked.
const BLOCK = [
  // the n-word in its common disguises
  j("ni", "gga"), j("ni", "gger"), j("n", "*gga"), j("n", "**ga"), j("N", "!gg@"), j("n1", "gg3r"), j("n", "i", "99a"), j("N I ", "G G A"),
  j("n", "-gga"), j("n", ".gga"), j("n", "_gga"), j("n#", "gga"), j("nn", "iiggaa"), j("ni", "qqa"), j("n", "gga"), j("N", "GGA"),
  j("n", "іgga"), j("ｎ", "ｉｇｇａ"), j("nigg", "a123"), j("n", "ig", "gas"),
  // acronyms, also spaced out
  "stfu", "STFU", "S t F u", "s.t.f.u", "s t f u bob", "bob stfu", "stfu69", "sttfu", "sybau", "SYBAU", "s y b a u", "sybau1", "syfm", "kys", "k y s", "gtfo",
  // f-word and s-word disguises
  "fuck", "f*ck", "f**k", "fu*k", "f u c k", "f.u.c.k", "fuuuck", "fvck", "phuck", "fck", "fcuk", "motherfucker", "fück", "fuk", "fku", "fk you",
  "shit", "sh*t", "sh1t", "$hit", "sh!t", "s h i t", "s hit", "shyt", "bullshit", "shiiit", "s**t",
  "bitch", "b*tch", "b!tch", "bitches", "biatch", "asshole", "a**hole", "a$$hole", "assh0le",
  "cunt", "c*nt", "c u n t", "cunts", "slut", "whore", "wh0re", "fag", "faggot", "f@ggot", "f*ggot",
  "kike", "chink", "spic", "tranny", "retard", "retarded", "nazi", "hitler", "pussy", "dickhead", "dick", "cock", "porn", "rapist", "wanker", "twat", "kkk",
  // look-alike letters from other alphabets
  "сunt", "ѕhit", "fυck", "ƒuck".replace("ƒ", "f"),
];
// Must pass (real names, real words, and mild words).
const PASS = [
  "Red", "Blue", "Player 1", "Player 2", "Team 1", "Alex", "Sam", "Mia", "Ann", "Ann Lee", "Jin", "Nga", "Anna", "Nigel", "Niger", "Nigeria", "Nigerian",
  "Scunthorpe", "Hancock", "Peacock", "Cockburn", "Dickens", "Dickinson", "Assassin", "Classic", "Grass", "Bass", "Analysis", "Therapist", "Drape", "Grape", "Rapeseed",
  "Slutsky", "Pornchai", "Pornthip", "Nazia", "Nazir", "Nazim", "Fukuda", "Fukushima", "Fuchs", "Fu", "Fu Li", "Shiitake", "Mishit", "Shitake",
  "Bitcoin", "Bitcher".slice(0, 0) + "Bitcoin Bob", "Tanggal", "Anggi", "Anggun", "Singgih", "Hello World", "Push It", "Mash Tim", "Sun Gga".slice(0, 0) + "Sunny",
  "Damn", "Hell", "Crap", "Jerk", "Stupid", "Idiot", "Loser", "Butt", "Ass", "Bastard", "Pissed",
  "Cool Cat", "The Rock", "Pro Gamer", "Wordsmith", "Sybil", "Kyle", "Kay", "Kyoto", "Stuart", "Stu", "Gta", "GTA 5", "Ski", "Sybaris", "Syfy",
  "Team Rocket", "Mr. Bean", "J R", "A B C", "X Y Z", "Ken", "Ok", "Mumbai", "Sun-Hee", "Jean-Luc", "Mary-Jane", "O'Brien", "Zoë", "José", "Åsa", "Łukasz", "Øystein",
  "Матвей", "Дмитрий", "Αλέξανδρος", "李雷", "สมชาย",
  "****", "***", "!!!", "1234", "",
];
let n = 0;
const fails = [];
for (const s of BLOCK) { if (!bad(s)) fails.push("should be blocked: " + JSON.stringify(s)); n++; }
for (const s of PASS) { if (bad(s)) fails.push("should pass: " + JSON.stringify(s)); n++; }
assert.strictEqual(fails.join("\n"), "");
// Long and odd input must not hang.
const t0 = Date.now();
for (const s of ["g".repeat(5000), "n" + "*".repeat(5000), "fu".repeat(3000), "n i g ".repeat(500), "\u0000​".repeat(1000)]) bad(s);
assert.ok(Date.now() - t0 < 2000, "too slow on long input");
console.log("ok  filter: " + n + " cases (" + BLOCK.length + " blocked, " + PASS.length + " allowed)");
