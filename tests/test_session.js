// Tests for the online play lobby and rules. Run:  node tests/test_session.js
// Two or three simulated devices talk through an in-memory relay (nothing touches the network).
"use strict";
const assert = require("assert"), vm = require("vm"), fs = require("fs");
global.nacl = require("../web/js/vendor/nacl-fast.min.js");
const Proto = require("../web/js/online/proto.js"), Session = require("../web/js/online/session.js");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../web/js/core/filter.js", "utf8") + "\nthis.Filter = Filter;", ctx);
const Filter = ctx.Filter, Game = (() => { const c = {}; vm.createContext(c); vm.runInContext(fs.readFileSync(__dirname + "/../web/js/core/wheel.js", "utf8") + fs.readFileSync(__dirname + "/../web/js/core/game.js", "utf8") + "\nthis.Game = Game;", c); return c.Game; })();
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok  " + name); };

// One hosted game with an in-memory relay.
function room() {
  const K = Proto.newKey(), wire = { toGuest:{}, dropped:[] }, events = [], actions = [], guests = {};
  const host = new Session.Host({
    Proto, Filter, K, rnd: () => nacl.randomBytes(12),
    send: (id, text) => { wire.toGuest[id] && wire.toGuest[id](text); },
    drop: (id) => { wire.dropped.push(id); },
    onEvent: (e) => events.push(e),
    onAction: (seat, a) => actions.push([seat, a]),
  });
  const join = (label, name, resume) => {
    const log = [], g = new Session.Guest({ Proto, Filter, K, send: (t) => host.receive(label, t), onEvent: (e) => log.push(e) });
    wire.toGuest[label] = (t) => g.receive(t);
    g.log = log; g.label = label; guests[label] = g;
    g.join(name, resume);
    return g;
  };
  const last = (g, t) => { for (let i = g.log.length - 1; i >= 0; i--) if (g.log[i].t === t) return g.log[i]; return null; };
  return { K, host, wire, events, actions, join, last };
}
const seats = () => [{ name:"Ann", open:false }, { name:"Player 2", open:true }, { name:"Player 3", open:true }];

test("join, host approves, guest takes a seat, everyone sees the lobby", () => {
  const r = room(); r.host.setSeats(seats());
  const g = r.join("a", "Mia");
  assert.deepStrictEqual(r.events.find(e => e.t === "request"), { t:"request", id:"a", name:"Mia" });
  assert.strictEqual(g.state, "waiting");
  r.host.approve("a", -1);
  assert.strictEqual(g.state, "ok");
  assert.ok(r.last(g, "lobby"));
  g.take(1, "Mia");
  assert.strictEqual(r.last(g, "seated").seat, 1);
  assert.strictEqual(r.host.name(1), "Mia");
  assert.strictEqual(r.host.guestOf(1), "a");
  const lob = r.last(g, "lobby");
  assert.strictEqual(lob.you, 1); assert.ok(lob.seats[1].mine && lob.seats[1].taken);
});

test("a name that is not allowed is refused at once", () => {
  const r = room(); r.host.setSeats(seats());
  const g = r.join("a", "S t F u");
  assert.strictEqual(g.state, "refused");
  assert.ok(r.wire.dropped.includes("a"));
  const h = r.join("b", "Mia"); r.host.approve("b", -1);
  h.take(1, "sybau");
  assert.ok(/not allowed/.test(r.last(h, "err").why));
  assert.strictEqual(r.host.guestOf(1), null);
});

test("someone who is not approved cannot talk, and gets dropped after a few tries", () => {
  const r = room(); r.host.setSeats(seats());
  const g = r.join("a", "Mia");
  for (let i = 0; i < 6; i++) r.host.receive("a", "AAAA");
  assert.ok(r.wire.dropped.includes("a"));
  assert.strictEqual(r.host.guestOf(1), null);
});

test("a join request that is not genuine (wrong lobby key) is dropped", () => {
  const r = room(); r.host.setSeats(seats());
  const evil = Proto.guestHello(Proto.newKey(), { name:"Mia" });
  r.host.receive("x", evil.text);
  assert.ok(r.wire.dropped.includes("x"));
  assert.ok(!r.events.some(e => e.t === "request"));
});

test("two guests cannot take the same seat; closed seats cannot be taken", () => {
  const r = room(); r.host.setSeats(seats());
  const a = r.join("a", "Mia"), b = r.join("b", "Leo"); r.host.approve("a", -1); r.host.approve("b", -1);
  a.take(1, "Mia"); b.take(1, "Leo");
  assert.ok(/taken/.test(r.last(b, "err").why)); assert.strictEqual(r.host.guestOf(1), "a");
  b.take(0, "Leo"); // seat 0 belongs to the host's device
  assert.strictEqual(r.host.guestOf(0), null);
  b.take(2, "Leo"); assert.strictEqual(r.host.guestOf(2), "b");
  b.take(1, "Leo"); // asking for a taken seat keeps the old one
  assert.strictEqual(r.host.guestOf(2), "b");
});

test("actions: only in a game, only from a seat, only the allowed list, fields checked", () => {
  const r = room(); r.host.setSeats(seats());
  const a = r.join("a", "Mia"); r.host.approve("a", -1); a.take(1, "Mia");
  a.act("spin"); assert.strictEqual(r.actions.length, 0); // lobby: no game yet
  r.host.setPhase("game");
  a.act("spin"); a.act("arm", { p:"x2" }); a.act("ans", { i:3 }); a.act("draw"); a.act("yes");
  assert.deepStrictEqual(r.actions.map(x => x[0] + ":" + x[1].a), ["1:spin", "1:arm", "1:ans", "1:draw", "1:yes"]);
  r.actions.length = 0;
  a.act("ans", { i:-1 }); a.act("ans", { i:1.5 }); a.act("ans", { i:"2" }); a.act("ans", { i:99 }); a.act("arm", { p:"god" }); a.act("arm");
  a.act("score"); a.act("__proto__"); a.act("constructor"); a.act("toString");
  assert.strictEqual(r.actions.length, 0);
});

test("a guest with no seat cannot act; a guest cannot pretend to be another seat", () => {
  const r = room(); r.host.setSeats(seats());
  const a = r.join("a", "Mia"), b = r.join("b", "Leo"); r.host.approve("a", -1); r.host.approve("b", -1);
  a.take(1, "Mia"); r.host.setPhase("game");
  b.act("spin"); assert.strictEqual(r.actions.length, 0);
  a.act("spin", { seat:2, p:0 }); // extra fields are ignored; the seat is always the sender's own
  assert.deepStrictEqual(r.actions, [[1, { a:"spin" }]]);
});

test("unknown messages are counted; the guest is removed after five", () => {
  const r = room(); r.host.setSeats(seats());
  const a = r.join("a", "Mia"); r.host.approve("a", -1);
  for (let i = 0; i < 4; i++) a.say({ t:"hack" });
  assert.strictEqual(a.state, "ok");
  a.say({ t:"hack" });
  assert.ok(r.wire.dropped.includes("a")); assert.strictEqual(a.state, "closed");
});

test("a replayed or changed message is dropped", () => {
  const r = room(); r.host.setSeats(seats());
  const sent = []; const K = r.K;
  const a = new Session.Guest({ Proto, Filter, K, send: (t) => { sent.push(t); r.host.receive("a", t); }, onEvent: () => {} });
  r.wire.toGuest.a = (t) => a.receive(t);
  a.join("Mia"); r.host.approve("a", -1); a.take(1, "Mia"); r.host.setPhase("game");
  a.act("spin"); const frame = sent[sent.length - 1];
  assert.strictEqual(r.actions.length, 1);
  r.host.receive("a", frame); // replay
  assert.strictEqual(r.actions.length, 1);
  const u = Proto.b64d(frame); u[30] ^= 1;
  r.host.receive("a", Proto.b64e(u)); // changed
  assert.strictEqual(r.actions.length, 1);
});

test("a sleeping phone comes back with its token and gets its seat without asking again", () => {
  const r = room(); r.host.setSeats(seats());
  const a = r.join("a", "Mia"); r.host.approve("a", -1); a.take(1, "Mia");
  const tok = a.token; assert.ok(tok);
  r.host.setPhase("game");
  const a2 = r.join("a2", "Mia", tok); // new page load, new connection id
  assert.strictEqual(a2.state, "ok"); assert.strictEqual(r.last(a2, "seated").seat, 1);
  assert.strictEqual(r.host.guestOf(1), "a2");
  assert.strictEqual(a.state, "closed"); // the old connection was replaced
  const bad = r.join("c", "Eve", "not-the-token");
  assert.strictEqual(bad.state, "waiting"); // a wrong token must be approved by hand like anyone else
});

test("kick removes a guest and frees the seat", () => {
  const r = room(); r.host.setSeats(seats());
  const a = r.join("a", "Mia"); r.host.approve("a", -1); a.take(1, "Mia");
  r.host.kick("a", "Removed by the host");
  assert.strictEqual(a.state, "closed"); assert.strictEqual(r.host.guestOf(1), null);
  r.host.receive("a", "whatever"); assert.ok(r.wire.dropped.includes("a"));
});

test("after a game, New game goes back to the lobby with the same guests and seats", () => {
  const r = room(); r.host.setSeats(seats());
  const a = r.join("a", "Mia"); r.host.approve("a", -1); a.take(1, "Mia");
  r.host.setPhase("game"); r.host.setPhase("lobby");
  assert.strictEqual(r.last(a, "lobby").phase, "lobby"); assert.strictEqual(r.host.guestOf(1), "a");
  r.host.setSeats([{ name:"Ann", open:false }, { name:"Player 2", open:true }, { name:"Player 3", open:true }]); // the host edits seats
  assert.strictEqual(r.host.guestOf(1), "a"); // the guest keeps the seat
  r.host.setSeats([{ name:"Ann", open:false }, { name:"Bo", open:false }, { name:"Player 3", open:true }]); // the host takes seat 2 back
  assert.strictEqual(r.host.guestOf(1), null);
});

test("the room is capped, and closing it removes everyone", () => {
  const r = room(); r.host.setSeats(seats());
  for (let i = 0; i < 8; i++) r.join("g" + i, "P" + i);
  r.join("extra", "Zed"); assert.ok(r.wire.dropped.includes("extra"));
  const first = r.events.length; r.host.closeAll();
  assert.strictEqual(Object.keys(r.host.conns).length, 0);
});

test("game pictures: good ones pass, names are filtered again, bad ones are refused", () => {
  const T = (name, color, pl) => ({ name, fmt:"b", color, players:pl, pfmt:pl.map(() => "") });
  const g = Game.create({ mode:"2v2", teams:[T("Reds", "#e03131", ["Ann", "Bo"]), T("Blues", "#2f80ed", ["Cy", "Di"])] }, [0, 2, 1, 3]);
  const ok = Session.cleanSnap(JSON.parse(JSON.stringify(g)), Filter);
  assert.ok(ok); assert.deepStrictEqual(ok.order, [0, 2, 1, 3]); assert.strictEqual(ok.players[0].name, "Ann");
  const evil = JSON.parse(JSON.stringify(g)); evil.players[1].name = "S t F u"; evil.teams[0].name = "<img src=x onerror=alert(1)>";
  const c = Session.cleanSnap(evil, Filter);
  assert.strictEqual(c.players[1].name, "Player 2"); assert.strictEqual(c.teams[0].name, "<img src=x onerror=alert(1)>".slice(0, 16)); // text only: the page uses textContent
  const bad = (f) => { const x = JSON.parse(JSON.stringify(g)); f(x); assert.strictEqual(Session.cleanSnap(x, Filter), null); };
  bad(x => x.teams[0].color = "red; background:url(//evil)"); bad(x => x.mode = "5v5"); bad(x => x.players.pop()); bad(x => x.turn = 9);
  bad(x => x.players[0].score = "9"); bad(x => x.order = [0, 0, 0, 7]); bad(x => x.teams[1].players = [0, 99]); bad(x => x.players[2].inv = null);
  assert.strictEqual(Session.cleanSnap(null, Filter), null); assert.strictEqual(Session.cleanSnap("x", Filter), null);
});

console.log("session tests: " + n + " passed");
