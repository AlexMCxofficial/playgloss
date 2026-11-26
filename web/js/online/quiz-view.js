// Shared spectator-game presentation. Only the guest page renders answer controls. MIT License (see LICENSE).
var QuizView = (function () {
  "use strict";

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(text, action, primary) {
    var b = el("button", primary ? "spin" : "small", text);
    b.type = "button";
    b.onclick = action;
    return b;
  }

  function clock(node, ms) {
    var end = performance.now() + ms;
    function paint() {
      var secs = Math.max(0, Math.ceil((end - performance.now()) / 1000));
      node.textContent = secs + " s";
      return secs > 0;
    }
    paint();
    var id = setInterval(function () { if (!paint()) clearInterval(id); }, 200);
    return function () { clearInterval(id); };
  }

  function mark(correct, selected) {
    return correct ? "✓ " : selected ? "✗ " : "";
  }

  function question(q, result, submit) {
    var block = el("section", "quiz-question");
    block.append(el("p", "quiz-meta", PGQuiz.FORMATS[q.format] + " · " + q.points + " points"),
      el("h2", "", q.prompt));
    if (!q.options) {
      if (q.left) {
        var preview = el("ul", "quiz-match-pool");
        q.left.forEach(function (item) { preview.append(el("li", "", item)); });
        block.append(preview);
      }
      return block;
    }
    var matching = q.format === "pairs", controls = [], canAnswer = typeof submit === "function";
    var form = el("form", "quiz-options");
    if (canAnswer) {
      var instructions = matching ? "Choose a match for each item." : q.format === "tick" ? "Select all correct answers." : "Select one answer.";
      form.append(el("p", "note", instructions));
    }
    var options = matching ? q.left : q.options;
    options.forEach(function (label, i) {
      var row = el(canAnswer ? "label" : "div", "quiz-option");
      if (!canAnswer) {
        var chosen = result && result.answer, selected = !!chosen && (matching ? chosen[i] != null : chosen.includes(i));
        var correct = result && (matching ? chosen && chosen[i] === result.correct[i] : result.correct.includes(i));
        var key = result && matching ? q.options[result.correct[i]] : null;
        row.textContent = mark(correct, selected) + label;
        if (matching && key) {
          row.append(el("span", "quiz-answer-key", selected && !correct
            ? "You matched with " + q.options[chosen[i]] + " · Correct match is " + key : key));
        }
        if (result && (correct || selected || matching)) row.classList.add(correct || !selected ? "quiz-correct" : "quiz-wrong");
        if (result) row.classList.add("quiz-revealed");
      } else if (matching) {
        var select = el("select"), blank = el("option", "", "Choose a match");
        blank.value = "";
        select.append(blank);
        q.options.forEach(function (option, k) {
          var item = el("option", "", option);
          item.value = k;
          select.append(item);
        });
        select.required = true;
        select.setAttribute("aria-label", label);
        controls.push(select);
        row.append(el("span", "", label), select);
      } else {
        var input = el("input");
        input.type = q.format === "choice" ? "radio" : "checkbox";
        input.name = "answer";
        controls.push(input);
        row.append(input, el("span", "", label));
      }
      form.append(row);
    });
    if (matching && !result && !canAnswer) {
      var pool = el("ul", "quiz-match-pool");
      q.options.forEach(function (item) { pool.append(el("li", "", item)); });
      block.append(el("p", "quiz-meta", "Available matches"), pool);
    }
    if (canAnswer) {
      var action = el("button", "spin", "Submit answer"), status = el("p", "note");
      action.type = "submit";
      status.setAttribute("role", "status");
      form.append(action, status);
      form.onsubmit = function (e) {
        e.preventDefault();
        var selected = matching ? controls.map(function (c) { return Number(c.value); })
          : controls.map(function (c, i) { return c.checked ? i : -1; }).filter(function (i) { return i >= 0; });
        var shape = { format: q.format, left: q.left, options: q.options };
        if (!PGQuiz.validAnswer(shape, selected)) {
          status.textContent = matching ? "Use each match once." : "Select an answer before submitting.";
          return;
        }
        action.disabled = true;
        controls.forEach(function (c) { c.disabled = true; });
        status.textContent = "Sending answer…";
        submit(selected).catch(function () {
          action.disabled = false;
          controls.forEach(function (c) { c.disabled = false; });
          status.textContent = "The answer could not be sent. Try again.";
        });
      };
    }
    block.append(form);
    return block;
  }

  function bars(title, rows, max) {
    var section = el("section", "quiz-distribution");
    section.append(el("h3", "", title));
    rows.forEach(function (row) {
      var line = el("label", "quiz-chart-row");
      var track = el("meter");
      track.min = 0;
      track.max = Math.max(1, max);
      track.value = row[1];
      line.append(el("span", "", row[0]), track, el("strong", "", row[1]));
      section.append(line);
    });
    return section;
  }

  function distribution(q, stats) {
    var block = el("div", "quiz-results");
    var s = stats.summary;
    block.append(bars("Round result", [["Correct", s.correct], ["Incorrect", s.incorrect], ["Unanswered", s.unanswered]],
      s.correct + s.incorrect + s.unanswered));
    var answeredBy = stats.assigned + (stats.assigned === 1 ? " player" : " players");
    if (stats.matches) {
      q.left.forEach(function (label, i) {
        block.append(bars(label + " · " + answeredBy, q.options.map(function (option, k) {
          return [option, stats.matches[i][k]];
        }), stats.assigned));
      });
    } else {
      block.append(bars("Answer distribution · " + answeredBy, q.options.map(function (option, i) {
        return [option, stats.counts[i]];
      }), stats.assigned));
    }
    return block;
  }

  function leaderboard(rows, highest) {
    var section = el("section", "quiz-leaders");
    section.append(el("h2", "", "Leaderboard"));
    var list = el("ol", "quiz-ranking");
    rows.forEach(function (row) {
      var li = el("li", "quiz-rank");
      var move = el("span", "quiz-rank-move" + (row.move ? " quiz-rank-animated" : ""), row.move > 0 ? "↑" : row.move < 0 ? "↓" : "·");
      move.style.setProperty("--rank-start", row.move < 0 ? "-.35rem" : ".35rem");
      move.setAttribute("aria-label", row.move > 0 ? "Moved up" : row.move < 0 ? "Moved down" : "Rank unchanged");
      var name = el("strong", "", row.name);
      if (row.streak >= 3) name.append(el("span", "quiz-fire", " 🔥 " + row.streak));
      li.append(el("span", "", "#" + row.rank), move, name, el("span", "", row.score + " pts"));
      list.append(li);
    });
    section.append(list);
    if (highest) section.append(el("p", "quiz-streak", highest.name + " is on the highest streak · " + highest.streak + " correct 🔥"));
    return section;
  }

  function podium(rows) {
    var section = el("section");
    section.append(el("h2", "", "Final podium"));
    var podium = el("ol", "quiz-podium");
    [2, 1, 3].forEach(function (rank) {
      var row = rows.find(function (r) { return r.rank === rank; });
      if (!row) return;
      var place = el("li", "quiz-place");
      place.dataset.rank = rank;
      if (rank === 1) place.append(el("span", "quiz-crown", "♛"));
      place.append(el("strong", "", row.name), el("span", "", row.score + " pts"), el("b", "", rank));
      podium.append(place);
    });
    section.append(podium);
    return section;
  }

  return { el: el, button: button, clock: clock, question: question, distribution: distribution,
    leaderboard: leaderboard, podium: podium };
})();
