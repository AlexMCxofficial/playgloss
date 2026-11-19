// Offline name filter. MIT License (see LICENSE).
// Blocks slurs, strong swear words and rude acronyms, including common disguises:
//   symbols and numbers (sh*t, n1gg3r, f@ggot), masked letters (f**k), spaced-out or repeated letters (f u c k, fuuuck),
//   look-alike letters from other alphabets, and acronyms such as stfu or sybau (also written s t f u).
// Mild words such as "damn" and "hell" are fine. It is a basic filter: English only, and it cannot catch everything.
// To add a word, add it to one of the lists below (the notes say which list fits).
var Filter = (function () {
  // Look-alike letters from other alphabets (accents and full-width letters are handled by normalize("NFKD")).
  var LOOK = {
    "а":"a", "е":"e", "о":"o", "р":"p", "с":"c", "у":"y", "х":"x", "і":"i", "ї":"i",
    "к":"k", "м":"m", "н":"h", "т":"t", "в":"b", "ѕ":"s", "ј":"j", "ӏ":"i",
    "α":"a", "β":"b", "ε":"e", "ι":"i", "κ":"k", "ν":"v", "ο":"o", "ρ":"p", "τ":"t",
    "υ":"u", "χ":"x", "η":"n", "μ":"u",
    "ø":"o", "ł":"l", "đ":"d", "ı":"i", "ħ":"h", "ŧ":"t", "ß":"ss"
  };
  // Symbols and numbers that stand for letters.
  var SYM = { "@":"a", "!":"i", "|":"i", "$":"s", "+":"t", "(":"c", "¢":"c", "€":"e", "£":"l" };
  var NUM = { "4":"a", "3":"e", "1":"i", "0":"o", "5":"s", "7":"t", "8":"b", "9":"g" };
  // Characters people use to hide a letter, as in f**k or n*gga. They become a "*" that can stand for one letter.
  var MASK = /[*#%?^~&=]/g;

  // Builds a pattern from a word. Letters may repeat (fuuuck); every letter except the first may be hidden by "*".
  // A group such as [uv] allows several letters in one place.
  function mk(spec) {
    var t = spec.match(/\[[^\]]+\]|./g);
    return t.map(function (x, i) { return i ? "(?:" + x + "+|\\*+)" : x + "+"; }).join("");
  }
  function list(specs) { return specs.map(mk); }
  function any(src) { return new RegExp(src.join("|")); }
  function whole(src) { return new RegExp("^(?:" + src.join("|") + ")$"); }

  // 1) ANY: found anywhere in the letters of the whole name joined together, so spaced-out letters are caught too.
  //    Only for words that never appear inside innocent words.
  var ANY = any(list([
    "f[uv]ck", "fck", "fcuk", "phuck", "asshole", "arsehole", "faggot", "ni[gq][gq]", "shemale", "blowjob",
    "pussy", "dickhead", "hitler", "towelhead", "raghead", "wetback", "cocksucker"
  ]));
  // 2) PART: found inside a single word (so "Shiitake" passes). Keep this list short: "Scunthorpe", "Slutsky",
  //    "Pornchai" and "Nazia" are real, so cunt, slut, porn and nazi are in the WHOLE list instead.
  var PART_SRC = list(["sh[iy]t", "bitch", "biatch", "whore"]);
  var PART = any(PART_SRC);
  // 3) WHOLE: the word must be exactly this. Also tried on the joined letters, so "c u n t" is caught.
  //    Slurs, short rude words, and rude acronyms (stfu = shut the fuck up, sybau = shut your b*tch a** up, kys = kill yourself).
  var WHOLE = whole(list([
    "cunt", "cunts", "slut", "sluts", "sh[iy]t", "sht", "bitch", "bitches", "whore", "whores",
    "kike", "kikes", "chink", "chinks", "spic", "spics", "gook", "gooks", "coon", "coons", "paki", "tranny", "trannie", "trannies",
    "retard", "retards", "retarded", "spaz", "mongoloid", "fag", "fags", "faggy", "nibba", "nibbas", "ngga", "nggas", "nggah", "ngger", "nggers",
    "fuk", "fuq", "fuc", "fku", "fkyou", "fukyou", "fuqyou", "fkoff", "fukoff", "beaner", "beaners",
    "dick", "dicks", "cock", "cocks", "cum", "porn", "rape", "rapes", "rapist", "wanker", "twat", "nazi", "nazis", "kkk",
    "stfu", "stfd", "sybau", "syfm", "kys", "gtfo"
  ]));

  // Words that look like a bad word but are fine.
  var OK = { mishit:1, mishits:1, mishitting:1, shiitake:1, shiitakes:1, shitake:1, shitakes:1 };

  // Turns a name into the letters we check. "digits" says whether numbers count as letters (n1gg3r) or are dropped (stfu69).
  function normalize(name, digits) {
    var s = String(name).toLowerCase().normalize("NFKD")
      .replace(/[̀-ͯ​-‏⁠﻿­]/g, "")
      .replace(/[^\x00-\x7f]/g, function (c) { return LOOK[c] || c; })
      .replace(/[@!|$+(¢€£]/g, function (c) { return SYM[c]; });
    if (digits) s = s.replace(/[0-9]/g, function (c) { return NUM[c] || c; });
    return s.replace(MASK, "*");
  }

  // Merges runs of single letters ("s t f u" -> "stfu") so spaced-out words are checked as one word.
  function words(s) {
    var out = [], run = "";
    s.split(/[^a-z*]+/).forEach(function (w) {
      if (w.length === 1) { run += w; return; }
      if (run) { out.push(run); run = ""; }
      if (w) out.push(w);
    });
    if (run) out.push(run);
    return out;
  }

  function check(s) {
    var joined = s.replace(/[^a-z*]/g, "");
    if (ANY.test(joined) || WHOLE.test(joined)) return true;
    // "n-gga" and "n.gga": a dash, dot or underscore may hide a letter. Only used for the worst slur.
    if (ANY.test(s.replace(/([a-z*])[.\-_]+(?=[a-z*])/g, "$1*").replace(/[^a-z*]/g, ""))) return true;
    // A whole name written with a space inside a word ("s hit") is also caught.
    if (new RegExp("^(?:" + PART_SRC.join("|") + ")$").test(joined)) return true;
    return words(s).some(function (w) { return !OK[w] && (PART.test(w) || WHOLE.test(w) || ANY.test(w)); });
  }

  function bad(name) {
    return check(normalize(name, true)) || check(normalize(name, false));
  }
  return { bad:bad };
})();
