// Host controller: wires Session.Host to the Tauri LAN relay and the UI. MIT License (see LICENSE).
// Runs only in the app (window.__TAURI__). The Play page (ui.js) creates this when the host presses "Host a game".
var Host = (function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  var invoke = window.__TAURI__.core.invoke;
  var listen = window.__TAURI__.event.listen;

  // o: { ui, cfg, Proto, Filter, K, rnd }
  // ui: { onLobbyUpdate(seats, phase), onGuestRequest(id, name), onGuestLeft(id), onGameStart(), onGameSnap(g, sd, msg, spin), onStop() }
  function Host(o) {
    this.o = o;
    this.session = null;
    this.running = false;
    this.listeners = [];
    this.statusTimer = null;
    this.awayIds = {}; // connection ids that are away (idle/disconnected)
  }

  Host.prototype.start = function () {
    var me = this;
    return invoke("lan_start").then(function (res) {
      var info = JSON.parse(res);
      me.port = info.port;
      me.ips = info.ips || [];
      me.running = true;
      me.K = me.o.K || Proto.newKey();
      me.session = new Session.Host({
        Proto: Proto,
        Filter: Filter,
        K: me.K,
        send: function (id, text) { invoke("lan_send", { id: id, data: text }); },
        drop: function (id) { invoke("lan_close", { id: id }); },
        onEvent: function (e) { me.onSessionEvent(e); },
        onAction: function (seat, a) { me.o.ui.onAction(seat, a); },
        rnd: me.o.rnd || function () { return nacl.randomBytes(12); }
      });
      // Set up seats from UI config
      me.session.setSeats(me.o.cfg.seats);
      // Listen for relay messages
      me.listeners.push(listen("lan-msg", function (ev) { me.session.receive(ev.payload.id, ev.payload.data); }));
      // Listen for relay close events (disconnects)
      me.listeners.push(listen("lan-close", function (ev) { me.onRelayClose(ev.payload.id); }));
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
      var info = JSON.parse(res);
      if (info.connections) {
        info.connections.forEach(function (c) {
          var sess = me.session.conns[c.id];
          if (sess && sess.state === "ok" && c.idle > 20000) {
            // Mark as away (UI can show this)
            sess.away = true;
            me.awayIds[c.id] = true;
            me.o.ui.onLobbyUpdate(me.session.seats, me.session.phase);
          }
        });
      }
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

  // Called by UI after each render during the game
  Host.prototype.broadcastSnap = function (snapData) {
    if (this.session && this.session.phase === "game") {
      var msg = { t: "snap" };
      for (var k in snapData) msg[k] = snapData[k];
      this.session.toAll(msg);
    }
  };

  Host.prototype.stop = function () {
    var me = this;
    if (!me.running) return Promise.resolve();
    me.running = false;
    if (me.statusTimer) { clearInterval(me.statusTimer); me.statusTimer = null; }
    me.listeners.forEach(function (u) { u(); });
    me.listeners = [];
    me.awayIds = {};
    if (me.session) { me.session.closeAll(); me.session = null; }
    return invoke("lan_stop").then(function () {
      me.o.ui.onStop();
    });
  };

  // Build the join link for a given IP
  Host.prototype.linkFor = function (ip) {
    return "http://" + ip + ":" + this.port + "/#" + Proto.b64e(this.K);
  };

  return Host;
})();
if (typeof module !== "undefined" && module.exports) module.exports = Host;