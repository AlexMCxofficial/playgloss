// Release checks for files that must ship together. Run: node tests/test_assets.js
// 1) every file the guest page needs is on the host's download whitelist (src-tauri/src/lan.rs)
// 2) every file the offline cache lists really exists
// 3) the Extreme word list has the flipped word counts and no word is used twice
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
ids.forEach(function (id, i) {
  var want = W.count(ids[ids.length - 1 - i], false);
  assert.strictEqual(W.count(id, true), want, id + " should have " + want + " Extreme words");
  for (var k = 0; k < want; k++) {
    var w = W.get(id, true, k);
    assert(!seen[w.word], "word used twice: " + w.word); seen[w.word] = 1;
    assert(w.meaning && w.wrong.length === 3, "bad entry: " + w.word);
  }
});
console.log("ok  Extreme word list has the flipped counts and no repeats");
