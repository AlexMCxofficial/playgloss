// Online play: the encryption shared by the host (the app) and the guests (a browser). MIT License (see LICENSE).
// It uses TweetNaCl (js/vendor/nacl-fast.min.js), which was audited by Cure53. Nothing here invents its own crypto.
//
//   Lobby key (K): 32 random bytes made by the host and put in the part of the link after the "#". Browsers never
//     send that part to a server, so it only travels by the QR code or the link you share yourself.
//     It protects the join request and the host's answer.
//   Session key (S): made from a fresh key pair on each side (X25519), so other guests who know K cannot read it.
//     It protects everything during the game.
//   Every message is encrypted and checked (XSalsa20-Poly1305) with a new random nonce. A session message also carries
//     a counter and its direction, so changed, forged, replayed, old and reflected messages are dropped.
// The relay in src-tauri/src/lan.rs only ever sees the base64url text these functions produce.
var Proto = (function () {
  "use strict";
  var enc = new TextEncoder(), dec = new TextDecoder();

  // base64url without padding (safe in links and in the relay's allowed characters)
  function b64e(u8) {
    var s = "";
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64d(str) {
    str = String(str);
    if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error("not base64url");
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    var s = atob(str), u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  function seal(key, obj) {
    var n = nacl.randomBytes(24), c = nacl.secretbox(enc.encode(JSON.stringify(obj)), n, key), out = new Uint8Array(24 + c.length);
    out.set(n); out.set(c, 24);
    return b64e(out);
  }
  // returns the message, or null if it is not genuine
  function open(key, text) {
    try {
      var u = b64d(text);
      if (u.length < 24 + 16) return null;
      var m = nacl.secretbox.open(u.subarray(24), u.subarray(0, 24), key);
      if (!m) return null;
      var o = JSON.parse(dec.decode(m));
      return o && typeof o === "object" && !Array.isArray(o) ? o : null;
    } catch (e) { return null; }
  }
  // One side of a session. me is "h" (the host) or "g" (a guest). It numbers what it sends, and only accepts
  // messages from the other side whose number is higher than the last one it accepted.
  function channel(key, me) {
    var out = 0, last = 0;
    return {
      send:function (o) { o.s = ++out; o.d = me; return seal(key, o); },
      recv:function (text) {
        var o = open(key, text);
        if (!o || o.d === me || (o.d !== "h" && o.d !== "g") || typeof o.s !== "number" || o.s <= last) return null;
        last = o.s;
        return o;
      }
    };
  }
  // 32 lowercase hex characters: the id a guest uses with the relay
  function hexId() {
    var u = nacl.randomBytes(16), s = "";
    for (var i = 0; i < u.length; i++) s += (u[i] < 16 ? "0" : "") + u[i].toString(16);
    return s;
  }
  function key32(text) {
    try { var u = b64d(text); return u.length === 32 ? u : null; } catch (e) { return null; }
  }

  /* ---------- the join handshake ---------- */
  // Guest: ask to join. Keep id and pair; send text to the host.
  function guestHello(K, names) {
    var id = hexId(), pair = nacl.box.keyPair();
    return { id:id, pair:pair, text:seal(K, { t:"hello", pk:b64e(pair.publicKey), names:names }) };
  }
  // Host: read a join request. Returns { pk, names } or null if it is not genuine (names still need checking).
  function hostReadHello(K, text) {
    var o = open(K, text), pk;
    if (!o || o.t !== "hello" || typeof o.pk !== "string") return null;
    pk = key32(o.pk);
    return pk ? { pk:pk, names:o.names } : null;
  }
  // Host: approve. Send text to the guest, and use chan for everything after that.
  function hostAccept(K, hello) {
    var kp = nacl.box.keyPair();
    return { text:seal(K, { t:"ok", pk:b64e(kp.publicKey) }), chan:channel(nacl.box.before(hello.pk, kp.secretKey), "h") };
  }
  function hostRefuse(K, why) { return seal(K, { t:"no", why:String(why).slice(0, 60) }); }
  // Guest: read the host's answer. Returns { ok:true, chan }, { ok:false, why } or null if it is not genuine.
  function guestAnswer(K, pair, text) {
    var o = open(K, text), pk;
    if (!o) return null;
    if (o.t === "no") return { ok:false, why:String(o.why || "") };
    if (o.t !== "ok" || typeof o.pk !== "string") return null;
    pk = key32(o.pk);
    return pk ? { ok:true, chan:channel(nacl.box.before(pk, pair.secretKey), "g") } : null;
  }

  return {
    b64e:b64e, b64d:b64d, seal:seal, open:open, channel:channel, hexId:hexId,
    newKey:function () { return nacl.randomBytes(32); },
    guestHello:guestHello, hostReadHello:hostReadHello, hostAccept:hostAccept, hostRefuse:hostRefuse, guestAnswer:guestAnswer
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Proto;
