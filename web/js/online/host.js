// Host controller: wires Session.Host to the Tauri LAN relay and the UI. MIT License (see LICENSE).
// Runs only in the app (window.__TAURI__). The Play page (ui.js) creates this when the host presses "Host a game".
var Host = (function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  // Resolved on use: outside the app (a plain browser such as Brave) window.__TAURI__ does not exist, and reading
  // it while this script loads used to throw and show the red "Script error" bar.
  function tauri() {
    var T = window.__TAURI__;
    if (!T || !T.core || !T.event) throw new Error("Hosting only works in the Playgloss app.");
    return T;
  }
  var invoke = function (cmd, args) { return tauri().core.invoke(cmd, args); };
  var listen = function (name, cb) { return tauri().event.listen(name, cb); };

  // o: { ui, cfg, Proto, Filter, K, rnd }
  // ui: { onLobbyUpdate(seats, phase), onGuestRequest(id, name), onGuestLeft(id), onGameStart(), onAction(seat, action), onResync(), onStop() }
  function Host(o) {
    this.o = o;
    this.session = null;
    this.running = false;
    this.listeners = [];
    this.statusTimer = null;
    this.awayIds = {}; // connection ids that are away (idle/disconnected)
    this.queues = {}; // one promise chain per guest, so messages reach the relay in the order they were sent
  }

  // Rust emits the payload as a JSON string; older or newer Tauri versions may hand over an object.
  function payload(ev) {
    var p = ev && ev.payload;
    if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) { return null; } }
    return p && typeof p.id === "string" ? p : null;
  }

  Host.prototype.queue = function (id, cmd, args) {
    var q = (this.queues[id] || Promise.resolve()).then(function () { return invoke(cmd, args); }).catch(function () {});
    this.queues[id] = q;
    return q;
  };

  Host.prototype.start = function () {
    var me = this;
    return invoke("lan_start").then(function (res) {
      var info = typeof res === "string" ? JSON.parse(res) : res;
      me.port = info.port;
      me.ips = info.ips || [];
      me.running = true;
      me.queues = {};
      me.K = me.o.K || Proto.newKey();
      me.session = new Session.Host({
        Proto: Proto,
        Filter: Filter,
        K: me.K,
        send: function (id, text) { me.queue(id, "lan_send", { id: id, data: text }); },
        // lan_close empties the guest's outbox, so wait a little: the refusal or kick notice must be collected first.
        drop: function (id) { setTimeout(function () { if (me.running) me.queue(id, "lan_close", { id: id }); }, 2500); },
        onEvent: function (e) { me.onSessionEvent(e); },
        onAction: function (seat, a) { me.o.ui.onAction(seat, a); },
        rnd: me.o.rnd || function () { return nacl.randomBytes(12); }
      });
      // The game's mode (Extreme, Infinite) goes to guests with every lobby message
      if (me.o.cfg.run) me.session.setRules(me.o.cfg.run);
      // Set up seats from UI config
      me.session.setSeats(me.o.cfg.seats);
      // Listen for relay messages
      // listen() returns a Promise of the unlisten function; stop() unwraps it.
      me.listeners.push(listen("lan-msg", function (ev) {
        var p = payload(ev);
        if (p && me.session && typeof p.data === "string") me.session.receive(p.id, p.data);
      }));
      me.listeners.push(listen("lan-close", function (ev) {
        var p = payload(ev);
        if (p && me.session) me.onRelayClose(p.id);
      }));
      // Poll status for idle guests
      me.statusTimer = setInterval(function () { me.pollStatus(); }, 5000);
      me.o.ui.onLobbyUpdate(me.session.seats, "lobby");
      return { port: me.port, ips: me.ips, K: me.K };
    });
  };

  Host.prototype.onRelayClose = function (id) {
    var me = this;
    var c = me.session.conns[id];
    if (!c) return;
    if (c.state === "ok") {
      // Guest disconnected but may come back - mark as away, keep seat reserved
      me.awayIds[id] = true;
      c.away = true;
      me.o.ui.onLobbyUpdate(me.session.seats, me.session.phase);
      me.o.ui.onGuestLeft(id);
    }
  };

  Host.prototype.pollStatus = function () {
    var me = this;
    if (!me.running) return;
    invoke("lan_status").then(function (res) {
      if (!me.running || !me.session) return;
      var info = typeof res === "string" ? JSON.parse(res) : res, changed = false;
      // lan.rs reports {"peers":[{"id","idle" (seconds),"blocked"}]}. A guest that is waiting for messages is never idle.
      (info.peers || []).forEach(function (c) {
        var sess = me.session.conns[c.id];
        if (!sess || sess.state !== "ok") return;
        var away = c.idle > 30;
        if (!!sess.away !== away) {
          sess.away = away;
          if (away) me.awayIds[c.id] = true; else delete me.awayIds[c.id];
          changed = true;
        }
      });
      if (changed) me.o.ui.onLobbyUpdate(me.session.seats, me.session.phase);
    }).catch(function () {});
  };

  Host.prototype.onSessionEvent = function (e) {
    var me = this;
    if (e.t === "request") {
      me.o.ui.onGuestRequest(e.id, e.name);
    } else if (e.t === "left") {
      me.o.ui.onGuestLeft(e.id);
    } else if (e.t === "lobby") {
      me.o.ui.onLobbyUpdate(me.session.seats, me.session.phase);
      if (me.session.phase === "game" && me.o.ui.onResync) me.o.ui.onResync();
    }
  };

  Host.prototype.approve = function (id, seat) {
    this.session.approve(id, seat);
    delete this.awayIds[id];
    var c = this.session.conns[id];
    if (c) c.away = false;
  };

  Host.prototype.refuse = function (id, why) {
    this.session.refuse(id, why);
    delete this.awayIds[id];
  };

  Host.prototype.kick = function (id) {
    this.session.kick(id, "Removed by the host");
    delete this.awayIds[id];
  };

  Host.prototype.startGame = function () {
    this.session.setPhase("game");
    this.o.ui.onGameStart();
  };

  // Called by the UI whenever the game changes. data = { g, sd, msg, busy, spin, egg, drawOffer, pu, q }.
  // pu and q (the power-up choice and the question) belong to one player only, so they go to the guest in seat
  // privSeat and to nobody else. Everything else goes to everyone.
  var PRIVATE = ["pu", "q"];
  Host.prototype.broadcastSnap = function (data, privSeat) {
    var s = this.session;
    if (!s || s.phase !== "game") return;
    Object.keys(s.conns).forEach(function (id) {
      var c = s.conns[id];
      if (c.state !== "ok") return;
      var msg = { t: "snap" };
      for (var k in data) {
        if (PRIVATE.indexOf(k) >= 0 && c.seat !== privSeat) continue;
        msg[k] = data[k];
      }
      s.tell(id, msg);
    });
  };

  Host.prototype.stop = function () {
    var me = this;
    if (!me.running) return Promise.resolve();
    me.running = false;
    if (me.statusTimer) { clearInterval(me.statusTimer); me.statusTimer = null; }
    me.listeners.forEach(function (p) {
      Promise.resolve(p).then(function (unlisten) { if (typeof unlisten === "function") unlisten(); }).catch(function () {});
    });
    me.listeners = [];
    me.awayIds = {};
    try { if (me.session) me.session.closeAll(); } catch (e) {}
    me.session = null;
    // Give the "host stopped" notices a moment to be collected, then always turn the server off.
    var pending = Object.keys(me.queues).map(function (id) { return me.queues[id]; });
    me.queues = {};
    return Promise.all(pending)
      .then(function () { return new Promise(function (r) { setTimeout(r, 300); }); })
      .then(function () { return invoke("lan_stop"); })
      .catch(function () { return invoke("lan_stop").catch(function () {}); })
      .then(function () { me.o.ui.onStop(); });
  };

  // Build the join link for a given IP
  Host.prototype.linkFor = function (ip) {
    return "http://" + ip + ":" + this.port + "/join.html#" + Proto.b64e(this.K);
  };

  return Host;
})();
if (typeof module !== "undefined" && module.exports) module.exports = Host;
