// Saving and loading small text files (configurations and word lists) in a way that works on every device. MIT License (see LICENSE).
// Windows, macOS, Linux, Android and the website do not all let a web page write a file the same way, so every export has three ways
// out in one box: Save file (a download, or the share sheet on phones), Copy, and the text itself. Every import accepts a
// file or pasted text. Nothing is sent anywhere; the text only moves between this page and the device.
var PGTransfer = (function () {
  "use strict";
  var MAX_TEXT = 2 * 1024 * 1024, SHOW = 40000;
  var h = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  function modal(title, label) {
    var dlg = h("dialog", "xfer"), head = h("h2", "", title), body = h("div", "xfer-body"), msg = h("p", "note xfer-msg"), row = h("div", "row");
    head.id = "xfer-title-" + Math.random().toString(36).slice(2, 8);
    dlg.setAttribute("aria-labelledby", head.id);
    msg.setAttribute("role", "status"); msg.setAttribute("aria-live", "polite");
    dlg.appendChild(head); dlg.appendChild(body); dlg.appendChild(msg); dlg.appendChild(row);
    var close = h("button", "small", label || "Close"); close.type = "button";
    close.onclick = function () { dlg.close(); };
    dlg.addEventListener("close", function () { if (dlg.parentNode) dlg.parentNode.removeChild(dlg); });
    document.body.appendChild(dlg);
    return { dlg: dlg, body: body, msg: msg, row: row, close: close, open: function () { row.appendChild(close); dlg.showModal(); } };
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime + ";charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, no) {
      var t = h("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(t); t.select();
      var done = false; try { done = document.execCommand("copy"); } catch (e) { done = false; }
      document.body.removeChild(t); done ? ok() : no(new Error("copy failed"));
    });
  }

  // o: { title, note, filename, mime, text, onDone() } - onDone runs when the box is closed.
  function exportFile(o) {
    var m = modal(o.title, "Close"), area = h("textarea", "xfer-text"), text = String(o.text);
    area.readOnly = true; area.rows = 8; area.spellcheck = false; area.setAttribute("aria-label", o.title + " (text)");
    area.value = text.length > SHOW ? text.slice(0, SHOW) + "\n... (the rest is in the saved file and the copy)" : text;
    if (o.note) m.body.appendChild(h("p", "note", o.note));
    m.body.appendChild(area);
    var save = h("button", "spin", "Save file"), cp = h("button", "small", "Copy to clipboard");
    save.type = cp.type = "button";
    save.onclick = function () {
      var file = null;
      try { file = typeof File === "function" ? new File([text], o.filename, { type: o.mime }) : null; } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        navigator.share({ files: [file], title: o.filename }).then(function () { m.msg.textContent = "Shared."; },
          function (e) { if (e && e.name === "AbortError") return; download(o.filename, text, o.mime); m.msg.textContent = "Saved as " + o.filename + " (check your Downloads). If nothing was saved, use Copy."; });
        return;
      }
      download(o.filename, text, o.mime);
      m.msg.textContent = "Saved as " + o.filename + " (check your Downloads). If nothing was saved, use Copy.";
    };
    cp.onclick = function () {
      copy(text).then(function () { m.msg.textContent = "Copied. Paste it into a note or a file."; },
        function () { area.readOnly = true; area.focus(); area.select(); m.msg.textContent = "Select the text above and copy it by hand."; });
    };
    m.row.appendChild(save); m.row.appendChild(cp);
    m.dlg.addEventListener("close", function () { if (o.onDone) o.onDone(); });
    m.open(); area.scrollTop = 0; save.focus();
  }

  // o: { title, note, accept, onText(text) -> { ok, error?, message? } }. The box stays open until the text is accepted.
  function importFile(o) {
    var m = modal(o.title, "Cancel"), area = h("textarea", "xfer-text"), pick = h("input"), go = h("button", "spin", "Import");
    pick.type = "file"; pick.accept = o.accept || ".json,.txt,.csv,application/json,text/plain,text/csv"; pick.setAttribute("aria-label", "Choose a file");
    area.rows = 6; area.spellcheck = false; area.placeholder = "...or paste the text here"; area.setAttribute("aria-label", "Pasted text");
    go.type = "button";
    if (o.note) m.body.appendChild(h("p", "note", o.note));
    m.body.appendChild(pick); m.body.appendChild(area);
    pick.onchange = function () {
      var f = pick.files && pick.files[0];
      if (!f) return;
      if (f.size > MAX_TEXT) { m.msg.textContent = "That file is too big (the limit is 2 MB)."; pick.value = ""; return; }
      var r = new FileReader();
      r.onerror = function () { m.msg.textContent = "The file could not be read."; };
      r.onload = function () { area.value = String(r.result).slice(0, MAX_TEXT); m.msg.textContent = "File loaded. Press Import."; };
      r.readAsText(f);
    };
    go.onclick = function () {
      var text = area.value;
      if (!text.trim()) { m.msg.textContent = "Choose a file or paste the text first."; return; }
      if (text.length > MAX_TEXT) { m.msg.textContent = "That text is too big (the limit is 2 MB)."; return; }
      var res = o.onText(text) || {};
      if (res.ok) { m.dlg.close(); if (o.onDone) o.onDone(res); } else m.msg.textContent = "Import failed: " + (res.error || "unknown problem") + " Nothing was changed.";
    };
    m.row.appendChild(go);
    m.open();
  }

  return { exportFile: exportFile, importFile: importFile, MAX_TEXT: MAX_TEXT };
})();
