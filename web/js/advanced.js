// Advanced Mode: the switch, the chance of every level and power-up, the Easter egg switch and the player's own questions.
// Saved only on this device (localStorage) and never sent anywhere. MIT License (see LICENSE).
// Everything that comes in (storage, an imported file) is checked here before it is used; nothing is trusted as it came.
var PGAdvanced = (function () {
  "use strict";
  var subs = [];
  var read = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var save = function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

  var LEVEL_IDS = ["very-easy", "easy", "normal", "hard", "very-hard", "extremely-hard", "insanely-hard", "impossible"];
  // The Easter egg ("?") is not in the list: its chance is fixed and the player never sees it.
  var POWER_IDS = ["x2", "x3", "shield", "free"];
  var ALL_IDS = LEVEL_IDS.concat(POWER_IDS);
  var LEVEL_NAMES = {
    "very-easy": "Very Easy", "easy": "Easy", "normal": "Normal", "hard": "Hard",
    "very-hard": "Very Hard", "extremely-hard": "Extremely Hard", "insanely-hard": "Insanely Hard", "impossible": "Impossible"
  };
  var POWER_NAMES = { "x2": "2x", "x3": "3x", "shield": "Shield", "free": "Free 5" };
  // The standard odds of the game as percentages with two decimals (they add up to exactly 100.00).
  var DEFAULT_WEIGHTS = {
    "very-easy": 34.08, "easy": 20.44, "normal": 13.63, "hard": 10.22,
    "very-hard": 6.81, "extremely-hard": 5.11, "insanely-hard": 3.41, "impossible": 1.70,
    "x2": 1.02, "x3": 0.68, "shield": 2.56, "free": 0.34
  };
  var MAX_QUESTIONS = 1000, MAX_WORD = 50, MAX_TEXT = 200, MAX_FILE = 2 * 1024 * 1024;
  var WORDLIST_FORMAT = "word,meaning,wrong1,wrong2,wrong3,choices";

  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  var hundredths = function (v) { return Math.round(v * 100); };
  var st = { weights: copy(DEFAULT_WEIGHTS), eggEnabled: true, questionsMode: "default", customQuestions: [], dontShowExportPrompt: false };

  // Percentages for the twelve items -> { ok, total (in %), error }. Each is a number from 0 to 100 with at most 2 decimals.
  function checkWeights(w) {
    if (!w || typeof w !== "object") return { ok: false, total: 0, error: "No probabilities found." };
    var sum = 0, bad = null;
    ALL_IDS.forEach(function (id) {
      var v = w[id];
      if (typeof v !== "number" || !isFinite(v) || v < 0 || v > 100 || Math.abs(v * 100 - hundredths(v)) > 1e-6) bad = bad || id;
      else sum += hundredths(v);
    });
    if (bad) return { ok: false, total: sum / 100, error: "Every probability must be a number from 0 to 100 with at most two decimals (check " + (LEVEL_NAMES[bad] || POWER_NAMES[bad] || bad) + ")." };
    if (sum !== 10000) return { ok: false, total: sum / 100, error: "The probabilities add up to " + (sum / 100).toFixed(2) + "%, they must add up to 100%." };
    return { ok: true, total: 100 };
  }
  function pickWeights(w) { var o = {}; ALL_IDS.forEach(function (id) { o[id] = hundredths(w[id]) / 100; }); return o; }

  // One question -> { q } (a clean copy) or { error }. choices is 2, 3 or 4 (the right meaning plus choices - 1 wrong ones).
  function cleanText(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
  function cleanQuestion(q) {
    if (!q || typeof q !== "object") return { error: "not a question" };
    var choices = Number(q.choices);
    if ([2, 3, 4].indexOf(choices) < 0) return { error: "choices must be 2, 3 or 4" };
    var word = cleanText(q.word, MAX_WORD), meaning = cleanText(q.meaning, MAX_TEXT);
    if (!word || !meaning) return { error: "the word and its meaning are needed" };
    var raw = Array.isArray(q.wrong) ? q.wrong : [], wrong = [], seen = {};
    seen[meaning.toLowerCase()] = 1;
    for (var i = 0; i < choices - 1; i++) {
      var w = cleanText(raw[i], MAX_TEXT);
      if (!w) return { error: (choices - 1) + " wrong meaning" + (choices === 2 ? " is" : "s are") + " needed for " + choices + " choices" };
      if (seen[w.toLowerCase()]) return { error: "the meanings must all be different" };
      seen[w.toLowerCase()] = 1; wrong.push(w);
    }
    return { q: { word: word, meaning: meaning, wrong: wrong, choices: choices } };
  }
  function cleanQuestions(list) {
    if (!Array.isArray(list)) return { error: "no questions found" };
    if (list.length > MAX_QUESTIONS) return { error: "at most " + MAX_QUESTIONS + " questions are allowed" };
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = cleanQuestion(list[i]);
      if (r.error) return { error: "question " + (i + 1) + ": " + r.error };
      out.push(r.q);
    }
    return { list: out };
  }

  function load() {
    try {
      var w = JSON.parse(read("adv-weights") || "null");
      if (w && checkWeights(w).ok) st.weights = pickWeights(w);
    } catch (e) { /* keep the defaults */ }
    st.eggEnabled = read("adv-egg-enabled") !== "0";
    st.questionsMode = read("adv-questions-mode") === "custom" ? "custom" : "default";
    try {
      var r = cleanQuestions(JSON.parse(read("adv-custom-questions") || "[]"));
      if (r.list) st.customQuestions = r.list;
    } catch (e) { st.customQuestions = []; }
    st.dontShowExportPrompt = read("adv-dont-show-export") === "1";
  }
  load();

  var enabled = function () { return read("advanced-mode") === "1"; };
  function notify() { subs.forEach(function (f) { try { f(get()); } catch (e) { /* a listener must not stop the others */ } }); }
  function setEnabled(on) { save("advanced-mode", on ? "1" : "0"); notify(); }

  function get() {
    return {
      weights: copy(st.weights), eggEnabled: st.eggEnabled, questionsMode: st.questionsMode,
      customQuestions: copy(st.customQuestions), dontShowExportPrompt: st.dontShowExportPrompt
    };
  }

  // Saves the parts that are given and valid. Returns { ok, error }; nothing is saved when something is wrong.
  function set(p) {
    p = p || {};
    var w = null, qs = null;
    if (p.weights !== undefined) {
      var cw = checkWeights(p.weights);
      if (!cw.ok) return { ok: false, error: cw.error };
      w = pickWeights(p.weights);
    }
    if (p.customQuestions !== undefined) {
      var cq = cleanQuestions(p.customQuestions);
      if (cq.error) return { ok: false, error: cq.error };
      qs = cq.list;
    }
    if (w) { st.weights = w; save("adv-weights", JSON.stringify(w)); }
    if (typeof p.eggEnabled === "boolean") { st.eggEnabled = p.eggEnabled; save("adv-egg-enabled", p.eggEnabled ? "1" : "0"); }
    if (p.questionsMode === "default" || p.questionsMode === "custom") { st.questionsMode = p.questionsMode; save("adv-questions-mode", p.questionsMode); }
    if (qs) { st.customQuestions = qs; save("adv-custom-questions", JSON.stringify(qs)); }
    if (typeof p.dontShowExportPrompt === "boolean") { st.dontShowExportPrompt = p.dontShowExportPrompt; save("adv-dont-show-export", p.dontShowExportPrompt ? "1" : "0"); }
    notify();
    return { ok: true };
  }
  function resetWeights() { return set({ weights: DEFAULT_WEIGHTS }); }

  // What a Custom game takes from Advanced Mode: null when Advanced Mode is off or nothing differs from the standard game.
  function forGame() {
    if (!enabled()) return null;
    var a = {}, w = pickWeights(st.weights);
    if (JSON.stringify(w) !== JSON.stringify(DEFAULT_WEIGHTS)) a.weights = w;
    if (!st.eggEnabled) a.egg = false;
    if (st.questionsMode === "custom" && st.customQuestions.length) a.questions = "custom";
    return Object.keys(a).length ? a : null;
  }
  // The player's own questions; the host reads them while a game with adv.questions === "custom" is played.
  function questions() { return copy(st.customQuestions); }

  /* ---------- the whole advanced setup as data (the file itself is made and read in ui.js) ---------- */
  function exportData() {
    return { weights: copy(st.weights), eggEnabled: st.eggEnabled, questionsMode: st.questionsMode, customQuestions: copy(st.customQuestions) };
  }
  // Checks everything first, then saves it all or nothing.
  function importData(d) {
    if (!d || typeof d !== "object") return { ok: false, error: "The advanced part of the file is missing." };
    var p = {};
    if (d.weights !== undefined) p.weights = d.weights;
    if (d.customQuestions !== undefined) p.customQuestions = d.customQuestions;
    if (typeof d.eggEnabled === "boolean") p.eggEnabled = d.eggEnabled;
    if (d.questionsMode === "default" || d.questionsMode === "custom") p.questionsMode = d.questionsMode;
    return set(p);
  }

  /* ---------- word list (CSV) ---------- */
  // Spreadsheets run text that starts with = + - or @ as a formula, so the file marks those cells with a leading '.
  function csvCell(s) {
    s = String(s);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportWordlist() {
    var lines = [WORDLIST_FORMAT];
    st.customQuestions.forEach(function (q) {
      lines.push([q.word, q.meaning, q.wrong[0] || "", q.wrong[1] || "", q.wrong[2] || "", String(q.choices)].map(csvCell).join(","));
    });
    return lines.join("\r\n") + "\r\n";
  }
  // The whole text at once (a quoted cell may hold a line break). Returns rows of cells.
  function parseCsv(text) {
    var rows = [], row = [], cur = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else cur += c;
    }
    row.push(cur);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    return rows;
  }
  // Replaces the player's questions with the ones in the text. Nothing changes if any line is wrong.
  function importWordlist(text) {
    text = String(text == null ? "" : text);
    if (text.length > MAX_FILE) return { ok: false, error: "The file is too big." };
    var rows = parseCsv(text.replace(/^\uFEFF/, ""));
    if (rows.length < 2) return { ok: false, error: "The file is empty or only has the header line. Expected: " + WORDLIST_FORMAT };
    var head = rows[0].map(function (x) { return x.trim().toLowerCase(); });
    if (head[0] !== "word" || head[1] !== "meaning") return { ok: false, error: "The first line must be: " + WORDLIST_FORMAT };
    var list = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i].map(function (x) { return x.replace(/^'(?=[=+\-@])/, ""); });
      while (r.length < 6) r.push("");
      var res = cleanQuestion({ word: r[0], meaning: r[1], wrong: [r[2], r[3], r[4]], choices: parseInt(r[5], 10) });
      if (res.error) return { ok: false, error: "Line " + (i + 1) + ": " + res.error + "." };
      list.push(res.q);
    }
    var done = set({ customQuestions: list });
    return done.ok ? { ok: true, count: list.length } : done;
  }

  return {
    enabled: enabled, setEnabled: setEnabled, get: get, set: set, resetWeights: resetWeights, checkWeights: checkWeights,
    forGame: forGame, questions: questions, cleanQuestion: cleanQuestion,
    exportData: exportData, importData: importData, exportWordlist: exportWordlist, importWordlist: importWordlist,
    subscribe: function (f) { subs.push(f); },
    LEVEL_IDS: LEVEL_IDS, POWER_IDS: POWER_IDS, ALL_IDS: ALL_IDS, LEVEL_NAMES: LEVEL_NAMES, POWER_NAMES: POWER_NAMES,
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS, WORDLIST_FORMAT: WORDLIST_FORMAT, MAX_QUESTIONS: MAX_QUESTIONS, MAX_FILE: MAX_FILE,
    MAX_WORD: MAX_WORD, MAX_TEXT: MAX_TEXT
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PGAdvanced;
