// Local sound preferences and Web Audio playback. MIT License (see LICENSE).
var PGAudio = (function () {
  "use strict";

  var ENABLED = "playgloss-audio-enabled", VOLUME = "playgloss-audio-volume";
  var Context = window.AudioContext || window.webkitAudioContext;
  var enabled = true, volume = 50, context, master, generation = 0, spinId = 0;
  var buffers = new Map(), sources = new Set(), wheelSources = new Set(), controls = [];
  var now = function () { return performance.now(); };

  function stored(key) {
    try { return localStorage.getItem(key); } catch (err) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (err) {}
  }
  function clampVolume(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 50;
  }
  function readPreferences() {
    var value = stored(VOLUME);
    enabled = stored(ENABLED) !== "off";
    volume = clampVolume(value === null || !value.trim() ? 50 : Number(value));
  }
  readPreferences();

  function audible() { return !!Context && enabled && volume > 0 && !document.hidden; }

  function unlock() {
    if (!audible()) return;
    try {
      if (!context) {
        context = new Context();
        master = context.createGain();
        master.gain.value = volume / 100;
        master.connect(context.destination);
      }
      if (context.state !== "running") return Promise.resolve(context.resume()).catch(function () {});
    } catch (err) { /* Audio may be unavailable on this device. */ }
  }

  function load(cue) {
    if (!buffers.has(cue)) {
      var pending = fetch("audio/" + cue + ".wav").then(function (response) {
        if (!response.ok) throw new Error("Sound file unavailable");
        return response.arrayBuffer();
      }).then(function (bytes) {
        return new Promise(function (resolve, reject) {
          var decoded = context.decodeAudioData(bytes, resolve, reject);
          if (decoded) decoded.then(resolve, reject);
        });
      }).catch(function () {
        buffers.delete(cue);
        return null;
      });
      buffers.set(cue, pending);
    }
    return buffers.get(cue);
  }

  function start(buffer, when, options) {
    options = options || {};
    var player = context.createBufferSource(), gain = context.createGain();
    player.buffer = buffer;
    player.playbackRate.value = options.rate || 1;
    gain.gain.value = options.level === undefined ? 1 : options.level;
    player.connect(gain);
    gain.connect(master);
    sources.add(player);
    if (options.wheel) wheelSources.add(player);
    player.onended = function () {
      sources.delete(player);
      wheelSources.delete(player);
      player.disconnect();
      gain.disconnect();
    };
    if (options.end) {
      gain.gain.setValueAtTime(gain.gain.value, Math.max(when, options.end - 0.18));
      gain.gain.linearRampToValueAtTime(0, options.end);
    }
    player.start(when, options.offset || 0);
    if (options.end) player.stop(options.end);
  }

  function stopSources(group) {
    group.forEach(function (player) {
      player.stop();
      sources.delete(player);
    });
    group.clear();
  }
  function stopSpin() {
    spinId++;
    stopSources(wheelSources);
  }
  function stop() {
    generation++;
    stopSpin();
    stopSources(sources);
  }

  function play(cue) {
    if (!audible() || !context) return Promise.resolve(false);
    var mark = generation, requested = now();
    return load(cue).then(function (buffer) {
      if (!buffer || mark !== generation || !audible() || context.state !== "running" || now() - requested > 350) return false;
      start(buffer, context.currentTime);
      return true;
    });
  }

  function startup() {
    if (!audible()) return;
    unlock();
    if (!context) return;
    var mark = generation, requested = now(), buffer, played = false;
    function cue() {
      if (played || !buffer || mark !== generation || !audible() || context.state !== "running" || now() - requested > 350) return;
      played = true;
      start(buffer, context.currentTime);
    }
    context.addEventListener("statechange", cue);
    load("splash_screen").then(function (clip) { buffer = clip; cue(); });
  }

  // Find each slice crossing on the CSS transition's timing curve. Very close ticks
  // share one sound, keeping the fastest part of the spin from turning into a buzz.
  function bezier(p, a, b) {
    var q = 1 - p;
    return 3 * q * q * p * a + 3 * q * p * p * b + p * p * p;
  }
  function crossing(progress, curve) {
    var low = 0, high = 1;
    for (var i = 0; i < 14; i++) {
      var mid = (low + high) / 2;
      if (bezier(mid, curve[1], curve[3]) < progress) low = mid;
      else high = mid;
    }
    return bezier((low + high) / 2, curve[0], curve[2]);
  }

  function spin(from, to, slices, seconds, curve) {
    stopSpin();
    if (!audible() || !context) return;
    if (!curve) { play("wheel_tick"); return; } // reduced motion: a single tap
    var id = spinId, requested = now();
    Promise.all([load("wheel_spin"), load("wheel_tick")]).then(function (clips) {
      if (id !== spinId || !audible() || context.state !== "running") return;
      var elapsed = (now() - requested) / 1000;
      if (elapsed >= seconds - 0.03) return;
      var current = context.currentTime + 0.012, beginning = current - elapsed;
      var roll = clips[0], tick = clips[1];
      if (roll) {
        var rate = Math.min(1, roll.duration / seconds);
        start(roll, current, { wheel: true, rate: rate, offset: elapsed * rate, end: beginning + seconds });
      }
      if (!tick) return;
      var step = 360 / slices, last = -1;
      for (var angle = (Math.floor(from / step) + 1) * step; angle < to; angle += step) {
        var offset = crossing((angle - from) / (to - from), curve) * seconds;
        if (offset < elapsed || offset - last < 0.055) continue;
        var progress = offset / seconds;
        start(tick, beginning + offset, { wheel: true, level: 0.48 + 0.25 * (1 - progress) });
        last = offset;
      }
    });
  }

  function update() {
    if (!enabled || volume === 0) stop();
    if (master) master.gain.setTargetAtTime(volume / 100, context.currentTime, 0.015);
    controls.forEach(function (paint) { paint(); });
  }
  function mount(box) {
    box.innerHTML =
      '<div class="setrow"><span class="setlabel" id="audio-label">Audio</span>' +
      '<div class="row" role="group" aria-labelledby="audio-label">' +
      '<button class="small" type="button" data-audio-set="on" aria-pressed="true">On</button>' +
      '<button class="small" type="button" data-audio-set="off" aria-pressed="false">Off</button></div></div>' +
      '<div class="setrow"><label class="setlabel" for="audio-volume">Audio volume</label>' +
      '<div class="row slidebox"><input id="audio-volume" type="range" min="0" max="100" step="1" value="50">' +
      '<output for="audio-volume">50%</output></div></div>';
    var slider = box.querySelector("input"), output = box.querySelector("output");
    var on = box.querySelector('[data-audio-set="on"]'), off = box.querySelector('[data-audio-set="off"]');
    function paint() {
      on.setAttribute("aria-pressed", String(enabled));
      off.setAttribute("aria-pressed", String(!enabled));
      slider.value = volume;
      slider.setAttribute("aria-valuetext", volume + "%");
      output.textContent = volume + "%";
    }
    function toggle(next) {
      if (enabled === next) return;
      enabled = next;
      save(ENABLED, enabled ? "on" : "off");
      update();
      if (enabled) Promise.resolve(unlock()).then(function () { play("ui_click"); });
    }
    on.onclick = function () { toggle(true); };
    off.onclick = function () { toggle(false); };
    slider.oninput = function () {
      volume = clampVolume(Number(slider.value));
      save(VOLUME, String(volume));
      update();
    };
    slider.onchange = function () { unlock(); play("ui_click"); };
    controls.push(paint);
    paint();
  }

  // Keep trying to unlock on genuine input, including after a mobile webview is interrupted.
  ["keydown", "pointerup", "touchend", "click"].forEach(function (event) {
    document.addEventListener(event, function (e) { if (e.isTrusted) unlock(); }, { capture: true, passive: true });
  });
  document.addEventListener("click", function (e) {
    var button = e.target.closest && e.target.closest("button");
    if (e.isTrusted && button && !button.disabled && !button.matches("#spin, .opt, [data-audio-set]")) play("ui_click");
  }, true);
  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.forEach.call(document.querySelectorAll("[data-audio-controls]"), mount);
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); });
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", function () { readPreferences(); update(); });
  window.addEventListener("storage", function (e) {
    if (e.key === ENABLED || e.key === VOLUME || e.key === null) { readPreferences(); update(); }
  });

  return { play: play, spin: spin, startup: startup, stop: stop };
})();
