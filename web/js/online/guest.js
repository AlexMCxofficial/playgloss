// Guest controller: runs in the browser on the join page. MIT License (see LICENSE).
var Guest = (function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };

  // o: { Proto, Filter, K, ui }
  // ui: { onApproved(seat, token), onRefused(why), onSeated(seat, token), onKick(why), onLobby(seats, phase, you), onSnap(g, sd, msg, spin), onError(why) }
  function Guest(o) {
    this.o = o;
    this.session = new Session.Guest({
      Proto: o.Proto,
      Filter: o.Filter,
      K: o.K,
      send: function (text) { o.transport.send(text); },
      onEvent: function (e) { o.ui.onEvent(e); }
    });
    this.transport = o.transport;
    this.reconnecting = false;
  }

  Guest.prototype.join = function (name, resumeToken) {
    this.session.join(name, resumeToken);
  };

  Guest.prototype.takeSeat = function (seat, name) {
    this.session.take(seat, name);
  };

  Guest.prototype.freeSeat = function () {
    this.session.say({ t: "free" });
  };

  Guest.prototype.sendAction = function (action, extra) {
    this.session.act(action, extra);
  };

  Guest.prototype.receive = function (text) {
    this.session.receive(text);
  };

  return Guest;
})();
if (typeof module !== "undefined" && module.exports) module.exports = Guest;