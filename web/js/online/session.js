// Online play: the lobby and the rules for who may do what. MIT License (see LICENSE).
// It does not touch the network or the screen. The host page and the guest page each give it a "send" function
// and call it when text arrives, which is also how the tests run two devices against each other.
// Everything it receives has already been decrypted and checked by proto.js, and is still treated as untrusted here:
// the host stays in charge of the game, a guest can only ask for one of the allowed actions for its own seat,
// and every field is checked. Names are checked again with Filter.bad on every device.
//
//   Host: the app's play page. Guests: browsers that opened the link.
//   Guest -> host messages:  {t:"take", seat, name} {t:"free"} {t:"do", a, ...} {t:"bye"}
//   Host -> guest messages:  {t:"lobby", ...} {t:"seated", seat, token} {t:"snap", g, ...} {t:"err", why} {t:"kick"} plus game messages
var Session = (function () {
  "use strict";
  var MAX_GUESTS = 8, MAX_STRIKES = 5, MAX_NAME = 16, RATE = 30; // at most RATE messages from one guest per 10 seconds
  var ACTIONS = { spin:1, arm:1, go:1, ans:1, next:1, resign:1, draw:1, yes:1, no:1, ok:1 };
  var POWER = { x2:1, x3:1, shield:1 };

  function cleanName(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, MAX_NAME); }

  // Returns a clean copy of an action from a guest, or null if it is not an allowed action.
  function checkAction(o) {
    if (!o || o.t !== "do" || typeof o.a !== "string" || !Object.prototype.hasOwnProperty.call(ACTIONS, o.a)) return null;
    var r = { a:o.a };
    if (o.a === "arm") { if (typeof o.p !== "string" || !Object.prototype.hasOwnProperty.call(POWER, o.p)) return null; r.p = o.p; }
    if (o.a === "ans") { if (typeof o.i !== "number" || o.i !== Math.floor(o.i) || o.i < -1 || o.i > 9) return null; r.i = o.i; } // -1 means time is up
    return r;
  }

  var LEVELS = ["very-easy", "easy", "normal", "hard", "very-hard", "extremely-hard", "insanely-hard", "impossible"];
  var TIMES = ["very-easy", "easy", "normal", "hard", "very-hard", "extremely-hard", "insanely-hard", "impossible"]; // same names as Game.TIMES
  // A whole number from a message, kept inside lo..hi (and on a multiple of step); d when it is not a number.
  function clampInt(v, lo, hi, step, d) {
    v = Math.round(Number(v) / step) * step;
    return typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  }
  // The custom setup of a game (hearts, target score, time to answer, wheel colors) as plain, checked values.
  function cleanCustom(c) {
    c = c && typeof c === "object" ? c : {};
    var colors = {};
    if (c.levelColors && typeof c.levelColors === "object") LEVELS.forEach(function (id) {
      var v = c.levelColors[id];
      if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) colors[id] = v.toLowerCase();
    });
    return { hearts:clampInt(c.hearts, 1, 10, 1, 3), targetScore:clampInt(c.targetScore, 100, 1000, 50, 100),
      time:TIMES.indexOf(c.time) >= 0 ? c.time : "normal", levelColors:colors };
  }

  // The mode of the game ("rules") that the lobby tells guests: { extreme, inf, color } and, for a Custom game,
  // { custom:{ hearts, targetScore, time } } as well. Always plain values. Wheel colors are not part of it.
  function cleanRules(r) {
    var o = { extreme:!!(r && r.extreme), inf:!!(r && (r.inf || r.infinite)), color:(r && r.color === "extreme" ? "extreme" : "default") };
    if (r && r.custom && typeof r.custom === "object") {
      var c = cleanCustom(r.custom);
      o.custom = { hearts:c.hearts, targetScore:c.targetScore, time:c.time };
    }
    return o;
  }

  // Checks the game picture the host sent and returns a safe copy, or null. Names are filtered again here.
  function cleanSnap(g, Filter) {
    var COLOR = /^#[0-9a-fA-F]{6}$/, FMT = /^[biu]{0,3}$/;
    function num(n) { return typeof n === "number" && isFinite(n) && n >= -1e6 && n <= 1e6; }
    function name(v, dflt) { v = cleanName(v); return v && !Filter.bad(v) ? v : dflt; }
    function fmt(v) { return typeof v === "string" && FMT.test(v) ? v : ""; }
    if (!g || typeof g !== "object" || ["solo", "1v1", "2v2", "custom"].indexOf(g.mode) < 0) return null;
    var customOn = g.mode === "custom" || !!g.customOn, mode = g.mode === "custom" ? "2v2" : g.mode;
    var np = mode === "solo" ? 1 : mode === "1v1" ? 2 : 4, nt = mode === "solo" ? 1 : 2;
    if (!Array.isArray(g.players) || g.players.length !== np || !Array.isArray(g.teams) || g.teams.length !== nt || !Array.isArray(g.order)) return null;
    var out = { mode:mode, customOn:customOn, teams:[], players:[], order:[], pos:0, turn:0, turns:0, offered:!!g.offered, over:!!g.over, winner:null, reason:"", extreme:!!g.extreme, inf:!!g.inf, custom:null };
    out.custom = cleanCustom(customOn ? g.custom : null); // games without Custom rules always use the standard rules
    for (var i = 0; i < np; i++) {
      var p = g.players[i];
      if (!p || !num(p.score) || (p.team !== 0 && p.team !== 1) || !p.inv) return null;
      var v = { x2:p.inv.x2, x3:p.inv.x3, shield:p.inv.shield };
      if (!num(v.x2) || !num(v.x3) || !num(v.shield)) return null;
      var pl = { name:name(p.name, "Player " + (i + 1)), fmt:fmt(p.fmt), team:Math.min(p.team, nt - 1), score:p.score, inv:v, armed:POWER[p.armed] ? p.armed : null, out:!!p.out };
      if (out.inf) { // Infinite: hearts left (3, or the Custom game's number)
        var maxHearts = customOn ? out.custom.hearts : 3;
        if (!(p.hearts >= 0 && p.hearts <= maxHearts) || p.hearts !== Math.floor(p.hearts)) return null;
        pl.hearts = p.hearts; pl.dead = !!p.dead;
      }
      out.players.push(pl);
    }
    for (var t = 0; t < nt; t++) {
      var s = g.teams[t];
      if (!s || !COLOR.test(s.color) || !Array.isArray(s.players)) return null;
      var ids = s.players.map(function (k) { return k; });
      if (ids.some(function (k) { return k !== Math.floor(k) || k < 0 || k >= np; })) return null;
      out.teams.push({ name:name(s.name, "Team " + (t + 1)), fmt:fmt(s.fmt), color:s.color, players:ids, out:!!s.out });
    }
    if (g.order.length !== np || g.order.some(function (k) { return k !== Math.floor(k) || k < 0 || k >= np; })) return null;
    out.order = g.order.slice();
    if (!(g.turn >= 0 && g.turn < np) || g.turn !== Math.floor(g.turn)) return null;
    out.turn = g.turn;
    if (g.winner === 0 || g.winner === 1) out.winner = Math.min(g.winner, nt - 1);
    out.reason = typeof g.reason === "string" ? g.reason.replace(/[^\x20-\x7e]/g, "").slice(0, 80) : "";
    return out;
  }

  // Checks the extra parts of a game message (power-up choice, question, egg, draw offer, spin, status text) and
  // returns a safe copy. Nothing from the network is used as it came. The right answer is never part of a question
  // before it has been answered.
  function cleanExtras(e) {
    var POW = { x2:1, x3:1, shield:1 };
    var str = function (v, n) { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").slice(0, n); };
    var num = function (v, lo, hi) { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
    var o = { msg:str(e && e.msg, 200), busy:!!(e && e.busy), spin:null, pu:null, q:null, egg:null, drawOffer:null };
    if (!e || typeof e !== "object") return o;
    if (e.spin && typeof e.spin === "object") o.spin = { n:num(e.spin.n, 0, 1e9), index:Math.floor(num(e.spin.index, 0, 99)) };
    if (e.pu && typeof e.pu === "object") {
      o.pu = { level:str(e.pu.level, 40), points:num(e.pu.points, 0, 100), time:num(e.pu.time, 0, 120), options:(Array.isArray(e.pu.options) ? e.pu.options : []).slice(0, 3)
        .filter(function (b) { return b && typeof b.id === "string" && Object.prototype.hasOwnProperty.call(POW, b.id); })
        .map(function (b) { return { id:b.id, name:str(b.name, 20), count:Math.floor(num(b.count, 0, 99)) }; }) };
    }
    if (e.q && typeof e.q === "object" && Array.isArray(e.q.opts) && e.q.opts.length >= 2 && e.q.opts.length <= 8) {
      var r = e.q.res && typeof e.q.res === "object" ? e.q.res : null;
      o.q = { n:Math.floor(num(e.q.n, 0, 1e9)), word:str(e.q.word, 80), level:str(e.q.level, 40), points:num(e.q.points, 0, 100), secs:Math.max(1, num(e.q.secs, 0, 120)),
        boost:POW[e.q.boost] ? e.q.boost : null, opts:e.q.opts.map(function (t) { return str(t, 300); }),
        res:r ? { k:Math.floor(num(r.k, -1, 9)), right:Math.floor(num(r.right, 0, 9)), ok:!!r.ok, pts:num(r.pts, -1000, 1000) } : null };
    }
    if (e.egg && typeof e.egg === "object") o.egg = { shared:!!e.egg.shared };
    if (e.drawOffer && typeof e.drawOffer === "object") o.drawOffer = { targetSeat:Math.floor(num(e.drawOffer.targetSeat, -1, 3)), fromName:cleanName(e.drawOffer.fromName) };
    return o;
  }

  /* ---------- the host ---------- */
  // o: { Proto, Filter, K, send(id, text), drop(id), onEvent(e), onAction(seat, action), rnd(): 12 random bytes }
  function Host(o) {
    this.o = o; this.conns = {}; this.seats = []; this.phase = "lobby"; this.rules = cleanRules(null);
  }
  Host.prototype.setRules = function (r) { this.rules = cleanRules(r); }; // call before guests join; sent with every lobby message
  Host.prototype.setSeats = function (list) { // [{ name, open }]; keeps guests who already have a seat
    var old = this.seats;
    this.seats = list.map(function (s, i) {
      var prev = old[i];
      return { name:cleanName(s.name), open:!!s.open, guest:s.open && prev && prev.guest ? prev.guest : null, token:s.open && prev ? prev.token : null };
    });
    var seats = this.seats, conns = this.conns;
    Object.keys(conns).forEach(function (id) { // a guest whose seat was taken back is told it has no seat now
      var c = conns[id];
      if (c.seat >= 0 && (!seats[c.seat] || seats[c.seat].guest !== id)) c.seat = -1;
    });
    this.lobby();
  };
  Host.prototype.setPhase = function (p) { this.phase = p === "game" ? "game" : "lobby"; this.lobby(); };
  Host.prototype.seatOf = function (id) { var c = this.conns[id]; return c && c.state === "ok" ? c.seat : -1; };
  Host.prototype.guestOf = function (seat) { var s = this.seats[seat]; return s && s.guest && this.conns[s.guest] ? s.guest : null; };
  Host.prototype.name = function (seat) { return this.seats[seat] ? this.seats[seat].name : ""; };

  Host.prototype.tell = function (id, msg) {
    var c = this.conns[id];
    if (!c || c.state !== "ok") return false;
    var text = c.chan.send(msg);
    if (text.length > 20000) return false;
    this.o.send(id, text); return true;
  };
  // Send to the guest who owns a seat (false if nobody does).
  Host.prototype.toSeat = function (seat, msg) { var id = this.guestOf(seat); return id ? this.tell(id, msg) : false; };
  Host.prototype.toAll = function (msg) { var me = this; Object.keys(this.conns).forEach(function (id) { me.tell(id, msg); }); };

  Host.prototype.lobby = function () {
    var me = this;
    Object.keys(this.conns).forEach(function (id) {
      var c = me.conns[id];
      if (c.state !== "ok") return;
      me.tell(id, { t:"lobby", phase:me.phase, you:c.seat, rules:me.rules, seats:me.seats.map(function (s, i) {
        return { name:s.name, open:s.open, taken:!!(s.guest && me.conns[s.guest]), mine:c.seat === i };
      }) });
    });
    this.o.onEvent({ t:"lobby" });
  };

  Host.prototype.strike = function (c, why) {
    c.strikes++;
    if (c.strikes >= MAX_STRIKES) this.kick(c.id, why || "Too many bad messages");
  };
  Host.prototype.rate = function (c) {
    var now = Date.now(); c.hits = c.hits.filter(function (t) { return now - t < 10000; });
    c.hits.push(now);
    return c.hits.length <= RATE;
  };

  // The host page calls this with every message that arrives from the relay.
  Host.prototype.receive = function (id, text) {
    var o = this.o, c = this.conns[id];
    if (!c) {
      if (Object.keys(this.conns).length >= MAX_GUESTS) { o.drop(id); return; }
      var hello = o.Proto.hostReadHello(o.K, text);
      if (!hello) { o.drop(id); return; }
      var info = hello.names && typeof hello.names === "object" ? hello.names : {}, name = cleanName(info.name);
      c = this.conns[id] = { id:id, hello:hello, name:name, state:"pending", chan:null, seat:-1, strikes:0, hits:[] };
      if (!name || o.Filter.bad(name)) { this.refuse(id, "That name is not allowed. Please choose a different one."); return; }
      var back = typeof info.resume === "string" ? this.seatByToken(info.resume) : -1;
      if (back >= 0) { this.approve(id, back); return; } // a phone that went to sleep comes back to its own seat
      o.onEvent({ t:"request", id:id, name:name });
      return;
    }
    if (c.state !== "ok") { this.strike(c); return; } // someone who is not approved may not talk
    var m = c.chan.recv(text);
    if (!m) { this.strike(c); return; } // forged, changed or replayed
    if (!this.rate(c)) { this.kick(id, "Too many messages"); return; }
    this.dispatch(c, m);
  };

  Host.prototype.seatByToken = function (tok) {
    for (var i = 0; i < this.seats.length; i++) if (this.seats[i].token && this.seats[i].token === tok && this.seats[i].open) return i;
    return -1;
  };

  Host.prototype.approve = function (id, seat) {
    var c = this.conns[id];
    if (!c || c.state !== "pending") return false;
    var r = this.o.Proto.hostAccept(this.o.K, c.hello);
    c.chan = r.chan; c.state = "ok"; this.o.send(id, r.text);
    if (seat >= 0 && this.seats[seat]) {
      var old = this.seats[seat].guest;
      if (old && old !== id) this.kick(old, "This seat was taken over");
      var s = this.seats[seat];
      s.guest = id; c.seat = seat;
      if (c.name) s.name = c.name;
      s.token = s.token || this.o.Proto.b64e(this.o.rnd());
      this.tell(id, { t:"seated", seat:seat, token:s.token });
    }
    this.lobby();
    return true;
  };
  Host.prototype.refuse = function (id, why) {
    var c = this.conns[id];
    if (!c) return;
    this.o.send(id, this.o.Proto.hostRefuse(this.o.K, why));
    delete this.conns[id]; this.o.drop(id);
  };
  Host.prototype.kick = function (id, why) {
    var c = this.conns[id];
    if (!c) { this.o.drop(id); return; }
    if (c.state === "ok") this.tell(id, { t:"kick", why:String(why || "Removed by the host").slice(0, 60) });
    this.release(id);
    delete this.conns[id]; this.o.drop(id);
    this.lobby(); this.o.onEvent({ t:"left", id:id });
  };
  Host.prototype.release = function (id) {
    this.seats.forEach(function (s) { if (s.guest === id) s.guest = null; });
  };
  // Free everything (the host stopped hosting).
  Host.prototype.closeAll = function () {
    var me = this;
    Object.keys(this.conns).forEach(function (id) { me.tell(id, { t:"kick", why:"The host stopped the game" }); me.o.drop(id); });
    this.conns = {}; this.seats.forEach(function (s) { s.guest = null; s.token = null; });
  };

  Host.prototype.dispatch = function (c, m) {
    var o = this.o, me = this;
    if (m.t === "take") {
      var seat = m.seat, s = this.seats[seat], nm = cleanName(m.name);
      if (this.phase !== "lobby") return this.tell(c.id, { t:"err", why:"The game has started." });
      if (typeof seat !== "number" || seat !== Math.floor(seat) || !s || !s.open) return this.strike(c);
      if (s.guest && s.guest !== c.id && this.conns[s.guest]) return this.tell(c.id, { t:"err", why:"That seat is taken." });
      if (nm && o.Filter.bad(nm)) return this.tell(c.id, { t:"err", why:"That name is not allowed. Please choose a different one." });
      this.release(c.id);
      s.guest = c.id; c.seat = seat; if (nm) s.name = nm;
      s.token = s.token || o.Proto.b64e(o.rnd());
      this.tell(c.id, { t:"seated", seat:seat, token:s.token });
      return this.lobby();
    }
    if (m.t === "free") {
      if (this.phase !== "lobby") return;
      this.release(c.id); c.seat = -1; return this.lobby();
    }
    if (m.t === "bye") return this.kick(c.id, "Left");
    if (m.t === "do") {
      var a = checkAction(m);
      if (!a || c.seat < 0 || this.phase !== "game") return this.strike(c);
      return o.onAction(c.seat, a);
    }
    this.strike(c); // an unknown kind of message
  };

  /* ---------- a guest ---------- */
  // o: { Proto, Filter, K, send(text), onEvent(e) }
  function Guest(o) { this.o = o; this.state = "new"; this.chan = null; this.hello = null; this.seat = -1; this.token = null; }
  // Ask to join. resume is the token from an earlier visit (or null).
  Guest.prototype.join = function (name, resume) {
    this.hello = this.o.Proto.guestHello(this.o.K, { name:cleanName(name), resume:resume || null });
    this.state = "waiting";
    if (this.o.sendConnect) {
      this.o.sendConnect(this.hello.text, this.hello.id);
    } else {
      this.o.send(this.hello.text);
    }
  };
  Guest.prototype.receive = function (text) {
    var o = this.o, r, m;
    if (this.state === "waiting") {
      r = o.Proto.guestAnswer(o.K, this.hello.pair, text);
      if (!r) return;
      if (!r.ok) { this.state = "refused"; return o.onEvent({ t:"refused", why:r.why }); }
      this.chan = r.chan; this.state = "ok";
      return o.onEvent({ t:"approved" });
    }
    if (this.state !== "ok") return;
    m = this.chan.recv(text);
    if (!m || typeof m.t !== "string") return;
    if (m.t === "seated" && typeof m.seat === "number") { this.seat = m.seat; this.token = typeof m.token === "string" ? m.token.slice(0, 40) : null; }
    if (m.t === "kick") this.state = "closed";
    o.onEvent(m);
  };
  Guest.prototype.say = function (msg) { if (this.state === "ok") this.o.send(this.chan.send(msg)); };
  Guest.prototype.take = function (seat, name) { this.say({ t:"take", seat:seat, name:cleanName(name) }); };
  Guest.prototype.act = function (a, extra) { var m = { t:"do", a:a }; if (extra) for (var k in extra) m[k] = extra[k]; this.say(m); };

  return { Host:Host, Guest:Guest, cleanRules:cleanRules, cleanCustom:cleanCustom, cleanSnap:cleanSnap, cleanExtras:cleanExtras, checkAction:checkAction, cleanName:cleanName, ACTIONS:ACTIONS };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Session;
