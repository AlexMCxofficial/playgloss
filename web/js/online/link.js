// Reads a join link that a person pastes, types or scans. MIT License (see LICENSE).
// A link looks like  http://192.168.1.23:49152/join.html#<43 secret characters>
// Only addresses on a private network (home or office) are accepted, so a link can never point the game at
// a server on the internet. Nothing here uses the network.
var Link = (function () {
  "use strict";

  // "192.168.1.23:49152": a private IPv4 address and a port of 1024 or higher.
  function hostOk(h) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{4,5})$/.exec(String(h || ""));
    if (!m) return false;
    var parts = m.slice(1, 5), o = parts.map(Number), port = Number(m[5]);
    if (parts.some(function (s) { return s.length > 1 && s.charAt(0) === "0"; })) return false;
    if (o.some(function (n) { return n > 255; }) || port < 1024 || port > 65535) return false;
    return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168) || (o[0] === 169 && o[1] === 254);
  }

  // Returns { host, key, url } for a good link, or null. The "http://" at the start may be left out.
  function parse(text) {
    var m = /^(?:http:\/\/)?([0-9.]+:[0-9]+)\/(join\.html|quiz-join\.html)#([A-Za-z0-9_-]{43})$/i.exec(String(text || "").trim());
    if (!m || !hostOk(m[1])) return null;
    var page = m[2].toLowerCase();
    var link = { host: m[1], key: m[3], url: "http://" + m[1] + "/" + page + "#" + m[3] };
    if (page === "quiz-join.html") link.page = page;
    return link;
  }

  // The same game, joined from inside the app (the app talks to the host for you).
  function appUrl(l) { return (l.page === "quiz-join.html" ? l.page : "join.html") + "?h=" + encodeURIComponent(l.host) + "#" + l.key; }

  return { hostOk: hostOk, parse: parse, appUrl: appUrl };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Link;
