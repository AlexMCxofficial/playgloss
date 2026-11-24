// Release checks for files that must ship together. Run: node tests/test_assets.js
// 1) every file the guest page needs is on the host's download whitelist (src-tauri/src/lan.rs)
// 2) every file the offline cache lists really exists
// 3) every level has 1,400 words (11,200 in all), no word is used twice, and the wrong meanings are real
var assert = require("assert"), fs = require("fs"), path = require("path");
var root = path.join(__dirname, "..");
var read = function (p) { return fs.readFileSync(path.join(root, p), "utf8"); };

var lan = read("src-tauri/src/lan.rs"), block = /const ASSETS: \[&str; (\d+)\] = \[([\s\S]*?)\];/.exec(lan);
var served = block[2].match(/"[^"]+"/g).map(function (s) { return s.slice(1, -1); });
assert.strictEqual(served.length, Number(block[1]), "ASSETS length must match its declared size");

var join = read("web/join.html"), needs = [];
join.replace(/<script src="([^"]+)"/g, function (m, p) { needs.push("/" + p); });
join.replace(/<link rel="stylesheet" href="([^"]+)"/g, function (m, p) { needs.push("/" + p); });
needs.push("/img/heart.png"); // View.hearts draws it on the guest's screen in Infinite mode
needs.forEach(function (p) { assert(served.indexOf(p) >= 0, "guests cannot download " + p + " (add it to ASSETS in lan.rs)"); });
console.log("ok  guest page files are all on the host's whitelist (" + needs.length + " checked)");

var sw = read("web/sw.js"), files = new Function(sw.replace(/self\.addEventListener[\s\S]*$/, "") + ";return FILES")();
files.forEach(function (f) { if (f !== "./") assert(fs.existsSync(path.join(root, "web", f)), "sw.js lists a missing file: " + f); });
console.log("ok  every file in the offline cache exists (" + files.length + " checked)");

var W = new Function(read("web/js/words.js") + ";return Words")();
var ids = W.levels(), seen = {};
assert.strictEqual(ids.length, 8, "eight levels");
ids.forEach(function (id) {
  // 0.1.6: every level has 1,400 words, in Default and in Extreme (both read the same list)
  assert.strictEqual(W.count(id, false), 1400, id + " should have 1400 words");
  assert.strictEqual(W.count(id, true), 1400, id + " should have 1400 words in Extreme too");
  for (var k = 0; k < 1400; k++) {
    var w = W.get(id, false, k);
    assert(!seen[w.word], "word used twice: " + w.word); seen[w.word] = 1;
    assert(w.meaning && w.wrong.length === 3, "bad entry: " + w.word);
    assert(w.wrong.every(function (x) { return x && x !== w.meaning; }) && new Set(w.wrong).size === 3, "wrong meanings must differ from the right one and from each other: " + w.word);
  }
});
console.log("ok  every level has 1,400 words, no word is used twice and every question has 3 different wrong meanings");
