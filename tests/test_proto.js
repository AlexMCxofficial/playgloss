// Tests for the online play encryption. Run:  node tests/test_proto.js
// Everything here must pass before the online play code is used: forged, changed, replayed, reflected and
// eavesdropped messages must all fail, and a normal join and chat must work.
"use strict";
const assert = require("assert");
global.nacl = require("../web/js/vendor/nacl-fast.min.js");
const Proto = require("../web/js/online/proto.js");
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const flip = (text, i) => { const u = Proto.b64d(text); u[i] ^= 1; return Proto.b64e(u); };

test("base64url round trip and strictness", () => {
  for (let len = 0; len < 80; len++) {
    const u = nacl.randomBytes(len);
    assert.deepStrictEqual(Array.from(Proto.b64d(Proto.b64e(u))), Array.from(u));
    assert.ok(/^[A-Za-z0-9_-]*$/.test(Proto.b64e(u)));
  }
  assert.throws(() => Proto.b64d("ab+/"));
  assert.throws(() => Proto.b64d("ab=="));
});

test("ids match the relay's rule (32 lowercase hex) and do not repeat", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) { const id = Proto.hexId(); assert.ok(/^[0-9a-f]{32}$/.test(id)); assert.ok(!seen.has(id)); seen.add(id); }
});

test("seal and open: round trip, wrong key, changed or cut text, junk", () => {
  const K = Proto.newKey(), msg = { t:"x", list:[1, 2, 3], s:"ünïcödé ✓" }, text = Proto.seal(K, msg);
  assert.deepStrictEqual(Proto.open(K, text), msg);
  assert.strictEqual(Proto.open(Proto.newKey(), text), null);
  const len = Proto.b64d(text).length;
  for (let i = 0; i < len; i++) assert.strictEqual(Proto.open(K, flip(text, i)), null, "byte " + i);
  assert.strictEqual(Proto.open(K, text.slice(0, -4)), null);
  ["", "a", "!!!!", "AAAA", Proto.b64e(nacl.randomBytes(100)), "e30"].forEach((j) => assert.strictEqual(Proto.open(K, j), null));
  assert.notStrictEqual(Proto.seal(K, msg), Proto.seal(K, msg), "every message gets a new nonce");
});

test("a message that is not a JSON object is refused", () => {
  const K = Proto.newKey(), enc = (v) => { const nn = nacl.randomBytes(24), c = nacl.secretbox(new TextEncoder().encode(v), nn, K), o = new Uint8Array(24 + c.length); o.set(nn); o.set(c, 24); return Proto.b64e(o); };
  ["[1,2]", "5", "\"str\"", "null", "{bad"].forEach((v) => assert.strictEqual(Proto.open(K, enc(v)), null, v));
  assert.deepStrictEqual(Proto.open(K, enc("{\"a\":1}")), { a:1 });
});

test("channel: order, replay, old, gaps and reflection", () => {
  const S = Proto.newKey(), host = Proto.channel(S, "h"), guest = Proto.channel(S, "g");
  const a = host.send({ t:"a" }), b = host.send({ t:"b" }), c = host.send({ t:"c" });
  assert.strictEqual(guest.recv(a).t, "a");
  assert.strictEqual(guest.recv(a), null, "replay");
  assert.strictEqual(guest.recv(c).t, "c", "a gap is fine");
  assert.strictEqual(guest.recv(b), null, "older than the last one");
  assert.strictEqual(host.recv(a), null, "a host message sent back to the host");
  assert.strictEqual(host.recv(guest.send({ t:"g1" })).t, "g1");
  const stranger = Proto.channel(Proto.newKey(), "g");
  assert.strictEqual(stranger.recv(Proto.channel(S, "h").send({ t:"z" })), null);
  // a message with no direction or a made-up one
  assert.strictEqual(guest.recv(Proto.seal(S, { s:99, t:"q" })), null);
  assert.strictEqual(guest.recv(Proto.seal(S, { s:99, d:"x", t:"q" })), null);
  assert.strictEqual(guest.recv(Proto.seal(S, { s:"100", d:"h", t:"q" })), null);
});

test("handshake: join, approve, talk both ways", () => {
  const K = Proto.newKey();
  const g = Proto.guestHello(K, [{ n:"Alex", f:"b" }]);
  const h = Proto.hostReadHello(K, g.text);
  assert.ok(h); assert.deepStrictEqual(h.names, [{ n:"Alex", f:"b" }]);
  const acc = Proto.hostAccept(K, h), ans = Proto.guestAnswer(K, g.pair, acc.text);
  assert.ok(ans && ans.ok);
  assert.strictEqual(acc.chan.recv(ans.chan.send({ t:"act", a:"spin" })).a, "spin");
  assert.strictEqual(ans.chan.recv(acc.chan.send({ t:"snap", n:1 })).n, 1);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(g.text) && /^[A-Za-z0-9_-]+$/.test(acc.text));
});

test("handshake: refusal, wrong lobby key, tampering, bad keys", () => {
  const K = Proto.newKey(), g = Proto.guestHello(K, []);
  const no = Proto.guestAnswer(K, g.pair, Proto.hostRefuse(K, "The game is full."));
  assert.deepStrictEqual(no, { ok:false, why:"The game is full." });
  assert.strictEqual(Proto.hostReadHello(Proto.newKey(), g.text), null, "someone without the link cannot join");
  assert.strictEqual(Proto.guestAnswer(Proto.newKey(), g.pair, Proto.hostRefuse(K, "x")), null, "a fake host answer");
  const h = Proto.hostReadHello(K, g.text), acc = Proto.hostAccept(K, h);
  assert.strictEqual(Proto.guestAnswer(K, g.pair, flip(acc.text, 40)), null);
  assert.strictEqual(Proto.hostReadHello(K, Proto.seal(K, { t:"hello", pk:Proto.b64e(nacl.randomBytes(31)), names:[] })), null);
  assert.strictEqual(Proto.hostReadHello(K, Proto.seal(K, { t:"hello", pk:5, names:[] })), null);
  assert.strictEqual(Proto.hostReadHello(K, Proto.seal(K, { t:"nope", pk:g.text })), null);
  assert.strictEqual(Proto.guestAnswer(K, g.pair, Proto.seal(K, { t:"ok", pk:"AAAA" })), null);
});

test("another guest who knows the lobby key cannot read or forge a session", () => {
  const K = Proto.newKey();
  const g1 = Proto.guestHello(K, []), h1 = Proto.hostReadHello(K, g1.text), acc1 = Proto.hostAccept(K, h1), a1 = Proto.guestAnswer(K, g1.pair, acc1.text);
  const spy = Proto.guestHello(K, []);               // knows K, saw every message on the network
  const answer = Proto.open(K, acc1.text);            // can even read the host's answer to guest 1
  const guessed = Proto.channel(nacl.box.before(Proto.b64d(answer.pk), spy.pair.secretKey), "g");
  const secret = acc1.chan.send({ t:"snap", answer:"B" });
  assert.strictEqual(guessed.recv(secret), null, "cannot read guest 1's session");
  assert.strictEqual(acc1.chan.recv(guessed.send({ t:"act", a:"ans", x:0 })), null, "cannot act as guest 1");
  assert.strictEqual(a1.chan.recv(secret).answer, "B");
});

test("sizes fit the relay's limits (guest to host 8 KB, host to guest 24 KB)", () => {
  const K = Proto.newKey(), ch = Proto.channel(K, "h");
  const snap = { t:"snap", g:{ players:Array.from({ length:4 }, (_, i) => ({ name:"Player " + i, fmt:"biu", score:12.5, inv:{ x2:1, x3:2, shield:3 } })) }, ov:{ k:"q", opts:["a".repeat(80), "b".repeat(80), "c".repeat(80), "d".repeat(80)] }, pad:"x".repeat(2000) };
  assert.ok(ch.send(snap).length < 24 * 1024);
  assert.ok(Proto.channel(K, "g").send({ t:"act", p:1, a:"ans", x:2 }).length < 300);
  assert.ok(Proto.guestHello(K, [{ n:"A".repeat(16), f:"biu" }, { n:"B".repeat(16), f:"biu" }]).text.length < 1000);
});

console.log("\n" + n + " test groups passed");
