// The packed word file must hold exactly the same words as the readable lists it is made from.
// Run: node tests/test_words.js   (rebuild the pack first with: python3 tools/pack_words.py)
"use strict";
const fs = require("fs"), vm = require("vm"), assert = require("assert"), path = require("path");
const root = path.join(__dirname, "..");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "web/js/words.js"), "utf8"), ctx, { filename: "web/js/words.js" });
const Words = ctx.Words;
const src = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
// Since 0.1.6 there is one list (1,400 words per level); Extreme mode reads the same one.
const lists = { false: src("tools/data/words.json"), true: src("tools/data/words.json") };

let checked = 0;
for (const extreme of [false, true]) { // both ask for the same list
  for (const id of Object.keys(lists[extreme])) {
    const want = lists[extreme][id];
    assert.strictEqual(Words.count(id, extreme), want.length, id + " count");
    want.forEach((w, k) => {
      const got = Words.get(id, extreme, k);
      assert.strictEqual(JSON.stringify(got), JSON.stringify({ word: w.word, meaning: w.meaning, wrong: w.wrong }), id + " #" + k);
      assert.strictEqual(Words.word(id, extreme, k), w.word);
      checked++;
    });
  }
}
console.log("ok  the packed file matches the readable lists word for word (" + checked + " words)");
assert.strictEqual(JSON.stringify(Words.levels()), JSON.stringify(Object.keys(lists.false)));
assert.strictEqual(Words.count("nope", true), 0);
console.log("ok  levels are in game order; an unknown level is empty");
