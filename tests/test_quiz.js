// Spectator-mode game rules and encrypted room flow. Run: node tests/test_quiz.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
function load(file, name) {
  return new Function(fs.readFileSync(path.join(__dirname, "../web/js", file), "utf8") + "\nreturn " + name)();
}
global.nacl = require("../web/js/vendor/nacl-fast.min.js");
global.Proto = require("../web/js/online/proto");
global.Filter = load("core/filter.js", "Filter");
global.PGQuiz = require("../web/js/online/quiz");
const Room = require("../web/js/online/quiz-room");
const Link = require("../web/js/online/link");
global.Game = load("core/game.js", "Game");
global.Wheel = load("core/wheel.js", "Wheel");
global.PGAdvanced = require("../web/js/advanced");
const levels = Wheel.slices.slice(0, 8);
const words = load("words.js", "Words");
const defaults = PGQuiz.defaults(128);
const weights = Object.fromEntries(levels.map((lv, i) => [lv.id, i === 2 ? 100 : 0]));
const base = { prompt: "Capital of France?", format: "choice", points: 100, multiplier: 2,
  options: ["Paris", "Berlin", "Warsaw"], correct: [0] };
const tick = { ...base, prompt: "Pick the prime numbers", format: "tick", options: ["2", "4", "7"], correct: [0, 2] };
const pairs = { ...base, prompt: "Match the numbers", format: "pairs",
  pairs: [["One", "1"], ["Two", "2"], ["Three", "3"]], multiplier: 3 };

assert.equal(defaults.approve, true);
assert.equal(defaults.tiers, true);
assert.equal(defaults.previewSeconds, 10);
assert.equal(defaults.podium, true);
assert.equal(defaults.timed, false);
const custom = { ...defaults, tiers: false, maxPlayers: 2, questions: [base, tick, pairs] };
const ruleSet = { extreme: false, time: "normal", levelColors: {}, weights: PGQuiz.tierWeights() };
assert.equal(Object.values(ruleSet.weights).reduce((sum, n) => sum + Math.round(n * 100), 0), 10000);
const exported = PGQuiz.file("quiz-config", { ...custom, rules: ruleSet });
assert.deepEqual(PGQuiz.readFile(exported, "quiz-config", 128).questions.map(q => q.format), ["choice", "tick", "pairs"]);
assert.throws(() => PGQuiz.readFile(exported, "quiz-config", 1), /Max players/);
const maxSet = Array.from({ length: 1000 }, () => pairs);
assert.equal(PGQuiz.readFile(PGQuiz.file("quiz-questions", maxSet), "quiz-questions", 2).length, 1000);
assert.throws(() => PGQuiz.readFile(PGQuiz.file("quiz-questions", []), "quiz-questions"), /Question count/);
assert.throws(() => PGQuiz.readFile(PGQuiz.file("quiz-questions", [...maxSet, base]), "quiz-questions"), /Question count/);
assert.throws(() => PGQuiz.question({ ...base, correct: [1, 2] }), /Correct answer count/);
assert.throws(() => PGQuiz.question({ ...tick, correct: [2, 2] }), /once/);
assert.throws(() => PGQuiz.question({ ...pairs, pairs: [["A", "0"], ["B", "0"]] }), /distinct/);
assert.throws(() => PGQuiz.question({ ...base, format: ["choice"] }), /format/);
assert.deepEqual(PGQuiz.grade(PGQuiz.customQuestion(base, Math.random), [0], true, 10000, 20000), { correct: true, points: 150 });
assert.deepEqual(PGQuiz.grade(PGQuiz.customQuestion(tick, Math.random), [2, 0], false, 0, 20000), { correct: true, points: 200 });
const match = PGQuiz.customQuestion(pairs, () => 0);
assert.deepEqual(match.correct.map(i => match.options[i]), ["1", "2", "3"]);
assert.equal(PGQuiz.validAnswer(match, [1, 1, 0]), false);
assert.equal(PGQuiz.grade(match, match.correct.slice().reverse(), false, 0, 20000).correct, false);
const link = Link.parse("http://192.168.1.23:40000/quiz-join.html#" + "A".repeat(43));
assert.equal(link.page, "quiz-join.html");
assert.equal(Link.appUrl(link), "quiz-join.html?h=192.168.1.23%3A40000#" + "A".repeat(43));

for (const format of Object.keys(PGQuiz.FORMATS)) {
  const ids = Array.from({ length: 128 }, (_, i) => i);
  const set = PGQuiz.assignWords(ids, words, levels[2], { ...defaults, format }, false, Math.random);
  assert.equal(set.size, 128);
  assert.equal(new Set([...set.values()].map(q => q.left ? q.left.join(",") : q.prompt)).size, 128);
  for (const q of set.values()) {
    assert.equal(q.options.length, 4);
    assert.equal(q.points, levels[2].points);
    assert(!Object.hasOwn(PGQuiz.publicQuestion(q, false), "correct"));
    assert(!Object.hasOwn(PGQuiz.publicQuestion(q, true), "options"));
  }
}

const rankingPlayers = Array.from({ length: 6 }, (_, i) => ({
  id: i, name: "Player " + i, score: 60 - i, streak: i < 2 ? 3 : 0, order: i
}));
const ranking = PGQuiz.standings(rankingPlayers, new Map([[0, 2], [1, 1]]), true, () => 0.75);
assert.equal(ranking.rows.length, 5);
assert.equal(ranking.rows[0].move, 1);
assert.equal(ranking.rows[1].move, -1);
assert.equal(ranking.highest.name, "Player 1");
assert.equal(PGQuiz.standings(rankingPlayers, new Map(), false, () => 0).highest, null);
console.log("ok  configuration, 1,000-question import, formats, scoring, links and 128 distinct questions per tier");

function harness(settings, eggRules, random = () => 0.4) {
  const out = new Map(), dropped = new Set();
  let time = 1000;
  const room = new Room({ settings, levels, words, rules: { extreme: false, weights }, eggRules, random,
    now: () => time, seconds: () => 20, spinMs: 1, change: () => {},
    send(id, value) {
      if (!out.has(id)) out.set(id, []);
      out.get(id).push(value);
    },
    drop(id) { dropped.add(id); }
  });
  function join(name, token) {
    const guest = Proto.guestHello(room.key, []);
    const sendRaw = (text) => room.receive(guest.id, text);
    sendRaw(guest.text);
    const channel = Proto.guestAnswer(room.key, guest.pair, out.get(guest.id).shift()).chan;
    const send = (msg) => sendRaw(channel.send(msg));
    const read = () => out.get(guest.id).splice(0).map(t => channel.recv(t));
    send({ t: "join", name, token });
    return { id: guest.id, send, read };
  }
  return { room, join, dropped, advance(ms) { time += ms; } };
}

const h = harness(custom);
const a = h.join("Alice"), b = h.join("Bob");
assert.equal(a.read()[0].t, "waiting");
assert.equal(b.read()[0].t, "waiting");
const refused = h.join("Casey");
assert.match(refused.read()[0].why, /full/);
h.room.approve(a.id);
h.room.approve(b.id);
const joined = a.read()[0];
assert.equal(joined.t, "joined");
const resumed = h.join("Alice", joined.token);
assert.equal(resumed.read()[0].token, joined.token);
assert.match(a.read()[0].why, /rejoined/);
assert(h.dropped.has(a.id));
h.room.start();
for (let round = 1; round <= 3; round++) {
  h.room.next();
  assert.equal(h.room.phase, "question");
  assert.equal(h.room.round, round);
  const state = resumed.read().at(-1);
  assert.equal(state.question.prompt, custom.questions[round - 1].prompt);
  assert(!Object.hasOwn(state.question, "correct"));
  const correct = h.room.questions.get(a.id).correct;
  resumed.send({ t: "answer", round: round + 1, answer: correct });
  assert.equal(h.room.answers.size, 0);
  resumed.send({ t: "answer", round, answer: correct });
  resumed.send({ t: "answer", round, answer: correct });
  assert.equal(h.room.answers.size, 1);
  assert.equal(resumed.read()[0].t, "recorded");
  b.send({ t: "answer", round, answer: round === 1 ? [1] : correct });
  const reveal = resumed.read().at(-1);
  assert.equal(reveal.phase, "reveal");
  assert.equal(reveal.result.ok, true);
  assert.deepEqual(reveal.result.correct, correct);
  assert.equal(reveal.distribution.assigned, 2);
  assert.equal(reveal.distribution.summary.correct, round === 1 ? 1 : 2);
  if (round === 3) assert(reveal.distribution.matches.every((row, i) => row[correct[i]] === 2));
  h.room.next();
  const leaders = resumed.read().at(-1);
  assert.equal(leaders.phase, "leaderboard");
  if (round === 3) {
    assert.equal(leaders.rows[0].score, 700);
    assert.equal(leaders.rows[0].streak, 3);
    assert.equal(leaders.highest.name, "Alice");
  }
}
h.room.next();
assert.equal(resumed.read().at(-1).phase, "podium");
h.room.stop();
assert.match(resumed.read().at(-1).why, /closed/);
console.log("ok  encrypted admission, capacity, resume, fixed order, reveal, leaderboard, streak and podium");

const u = harness({ ...defaults, approve: false, rounds: 1, preview: true, leaderboard: false, podium: false });
const p = u.join("Lee"), q = u.join("Sam");
u.room.remove(u.room.players.get(q.id));
assert.match(q.read().at(-1).why, /removed/);
const third = u.join("Ari");
u.room.start();
u.room.next();
assert.equal(u.room.phase, "spinning");
assert.equal(u.room.level.id, "normal");
u.room.preview();
assert.equal(u.room.phase, "preview");
assert.equal(u.room.deadline - u.room.now(), 10000);
const own = p.read().at(-1), other = third.read().at(-1);
assert.notEqual(own.question.prompt, other.question.prompt);
assert(!Object.hasOwn(own.question, "options"));
u.room.openQuestion();
u.advance(20000);
p.send({ t: "answer", round: 1, answer: u.room.questions.get(p.id).correct });
assert.equal(p.read().at(-1).result.answer, null);
u.room.next();
assert.equal(u.room.phase, "finished");
u.room.stop();
console.log("ok  automatic admission, removal, shared tier, timed preview, deadline and optional end screens");

for (const tiers of [true, false]) {
  const test = harness({ ...custom, approve: false, tiers, rounds: 1 }, { eggMultiplier: 1000 }, () => 0.00679);
  const first = test.join("Terry"), second = test.join("Robin");
  assert.equal(first.read().at(-1).eggOdds, undefined);
  test.room.start();
  assert.equal(first.read().at(-1).eggOdds, undefined);
  assert.equal(test.room.surpriseOdds(), null);
  test.room.next();
  if (tiers) {
    const spin = first.read().at(-1);
    assert.equal(spin.level, "?");
    assert.equal(spin.eggOdds, undefined);
    test.room.land();
  }
  const surprise = first.read().at(-1);
  assert.equal(surprise.phase, "egg");
  assert.equal(surprise.eggOdds, 147);
  assert.equal(surprise.score, 0);
  assert.equal(surprise.question, undefined);
  assert.equal(test.room.timer, null);
  assert.equal(second.read().at(-1).eggOdds, 147);
  test.room.continueEgg();
  assert.equal(test.room.surpriseOdds(), null);
  if (tiers) {
    const spin = first.read().at(-1);
    assert.equal(spin.level, "Normal");
    assert.equal(spin.eggOdds, undefined);
    test.room.land();
  }
  const question = first.read().at(-1);
  assert.equal(question.phase, "question");
  assert.equal(question.eggOdds, undefined);
  const answer = test.room.questions.get(first.id);
  const wrong = test.room.questions.get(second.id);
  first.send({ t: "answer", round: 1, answer: answer.correct });
  second.send({ t: "answer", round: 1, answer: [(wrong.correct[0] + 1) % wrong.options.length] });
  const reveal = first.read().at(-1);
  assert.equal(reveal.result.points, answer.points);
  assert.equal(reveal.eggOdds, undefined);
  assert.equal(second.read().at(-1).result.points, 0);
  test.room.stop();
}
const disabledEgg = harness(defaults, { egg: false }, () => 0);
assert.equal(disabledEgg.room.eggChance, 0);
assert.equal(disabledEgg.room.eggSlice, null);
const defaultEgg = harness(defaults, {}, () => 0);
assert(defaultEgg.room.eggSlice);
assert.equal(defaultEgg.room.eggChance, Wheel.eggChance({ eggMultiplier: 1 }));
assert.equal(defaultEgg.room.surpriseOdds(), null);
const defaultFirst = defaultEgg.join("Mika"), defaultSecond = defaultEgg.join("Drew");
defaultEgg.room.approve(defaultFirst.id);
defaultEgg.room.approve(defaultSecond.id);
defaultEgg.room.start();
defaultEgg.room.next();
defaultEgg.room.land();
assert.equal(defaultFirst.read().at(-1).eggOdds, 146751);
defaultEgg.room.stop();
console.log("ok  spectator rooms display the odds and resume the round with regular scoring");
