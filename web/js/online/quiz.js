// Rules and file format for spectator-host games. MIT License (see LICENSE).
var PGQuiz = (function () {
  "use strict";

  var FORMATS = { choice: "Multiple choice", tick: "Tick box", pairs: "Matching pairs" };
  var STORAGE = "playgloss-quiz-setup", LAUNCH = "playgloss-quiz-launch";
  var MAX_QUESTIONS = 1000, CUSTOM_SECONDS = 20;
  var toggles = ["approve", "tiers", "timed", "leaderboard", "streaks", "preview", "podium"];

  function defaults(capacity) {
    return { approve: true, maxPlayers: Math.min(24, capacity), tiers: true, rounds: 10,
      format: "choice", choices: 4, timed: false, leaderboard: true, streaks: true,
      preview: false, previewSeconds: 10, podium: true, questions: [] };
  }

  function integer(value, min, max, label) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(label + " must be a whole number from " + min + " to " + max + ".");
    }
    return value;
  }

  function line(value, max, label) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
      throw new Error(label + " must contain 1–" + max + " characters.");
    }
    return value.trim();
  }

  function unique(values, label) {
    if (new Set(values.map(function (v) { return v.toLowerCase(); })).size !== values.length) {
      throw new Error(label + " must be distinct.");
    }
    return values;
  }

  function hasFormat(format) {
    return typeof format === "string" && Object.prototype.hasOwnProperty.call(FORMATS, format);
  }

  function question(q) {
    if (!q || !hasFormat(q.format)) throw new Error("Choose an answer format.");
    var result = {
      prompt: line(q.prompt, 160, "Question"), format: q.format,
      points: integer(q.points, 1, 1000, "Points"), multiplier: integer(q.multiplier, 1, 3, "Multiplier")
    };
    if (q.format === "pairs") {
      if (!Array.isArray(q.pairs)) throw new Error("Enter the matching pairs.");
      integer(q.pairs.length, 2, 4, "Pair count");
      result.pairs = q.pairs.map(function (p) {
        if (!Array.isArray(p) || p.length !== 2) throw new Error("Each pair needs two entries.");
        return [line(p[0], 80, "Left entry"), line(p[1], 80, "Right entry")];
      });
      unique(result.pairs.map(function (p) { return p[0]; }), "Left entries");
      unique(result.pairs.map(function (p) { return p[1]; }), "Right entries");
      return result;
    }
    if (!Array.isArray(q.options) || !Array.isArray(q.correct)) throw new Error("Enter the choices and mark the correct answer.");
    integer(q.options.length, 2, 4, "Choice count");
    result.options = unique(q.options.map(function (v) { return line(v, 80, "Choice"); }), "Choices");
    integer(q.correct.length, 1, q.format === "choice" ? 1 : q.options.length, "Correct answer count");
    result.correct = q.correct.map(function (v) { return integer(v, 0, q.options.length - 1, "Correct choice index"); });
    if (new Set(result.correct).size !== result.correct.length) throw new Error("Mark each correct answer once.");
    return result;
  }

  function questions(list, minimum) {
    if (!Array.isArray(list)) throw new Error("The question list is missing.");
    integer(list.length, minimum, MAX_QUESTIONS, "Question count");
    return list.map(function (q, index) {
      try { return question(q); }
      catch (err) { throw new Error("Question " + (index + 1) + ". " + err.message); }
    });
  }

  function config(data, capacity) {
    if (!data || typeof data !== "object") throw new Error("The configuration is missing.");
    var result = defaults(capacity);
    toggles.forEach(function (key) {
      if (typeof data[key] !== "boolean") throw new Error("Invalid on/off setting for " + key + ".");
      result[key] = data[key];
    });
    result.maxPlayers = integer(data.maxPlayers, 2, capacity, "Max players on this device");
    result.rounds = integer(data.rounds, 1, MAX_QUESTIONS, "Round count");
    result.choices = integer(data.choices, 2, 4, "Choice or pair count");
    result.previewSeconds = integer(data.previewSeconds, 5, 20, "Preview time");
    if (!hasFormat(data.format)) throw new Error("Invalid answer format.");
    result.format = data.format;
    result.questions = questions(data.questions, 0);
    if (data.rules !== undefined) result.rules = wheelRules(data.rules);
    return result;
  }

  function wheelRules(rules) {
    if (!rules || typeof rules.extreme !== "boolean" || !Game.TIMES.some(function (t) { return t[0] === rules.time; })
      || !rules.levelColors || typeof rules.levelColors !== "object" || Array.isArray(rules.levelColors)
      || !rules.weights || typeof rules.weights !== "object") {
      throw new Error("Invalid wheel settings.");
    }
    var weights = {}, total = 0;
    PGAdvanced.LEVEL_IDS.forEach(function (id) {
      var value = rules.weights[id], cents = Math.round(value * 100);
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value * 100 - cents) > 1e-6) {
        throw new Error("Each difficulty probability must be 0–100% with up to two decimals.");
      }
      weights[id] = value;
      total += cents;
    });
    if (total !== 10000) throw new Error("The difficulty probabilities must add up to 100%.");
    return { extreme: rules.extreme, time: rules.time, levelColors: Game.cleanCustom(rules).levelColors, weights: weights };
  }

  function tierWeights() {
    var levels = Wheel.slices.slice(0, 8), sum = levels.reduce(function (total, level) { return total + level.weight; }, 0);
    var allocated = 0, weights = {};
    levels.forEach(function (level, i) {
      var cents = i + 1 === levels.length ? 10000 - allocated : Math.round(level.weight * 10000 / sum);
      weights[level.id] = cents / 100;
      allocated += cents;
    });
    return weights;
  }

  function load(capacity) {
    try {
      var s = JSON.parse(sessionStorage.getItem(STORAGE));
      if (s) {
        s.maxPlayers = Math.min(s.maxPlayers, capacity);
        return config(s, capacity);
      }
    } catch (err) {}
    return defaults(capacity);
  }

  function save(s) {
    sessionStorage.setItem(STORAGE, JSON.stringify(s));
  }

  function file(kind, data) {
    return JSON.stringify({ app: "PlayGloss", kind: kind, version: 1, data: data });
  }

  function readFile(text, kind, capacity) {
    var value = JSON.parse(text);
    if (!value || value.app !== "PlayGloss" || value.kind !== kind || value.version !== 1) {
      throw new Error("Choose a PlayGloss " + (kind === "quiz-config" ? "Kahoot-like configuration." : "question set."));
    }
    if (kind !== "quiz-config") return questions(value.data, 1);
    var stored = config(value.data, capacity);
    if (!stored.rules) throw new Error("The wheel settings are missing.");
    return stored;
  }

  function deviceCapacity() {
    if (typeof window === "undefined" || !window.__TAURI__ || !window.__TAURI__.core) return Promise.resolve(0);
    return window.__TAURI__.core.invoke("quiz_capacity").then(function (n) {
      return Number.isInteger(n) && n >= 2 && n <= 128 ? n : 0;
    }).catch(function () { return 0; });
  }

  function enabled() {
    try { return PGAdvanced.enabled() && localStorage.getItem("online") === "1"; }
    catch (err) { return false; }
  }

  function shuffle(values, random) {
    for (var i = values.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1)), item = values[i];
      values[i] = values[j];
      values[j] = item;
    }
    return values;
  }

  function match(prompt, pairs, points, random) {
    var order = shuffle(pairs.map(function (_, i) { return i; }), random);
    return { prompt: prompt, format: "pairs", points: points,
      left: pairs.map(function (p) { return p[0]; }),
      options: order.map(function (i) { return pairs[i][1]; }),
      correct: pairs.map(function (_, i) { return order.indexOf(i); }) };
  }

  function customQuestion(q, random) {
    var points = q.points * q.multiplier;
    if (q.format === "pairs") return match(q.prompt, q.pairs, points, random);
    return { prompt: q.prompt, format: q.format, points: points, options: q.options, correct: q.correct };
  }

  function wordQuestion(words, settings, level, random) {
    if (settings.format === "pairs") {
      return match("Match each word to its meaning.", words.map(function (w) { return [w.word, w.meaning]; }), level.points, random);
    }
    var options = shuffle(words.map(function (w) { return w.meaning; }).concat(
      words[0].wrong.filter(function (meaning) {
        return words.every(function (w) { return w.meaning !== meaning; });
      }).slice(0, settings.choices - words.length)
    ), random);
    return { prompt: words.length === 1 ? "What does “" + words[0].word + "” mean?"
      : "Select the meanings of “" + words[0].word + "” and “" + words[1].word + "”.",
      format: settings.format, points: level.points, options: options,
      correct: words.map(function (word) { return options.indexOf(word.meaning); }) };
  }

  function assignWords(ids, bank, level, settings, extreme, random) {
    var pool = shuffle(Array.from({ length: bank.count(level.id, extreme) }, function (_, i) { return i; }), random);
    var count = settings.format === "pairs" ? settings.choices : settings.format === "tick" && settings.choices > 2 ? 2 : 1;
    if (pool.length < ids.length * count) throw new Error("This tier does not have enough words for every player.");
    var assigned = new Map(), offset = 0;
    ids.forEach(function (id) {
      var words = [];
      while (words.length < count && offset < pool.length) {
        var candidate = bank.get(level.id, extreme, pool[offset++]);
        if (words.every(function (w) { return w.meaning !== candidate.meaning; })) words.push(candidate);
      }
      if (words.length !== count) throw new Error("This tier does not have enough distinct meanings.");
      assigned.set(id, wordQuestion(words, settings, level, random));
    });
    return assigned;
  }

  function publicQuestion(q, preview) {
    var p = { prompt: q.prompt, format: q.format, points: q.points };
    if (q.left) p.left = q.left;
    if (!preview) p.options = q.options;
    return p;
  }

  function validAnswer(q, answer) {
    if (!Array.isArray(answer) || !answer.length || answer.length > q.options.length) return false;
    if (q.format === "choice" && answer.length !== 1) return false;
    if (q.format === "pairs" && answer.length !== q.left.length) return false;
    return new Set(answer).size === answer.length && answer.every(function (i) {
      return Number.isInteger(i) && i >= 0 && i < q.options.length;
    });
  }

  function grade(q, answer, timed, elapsed, duration) {
    var correct = !!answer && answer.length === q.correct.length && q.correct.every(function (i, k) {
      return q.format === "pairs" ? answer[k] === i : answer.indexOf(i) >= 0;
    });
    var used = Math.max(0, Math.min(1, elapsed / duration));
    return { correct: correct, points: correct ? Math.round(q.points * (timed ? 1 - used / 2 : 1)) : 0 };
  }

  function standings(players, previous, streaks, random) {
    var ordered = Array.from(players).sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    var ranks = new Map(), rows = ordered.map(function (p, i) {
      var rank = i + 1, old = previous.get(p.id);
      ranks.set(p.id, rank);
      return { name: p.name, rank: rank, score: p.score, streak: streaks ? p.streak : 0,
        move: old == null ? 0 : Math.sign(old - rank) };
    });
    var max = streaks ? Math.max(0, ...ordered.map(function (p) { return p.streak; })) : 0;
    var tied = max >= 3 ? ordered.filter(function (p) { return p.streak === max; }) : [];
    return { rows: rows.slice(0, 5), ranks: ranks,
      highest: tied.length ? { name: tied[Math.floor(random() * tied.length)].name, streak: max } : null };
  }

  return { FORMATS: FORMATS, LAUNCH: LAUNCH, MAX_QUESTIONS: MAX_QUESTIONS, CUSTOM_SECONDS: CUSTOM_SECONDS,
    defaults: defaults, config: config, load: load, save: save, question: question, file: file, readFile: readFile,
    deviceCapacity: deviceCapacity, enabled: enabled, tierWeights: tierWeights, customQuestion: customQuestion, assignWords: assignWords,
    publicQuestion: publicQuestion, validAnswer: validAnswer, grade: grade, standings: standings };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PGQuiz;
