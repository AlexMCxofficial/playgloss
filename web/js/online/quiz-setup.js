// Spectator-host setup, custom question editor and file transfer. MIT License (see LICENSE).
var PGQuizSetup = (function () {
  "use strict";

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(text, action) {
    var b = el("button", "small", text);
    b.type = "button";
    b.onclick = action;
    return b;
  }

  function field(label, input) {
    var row = el("label", "quiz-field");
    input.setAttribute("aria-label", label);
    row.append(el("span", "", label), input);
    return row;
  }

  function number(value, min, max) {
    var input = el("input");
    input.type = "number";
    input.min = min;
    input.max = max;
    input.required = true;
    input.value = value;
    return input;
  }

  function select(values, value) {
    var input = el("select");
    values.forEach(function (item) {
      var option = el("option", "", item[1]);
      option.value = item[0];
      input.append(option);
    });
    input.value = value;
    return input;
  }

  function checked(label, value, change) {
    var input = el("input");
    input.type = "checkbox";
    input.checked = value;
    input.onchange = function () { change(input.checked); };
    var row = el("label", "xfer-check");
    row.append(input, document.createTextNode(" " + label));
    return row;
  }

  function text(value, max) {
    var input = el("input");
    input.type = "text";
    input.maxLength = max;
    input.value = value || "";
    input.required = true;
    return input;
  }

  function transfer(parent, kind, get, put, capacity) {
    var isConfig = kind === "quiz-config", what = isConfig ? "Kahoot-like configuration" : "question set";
    var row = el("div", "row");
    row.append(button("Export " + what, function () {
      PGTransfer.exportFile({ title: "Export " + what, filename: "playgloss-" + kind + ".json",
        mime: "application/json", text: PGQuiz.file(kind, get()) });
    }), button("Import " + what, function () {
      PGTransfer.importFile({ title: "Import " + what, accept: ".json,application/json", maxText: 4 * 1024 * 1024,
        note: "Import replaces the current " + what + ".",
        onText: function (body) {
          try {
            var value = PGQuiz.readFile(body, kind, capacity);
            put(value);
            return { ok: true };
          } catch (err) { return { error: err.message }; }
        }
      });
    }));
    if (!isConfig) row.firstChild.disabled = !get().length;
    parent.append(row);
  }

  function questionEditor(parent, onSave, onCancel, initial) {
    var form = el("form", "quiz-editor");
    var base = initial || { prompt: "", format: "choice", points: 10, multiplier: 1, options: ["", "", "", ""], correct: [0] };
    var options = (base.options || []).slice(), marked = (base.correct || []).slice();
    var pairs = (base.pairs || []).map(function (pair) { return pair.slice(); });
    var prompt = text(base.prompt, 160), points = number(base.points, 1, 1000);
    var multiplier = select([[1, "1×"], [2, "2×"], [3, "3×"]], base.multiplier);
    var format = select(Object.entries(PGQuiz.FORMATS), base.format);
    var count = select([[2, "2"], [3, "3"], [4, "4"]], base.pairs ? pairs.length : options.length);
    var entries = el("div", "quiz-entries"), message = el("p", "note");
    message.setAttribute("role", "alert");
    function drawEntries() {
      entries.replaceChildren();
      var matching = format.value === "pairs";
      countLabel.textContent = matching ? "Pairs" : "Choices";
      count.setAttribute("aria-label", countLabel.textContent);
      for (var i = 0; i < Number(count.value); i++) addEntry(i, matching);
    }
    function addEntry(i, matching) {
      if (matching) {
        var p = pairs[i] || (pairs[i] = ["", ""]);
        var left = text(p[0], 80), right = text(p[1], 80);
        left.oninput = function () { p[0] = left.value; };
        right.oninput = function () { p[1] = right.value; };
        var row = el("div", "quiz-pair");
        row.append(field("Pair " + (i + 1) + " left", left), field("Pair " + (i + 1) + " right", right));
        entries.append(row);
        return;
      }
      var choice = text(options[i], 80), correct = el("input");
      choice.oninput = function () { options[i] = choice.value; };
      correct.type = format.value === "choice" ? "radio" : "checkbox";
      correct.name = "quiz-correct";
      correct.checked = marked.includes(i);
      correct.onchange = function () {
        if (format.value === "choice") marked = [i];
        else if (correct.checked) marked.push(i);
        else marked = marked.filter(function (k) { return k !== i; });
      };
      var item = el("div", "quiz-pair");
      item.append(field("Choice " + (i + 1), choice), field("Correct", correct));
      entries.append(item);
    }
    format.onchange = function () {
      if (format.value === "choice") marked = marked.slice(0, 1);
      drawEntries();
    };
    count.onchange = drawEntries;
    var countField = field("Choices", count);
    var countLabel = countField.firstChild;
    drawEntries();
    var submit = el("button", "spin", "Save question");
    submit.type = "submit";
    form.onsubmit = function (event) {
      event.preventDefault();
      var n = Number(count.value), q = { prompt: prompt.value, points: Number(points.value),
        multiplier: Number(multiplier.value), format: format.value };
      if (q.format === "pairs") q.pairs = pairs.slice(0, n);
      else {
        q.options = options.slice(0, n);
        q.correct = marked.filter(function (i) { return i < n; });
      }
      try { onSave(PGQuiz.question(q)); }
      catch (err) { message.textContent = err.message; }
    };
    var actions = el("div", "row");
    actions.append(submit, button("Cancel edit", onCancel));
    form.append(field("Question", prompt), field("Points", points), field("Multiplier", multiplier),
      field("Answer format", format), countField, entries, message, actions);
    parent.append(form);
    prompt.focus();
  }

  function editor(parent, s, commit, capacity) {
    var wrap = el("div", "quiz-editor"), index = 0;
    parent.append(wrap);
    function draw() {
      wrap.replaceChildren();
      var length = s.questions.length;
      wrap.append(el("p", "note", length + " / " + PGQuiz.MAX_QUESTIONS + " questions. Players answer in this order."));
      if (length) {
        var list = select(s.questions.map(function (q, i) { return [i, (i + 1) + ". " + q.prompt]; }), index);
        list.onchange = function () {
          index = Number(list.value);
          up.disabled = index === 0;
          down.disabled = index === length - 1;
        };
        var actions = el("div", "row");
        var up = button("Move up", function () { move(-1); });
        var down = button("Move down", function () { move(1); });
        up.disabled = index === 0;
        down.disabled = index === length - 1;
        actions.append(button("Edit question", function () { edit(index); }), up, down,
          button("Delete question", function () {
            if (!window.confirm("Delete this question?")) return;
            s.questions.splice(index, 1);
            index = Math.max(0, Math.min(index, s.questions.length - 1));
            commit();
            draw();
          }));
        wrap.append(field("Question order", list), actions);
      }
      var add = button("Add question", function () { edit(-1); });
      add.disabled = length >= PGQuiz.MAX_QUESTIONS;
      wrap.append(add);
      transfer(wrap, "quiz-questions", function () { return s.questions; }, function (value) {
        s.questions = value;
        index = 0;
        commit();
        draw();
      }, capacity);
    }
    function move(step) {
      var other = index + step, q = s.questions[index];
      s.questions[index] = s.questions[other];
      s.questions[other] = q;
      index = other;
      commit();
      draw();
    }
    function edit(k) {
      wrap.replaceChildren();
      questionEditor(wrap, function (q) {
        index = k < 0 ? s.questions.length : k;
        s.questions[index] = q;
        commit();
        draw();
      }, draw, s.questions[k]);
    }
    draw();
  }

  var currentTab = 0;

  function draw(parent, s, capacity, changed) {
    var labels = ["Approve Guests", "Max Players", "Difficulty Tiers", "Answer Format", "Timed Scores",
      "Leaderboard", "Preview Question", "Podium", "Export/Import"];
    var tabs = el("div", "ctabs quiz-tabs"), body = el("div", "cview");
    var buttons = [];
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Kahoot-like host settings");
    body.id = "quiz-tab-panel";
    body.setAttribute("role", "tabpanel");
    parent.append(tabs, body);
    function commit() {
      changed(s);
    }
    function toggle(label, key, redraw) {
      body.append(checked(label, s[key], function (value) { s[key] = value; commit(); if (redraw) show(currentTab); }));
    }
    function range(label, key, min, max) {
      var input = number(s[key], min, max);
      input.onchange = function () {
        if (!input.validity.valid) {
          input.value = s[key];
          return;
        }
        s[key] = Number(input.value);
        commit();
      };
      body.append(field(label, input));
    }
    function note(message) { body.append(el("p", "note", message)); }
    var panels = [
      function () { toggle("Require host approval", "approve"); note("When off, anyone on your network with the invite link can use an available spot."); },
      function () { range("Max players", "maxPlayers", 2, capacity); note("The estimated limit on this desktop is " + capacity + " players."); },
      function () {
        toggle("Use difficulty tiers", "tiers", true);
        if (s.tiers) {
          range("Number of questions", "rounds", 1, PGQuiz.MAX_QUESTIONS);
          note("Spin once per question. Each player receives a different word question at the selected tier.");
        } else { note("Add at least one question. Each question has " + PGQuiz.CUSTOM_SECONDS + " seconds to answer."); editor(body, s, commit, capacity); }
      },
      function () {
        if (!s.tiers) { note("Set the answer format per question under Difficulty Tiers."); return; }
        var input = select(Object.entries(PGQuiz.FORMATS), s.format);
        input.onchange = function () { s.format = input.value; commit(); show(currentTab); };
        body.append(field("Answer format", input));
        range(s.format === "pairs" ? "Pairs per question" : "Choices per question", "choices", 2, 4);
        if (s.format === "tick") note("Questions with three or four choices have two correct answers.");
        toggle("Award partial points for some correct answers", "partial");
        note("For tick boxes, incorrect selections offset correct ones. For matching pairs, each correct match earns a share. Full answers earn the full score and build streaks.");
      },
      function () { toggle("Score correct answers by response time", "timed"); note("Correct answers earn 50–100% of the available points based on how quickly they reach the host."); },
      function () {
        toggle("Show the top five after each question", "leaderboard", true);
        if (s.leaderboard) toggle("Show streaks after three correct answers in a row", "streaks");
      },
      function () {
        toggle("Preview the prompt before showing the choices", "preview", true);
        if (s.preview) range("Preview time (seconds)", "previewSeconds", 5, 20);
      },
      function () { toggle("Show the top three on a podium", "podium"); },
      function () {
        transfer(body, "quiz-config", function () { return s; }, function (value) {
          changed(value, true);
        }, capacity);
      }
    ];
    function show(i) {
      currentTab = i;
      buttons.forEach(function (b, k) {
        b.setAttribute("aria-selected", k === i);
        b.tabIndex = k === i ? 0 : -1;
      });
      body.setAttribute("aria-labelledby", buttons[i].id);
      body.replaceChildren();
      panels[i]();
    }
    labels.forEach(function (label, i) {
      var b = button(label, function () { show(i); });
      b.id = "quiz-setting-" + i;
      b.className = "ctab";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", body.id);
      b.onkeydown = function (event) {
        var step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        var next = (i + step + labels.length) % labels.length;
        show(next);
        buttons[next].focus();
        event.preventDefault();
      };
      buttons.push(b);
      tabs.append(b);
    });
    show(currentTab);
  }

  return { draw: draw };
})();
