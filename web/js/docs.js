// Documentation page: tabs (groups) and sub-tabs (pages) in a sidebar or drawer, search, and previous/next links.
// The text lives in docs.html as <section data-doc="group/page" data-group="..." data-title="...">, so it still reads fine
// without this script. The side and the open/closed state come from docsprefs.js. MIT License (see LICENSE).
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var P = window.PGDocs, article = $("docs-article"), nav = $("docs-nav"), sidebar = $("docs-sidebar");
  var input = $("docs-search-input"), results = $("docs-search-results"), pager = $("docs-pager");
  var toggle = $("docs-sidebar-toggle"), menuBtn = $("docs-menu-btn"), closeBtn = $("docs-close"), backdrop = $("docs-backdrop");
  var groups = [], pages = [], byId = {}, current = null, drawerOpen = false, pendingTerms = null, expanded = {};
  var SVG_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  // ---------- read the pages from the HTML ----------
  Array.prototype.forEach.call(article.querySelectorAll("section[data-doc]"), function (el) {
    var id = el.getAttribute("data-doc"), gid = id.split("/")[0], g = groups.filter(function (x) { return x.id === gid; })[0];
    if (!g) { g = { id: gid, title: el.getAttribute("data-group"), pages: [] }; groups.push(g); }
    var page = { id: id, title: el.getAttribute("data-title"), group: g, el: el, index: pages.length,
      text: (el.textContent || "").replace(/\s+/g, " ").trim() };
    g.pages.push(page); pages.push(page); byId[id] = page;
  });
  if (!pages.length) return;

  // ---------- navigation tree ----------
  function buildNav() {
    groups.forEach(function (g) {
      var wrap = document.createElement("div"); wrap.className = "docs-group";
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "docs-group-btn"; btn.id = "dg-" + g.id;
      btn.setAttribute("aria-controls", "dgl-" + g.id);
      btn.innerHTML = "<span></span>" + SVG_CHEVRON;
      btn.firstChild.textContent = g.title;
      var list = document.createElement("ul"); list.className = "docs-pages"; list.id = "dgl-" + g.id;
      g.pages.forEach(function (p) {
        var li = document.createElement("li"), a = document.createElement("a");
        a.href = "#" + p.id; a.textContent = p.title; a.setAttribute("data-page", p.id);
        li.appendChild(a); list.appendChild(li);
      });
      btn.addEventListener("click", function () { expanded[g.id] = !expanded[g.id]; paintGroups(); });
      wrap.appendChild(btn); wrap.appendChild(list); nav.appendChild(wrap);
      g.btn = btn; g.wrap = wrap;
    });
  }
  function paintGroups() {
    groups.forEach(function (g) {
      var on = !!expanded[g.id];
      g.btn.setAttribute("aria-expanded", on);
      g.wrap.classList.toggle("is-open", on);
      g.wrap.classList.toggle("has-current", !!current && current.group === g);
    });
  }

  // ---------- showing one page ----------
  function clearMarks() {
    Array.prototype.forEach.call(article.querySelectorAll("mark.docs-hit"), function (m) {
      var parent = m.parentNode; parent.replaceChild(document.createTextNode(m.textContent), m); parent.normalize();
    });
  }
  function termRegex(terms) {
    var parts = terms.slice().sort(function (a, b) { return b.length - a.length; }).map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
    return new RegExp("(" + parts.join("|") + ")", "gi");
  }
  function markTerms(root, terms) {
    if (!terms || !terms.length) return null;
    var re = termRegex(terms), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), nodes = [], n, first = null;
    while ((n = walker.nextNode())) { if (n.nodeValue.trim() && !n.parentNode.closest("mark")) nodes.push(n); }
    nodes.forEach(function (node) {
      var text = node.nodeValue; re.lastIndex = 0;
      if (!re.test(text)) return;
      var frag = document.createDocumentFragment(); re.lastIndex = 0;
      text.split(re).forEach(function (part, i) {
        if (i % 2) { var m = document.createElement("mark"); m.className = "docs-hit"; m.textContent = part; frag.appendChild(m); if (!first) first = m; }
        else if (part) frag.appendChild(document.createTextNode(part));
      });
      node.parentNode.replaceChild(frag, node);
    });
    return first;
  }

  function show(id, fromSearch) {
    var page = byId[id] || pages[0];
    clearMarks();
    pages.forEach(function (p) { p.el.hidden = p !== page; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-page]"), function (a) {
      if (a.getAttribute("data-page") === page.id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    current = page; expanded[page.group.id] = true; paintGroups();
    $("docs-breadcrumb").textContent = page.group.title + " \u203A " + page.title;
    $("docs-menu-current").textContent = page.title;
    document.title = page.title + " - Documentation - PlayGloss";
    paintPager();
    var hit = fromSearch ? markTerms(page.el, pendingTerms) : null;
    pendingTerms = null;
    if (hit) hit.scrollIntoView({ block: "center" });
    else window.scrollTo(0, 0);
  }
  function paintPager() {
    pager.textContent = "";
    [[pages[current.index - 1], "Previous", "prev"], [pages[current.index + 1], "Next", "next"]].forEach(function (x) {
      if (!x[0]) return;
      var a = document.createElement("a"); a.className = "docs-pager-" + x[2]; a.href = "#" + x[0].id;
      var s = document.createElement("small"), t = document.createElement("span");
      s.textContent = x[1]; t.textContent = x[0].title; a.appendChild(s); a.appendChild(t); pager.appendChild(a);
    });
    pager.hidden = !pager.children.length;
  }
  function hashId() {
    try { return decodeURIComponent((location.hash || "").slice(1)); } catch (e) { return ""; }
  }
  function fromHash() {
    show(hashId(), pendingTerms !== null);
    if (!P.isWide()) setDrawer(false);
  }

  // ---------- search ----------
  function terms(q) { return q.toLowerCase().split(/\s+/).filter(Boolean); }
  function find(q) {
    var ts = terms(q), out = [];
    pages.forEach(function (p) {
      var title = p.title.toLowerCase(), group = p.group.title.toLowerCase(), text = p.text.toLowerCase(), score = 0, ok = true;
      ts.forEach(function (t) {
        var inTitle = title.indexOf(t) >= 0, inGroup = group.indexOf(t) >= 0, at = text.indexOf(t);
        if (!inTitle && !inGroup && at < 0) { ok = false; return; }
        score += (inTitle ? 10 : 0) + (inGroup ? 3 : 0) + (at >= 0 ? 1 + Math.min(4, text.split(t).length - 2) : 0);
      });
      if (ok) out.push({ page: p, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score || a.page.index - b.page.index; });
    return out;
  }
  function snippet(text, ts) {
    var low = text.toLowerCase(), at = -1;
    ts.forEach(function (t) { var i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; });
    if (at < 0) return text.slice(0, 110) + (text.length > 110 ? "\u2026" : "");
    var from = Math.max(0, at - 35), to = Math.min(text.length, at + 95);
    return (from ? "\u2026" : "") + text.slice(from, to) + (to < text.length ? "\u2026" : "");
  }
  function highlight(el, text, ts) {
    var re = termRegex(ts);
    text.split(re).forEach(function (part, i) {
      if (i % 2) { var m = document.createElement("mark"); m.textContent = part; el.appendChild(m); }
      else if (part) el.appendChild(document.createTextNode(part));
    });
  }
  var shown = [];
  function renderResults() {
    var q = input.value.trim(), searching = q.length > 0;
    results.hidden = !searching; nav.hidden = searching;
    results.textContent = "";
    shown = [];
    if (!searching) return;
    var ts = terms(q), found = find(q), summary = document.createElement("p");
    summary.className = "docs-results-count";
    summary.textContent = found.length ? found.length + (found.length === 1 ? " result" : " results") : "No results for \u201C" + q + "\u201D. Try a shorter or different word.";
    results.appendChild(summary);
    if (!found.length) return;
    var ul = document.createElement("ul");
    found.forEach(function (f) {
      var li = document.createElement("li"), a = document.createElement("a"), t = document.createElement("strong"), g = document.createElement("small"), s = document.createElement("span");
      a.href = "#" + f.page.id; a.className = "docs-result";
      highlight(t, f.page.title, ts); g.textContent = f.page.group.title; highlight(s, snippet(f.page.text, ts), ts);
      a.appendChild(g); a.appendChild(t); a.appendChild(s);
      a.addEventListener("click", function () { pendingTerms = ts; if (location.hash === "#" + f.page.id) { fromHash(); } });
      li.appendChild(a); ul.appendChild(li); shown.push(a);
    });
    results.appendChild(ul);
  }
  input.addEventListener("input", renderResults);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && input.value) { input.value = ""; renderResults(); e.stopPropagation(); }
    else if (e.key === "ArrowDown" && shown.length) { e.preventDefault(); shown[0].focus(); }
    else if (e.key === "Enter" && shown.length) { e.preventDefault(); shown[0].click(); if (location.hash !== shown[0].hash) location.hash = shown[0].hash; }
  });
  results.addEventListener("keydown", function (e) {
    var i = shown.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); if (shown[i + 1]) shown[i + 1].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); (i ? shown[i - 1] : input).focus(); }
  });

  // ---------- sidebar (large screens) and drawer (tablets and phones) ----------
  function layout() {
    var wide = P.isWide(), open = wide ? P.open() : drawerOpen;
    sidebar.classList.toggle("is-open", open);
    backdrop.hidden = wide || !drawerOpen;
    toggle.setAttribute("aria-expanded", open);
    toggle.setAttribute("aria-label", (open ? "Hide" : "Show") + " documentation navigation");
    menuBtn.setAttribute("aria-expanded", drawerOpen);
    if (wide) { document.body.classList.remove("docs-lock"); }
    else document.body.classList.toggle("docs-lock", drawerOpen);
    if (wide && drawerOpen) drawerOpen = false;
  }
  function setDrawer(on, restoreFocus) {
    drawerOpen = on; layout();
    if (on) closeBtn.focus();
    else if (restoreFocus) menuBtn.focus();
  }
  toggle.addEventListener("click", function () { P.setOpen(!P.open()); });
  menuBtn.addEventListener("click", function () { setDrawer(!drawerOpen); });
  closeBtn.addEventListener("click", function () { setDrawer(false, true); });
  backdrop.addEventListener("click", function () { setDrawer(false, true); });
  P.subscribe(layout);
  sidebar.addEventListener("click", function (e) { if (e.target.closest("a[href]") && !P.isWide()) setDrawer(false); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawerOpen) { setDrawer(false, true); return; }
    if (e.key === "Tab" && drawerOpen) { // keep the keyboard inside the open drawer
      var f = Array.prototype.filter.call(sidebar.querySelectorAll("a[href],button,input"), function (x) { return !x.closest("[hidden]") && !x.disabled; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) {
      e.preventDefault();
      if (P.isWide()) { if (!P.open()) P.setOpen(true); } else setDrawer(true);
      input.focus();
    }
  });

  buildNav();
  window.addEventListener("hashchange", fromHash);
  layout();
  show(hashId());
})();
