// Offline name filter. MIT License (see LICENSE).
// Blocks obvious slurs and swear words, including common disguises such as f*ck, n1gg3r, sh1t or f u c k.
// It is a basic filter: English only, and it cannot catch everything.
var Filter = (function () {
  var LEET = { "@":"a", "4":"a", "3":"e", "1":"i", "!":"i", "|":"i", "0":"o", "$":"s", "5":"s", "7":"t", "+":"t" };
  // Tested against all the letters of the name joined together, so spaced-out letters are caught too.
  var ANY = [/f+[uv]*c+k/, /f+c+u+k/, /n+i+[gq]{2,}/, /f+a+g+g+[oe]+t/, /a+s+s+h+o+l+e/];
  // Tested one word at a time, so innocent words such as "Scunthorpe" pass.
  var PART = [/s+h+i+t/, /b+i+t+c+h/, /w+h+o+r+e/];
  // The whole word must match. Also tried on the joined letters, so "c u n t" is caught.
  var WHOLE = [/^c+u+n+t+s?$/, /^s+l+u+t+s?$/, /^(kike|chink|spic|tranny|trannie|retard|retarded)s?$/];
  var OK = { mishit:1, mishits:1, mishitting:1, shiitake:1, shiitakes:1 };

  function bad(name) {
    var s = String(name).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[@4310!|$57+]/g, function (c) { return LEET[c]; });
    var joined = s.replace(/[^a-z]/g, "");
    if (ANY.some(function (r) { return r.test(joined); }) || WHOLE.some(function (r) { return r.test(joined); })) return true;
    return s.split(/[^a-z]+/).some(function (w) {
      return w && !OK[w] && (PART.concat(WHOLE).some(function (r) { return r.test(w); }));
    });
  }
  return { bad:bad };
})();
