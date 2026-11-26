// Browser and native guest transport for the spectator-mode LAN relay. MIT License (see LICENSE).
var QuizTransport = (function () {
  "use strict";

  function create(host, receive, onLost) {
    var invoke = host && window.__TAURI__.core.invoke;
    var active = null;

    function request(peer, post, data) {
      if (invoke) {
        return invoke(post ? "guest_post" : "guest_poll", post
          ? { host: host, id: peer.id, data: data }
          : { host: host, id: peer.id, ack: peer.ack }).then(function (res) {
          return post ? null : JSON.parse(res);
        }).catch(function (err) { throw new Error(String(err)); });
      }
      var path = post ? "/m/" + peer.id : "/p/" + peer.id + "?a=" + peer.ack;
      var options = { cache: "no-store", signal: peer.abort.signal, redirect: "error" };
      if (post) {
        options.method = "POST";
        options.headers = { "Content-Type": "text/plain" };
        options.body = data;
      }
      return fetch(location.origin + path, options).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return post ? null : res.json();
      });
    }

    function poll(peer) {
      if (active !== peer) return;
      request(peer, false).then(function (result) {
        if (active !== peer) return;
        result.m.forEach(function (text) { if (active === peer) receive(text); });
        peer.ack = result.n;
        peer.failures = 0;
        setTimeout(function () { poll(peer); }, 30);
      }).catch(function (err) {
        if (active !== peer) return;
        if (/HTTP (403|404)$/.test(err.message) || ++peer.failures >= 5) {
          close();
          onLost("Connection closed. Check your network and try joining again.");
        } else setTimeout(function () { poll(peer); }, 1000);
      });
    }

    function close() {
      if (active) active.abort.abort();
      active = null;
    }

    function connect(id, hello) {
      close();
      var peer = { id: id, ack: 0, failures: 0, abort: new AbortController(), send: Promise.resolve() };
      active = peer;
      return request(peer, true, hello).then(function () { poll(peer); });
    }

    function send(data) {
      var peer = active;
      if (!peer) return Promise.reject(new Error("Connection closed."));
      var next = peer.send.then(function () {
        if (active !== peer) throw new Error("Connection closed.");
        return request(peer, true, data);
      });
      peer.send = next.catch(function () {});
      return next;
    }

    return { connect: connect, send: send, close: close };
  }

  return { create: create };
})();
