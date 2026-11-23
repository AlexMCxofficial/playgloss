// Plays a whole hosted game between the real host page (ui.js + host.js) and a real guest page (join.js).
// Nothing touches the network or a browser: both pages run in their own sandbox with a small fake page (DOM),
// a fake clock and an in-memory relay. Run:  node tests/test_game_flow.js
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path"), assert = require("assert");
const WEB = path.join(__dirname, "../web"), read = (f) => fs.readFileSync(path.join(WEB, f), "utf8");

/* ---------- fake clock ---------- */
const clock = { now: 1e9, timers: [], seq: 0 };
const setT = (fn, ms, rep) => { const id = ++clock.seq; clock.timers.push({ id, at: clock.now + (ms || 0), fn, rep: rep ? Math.max(ms, 1) : 0 }); return id; };
const clearT = (id) => { clock.timers = clock.timers.filter((t) => t.id !== id); };
const settle = async () => { for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r)); };
async function advance(ms) {
  const end = clock.now + ms;
  for (;;) {
    await settle();
    const due = clock.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (!due) { clock.now = end; await settle(); return; }
    clock.now = Math.max(clock.now, due.at);
    if (due.rep) due.at += due.rep; else clock.timers = clock.timers.filter((t) => t !== due);
    due.fn();
  }
}

/* ---------- fake page ---------- */
function makePage(html) {
  const byId = {};
  const match = (n, sel) => { const m = /^(\w+)\[data-(\w+)\]$/.exec(sel); return !!m && n.tagName === m[1] && n.dataset[m[2]] !== undefined; };
  function mk(tag) {
    const e = { tagName: tag, children: [], parent: null, attrs: {}, dataset: {}, listeners: {}, _text: "", hidden: false, disabled: false, open: false, className: "", value: "", style: { setProperty() {}, cssText: "" } };
    e.classList = { add(c) { if (!e.className.split(" ").includes(c)) e.className = (e.className + " " + c).trim(); }, contains(c) { return e.className.split(" ").includes(c); } };
    e.appendChild = (c) => { c.parent = e; e.children.push(c); return c; };
    e.removeChild = (c) => { e.children = e.children.filter((x) => x !== c); return c; };
    e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
    e.addEventListener = (t, f) => { (e.listeners[t] = e.listeners[t] || []).push(f); };
    e.closest = (sel) => { for (let n = e; n; n = n.parent) if (match(n, sel)) return n; return null; };
    e.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
    e.focus = () => {}; e.showModal = () => { e.open = true; }; e.close = () => { e.open = false; };
    Object.defineProperty(e, "parentNode", { get() { return e.parent; } });
    Object.defineProperty(e, "textContent", { get() { return e.children.length ? e.children.map((c) => c.textContent).join("") : e._text; }, set(v) { e.children = []; e._text = String(v); } });
    Object.defineProperty(e, "innerHTML", { get() { return ""; }, set() { e.children = []; } });
    return e;
  }
  const re = /<(\w+)\b([^>]*?)\bid="([^"]+)"([^>]*)>/g; let m;
  while ((m = re.exec(html))) { const e = mk(m[1]); e.hidden = /\bhidden\b/.test(m[2] + m[4]); e.disabled = /\bdisabled\b/.test(m[2] + m[4]); e.parent = mk("div"); byId[m[3]] = e; }
  ["game", "players", "board"].forEach((t) => { const b = mk("button"); b.dataset.tab = t; byId.mtabs.appendChild(b); });
  return { byId, mk, doc: { getElementById: (id) => byId[id] || null, createElement: mk, body: mk("body"), hidden: false, addEventListener() {} } };
}
// every button below an element (or the whole page) whose text matches
function buttons(el, out) { out = out || []; if (el.tagName === "button") out.push(el); el.children.forEach((c) => buttons(c, out)); return out; }
const btn = (root, text) => buttons(root).find((b) => b.textContent === text);
function click(page, b) { // like a finger: disabled buttons do nothing; a button without its own handler goes to the page's delegated listener
  assert(b, "button not found");
  if (b.disabled) return false;
  if (b.onclick) b.onclick({ target: b, preventDefault() {} });
  else (page.byId.game.listeners.click || []).concat(page.byId.mtabs.listeners.click || []).forEach((f) => f({ target: b }));
  return true;
}

/* ---------- in-memory relay between the two pages ---------- */
function newRelay() {
  const boxes = {}, hostIn = { cb: null };
  const box = (id) => boxes[id] || (boxes[id] = { msgs: [], n: 0, wait: null });
  return {
    hostIn, box,
    toGuest(id, data) { const b = box(id); b.msgs.push({ n: ++b.n, data }); if (b.wait) { const w = b.wait; b.wait = null; w(); } },
    toHost(id, data) { hostIn.cb({ payload: JSON.stringify({ id, data }) }); },
    poll(id, ack) { const b = box(id); const get = () => b.msgs.filter((x) => x.n > ack); const items = get(); if (items.length) return Promise.resolve({ n: items[items.length - 1].n, m: items.map((x) => x.data) }); return new Promise((res) => { b.wait = () => res({ n: get().slice(-1)[0].n, m: get().map((x) => x.data) }); }); }
  };
}

/* ---------- a page sandbox ---------- */
function sandbox(htmlFile, extra) {
  const page = makePage(read(htmlFile)), store = {};
  const ctx = Object.assign({
    document: page.doc, console, btoa, atob, URLSearchParams, setTimeout: setT, clearTimeout: clearT, setInterval: (f, ms) => setT(f, ms, true), clearInterval: clearT,
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    matchMedia: () => ({ matches: true }), navigator: { mediaDevices: null }, crypto: require("crypto").webcrypto, __enc: (s) => Array.from(Buffer.from(s, "utf8")), __dec: (a) => Buffer.from(a).toString("utf8"),
    location: { hash: "", search: "", origin: "http://host" }, alert: (t) => { throw new Error("alert: " + t); }
  }, extra);
  ctx.self = ctx; ctx.window = ctx; ctx.addEventListener = () => {};
  vm.createContext(ctx);
  vm.runInContext("class TextEncoder{encode(s){return new Uint8Array(__enc(s));}} class TextDecoder{decode(u){return __dec(Array.from(u));}}", ctx);
  vm.runInContext("Date.now = function () { return __now(); };", Object.assign(ctx, { __now: () => clock.now }));
  const load = (files) => files.forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
  return { ctx, page, load };
}

(async function main() {
  let count = 0; const test = async (name, fn) => { await fn(); count++; console.log("ok  " + name); };
  const relay = newRelay();
  const SHARED = ["js/vendor/nacl-fast.min.js", "js/core/wheel.js", "js/core/game.js", "js/core/filter.js"];

  /* the host page (the app) */
  const tauri = {
    core: { invoke: (cmd, a) => {
      if (cmd === "lan_start") return Promise.resolve(JSON.stringify({ port: 4000, ips: ["192.168.0.2"] }));
      if (cmd === "lan_send") { relay.toGuest(a.id, a.data); return Promise.resolve(); }
      return Promise.resolve(cmd === "lan_status" ? JSON.stringify({ peers: [] }) : undefined);
    } },
    event: { listen: (name, cb) => { if (name === "lan-msg") relay.hostIn.cb = cb; return Promise.resolve(() => {}); } }
  };
  const H = sandbox("play.html", { __TAURI__: tauri, localStorage: { getItem: (k) => (k === "online" ? "1" : null) } });
  H.load(SHARED.concat(["js/words.js"]));
  vm.runInContext("var ColorPicker={norm:function(c){return /^#[0-9a-f]{6}$/i.test(c)?c.toLowerCase():null;},close:function(){return false;},create:function(){return {el:document.createElement('div'),refresh:function(){}};}};", H.ctx);
  let seed = 7;
  H.ctx.__rnd = () => { if (H.ctx.__rq && H.ctx.__rq.length) return H.ctx.__rq.shift(); seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  vm.runInContext("Math.random = __rnd;", H.ctx);
  H.load(["js/view.js", "js/overlays.js", "js/online/proto.js", "js/online/session.js", "js/online/host.js", "js/online/link.js", "js/ui.js"]);
  const hp = H.page, $h = (id) => hp.byId[id];
  const pick = (id) => { H.ctx.Wheel.pick = () => H.ctx.Wheel.slices.find((s) => s.id === id); };
  let G, gp; const $g = (id) => gp.byId[id];

  await test("host opens a lobby; the iPad joins, is approved and takes seat 2", async () => {
    click(hp, btn($h("setup-body"), "Online")); await settle();
    click(hp, btn($h("setup-body"), "Host a game")); await settle();   // the tab
    click(hp, buttons($h("setup-body")).filter((b) => b.textContent === "Host a game").pop()); await settle(); // the button
    assert.strictEqual($h("lobby").hidden, false, "lobby is shown");
    assert.strictEqual($h("mtabs").hidden, true, "phone game tabs stay hidden in the host lobby");
    click(hp, buttons($h("lobby-seats")).filter((b) => b.textContent === "Open for guest")[1]); await settle(); // seat 2 is for the iPad
    const key = $h("host-link").textContent.split("#")[1]; assert(key, "the lobby shows the join link");
    G = sandbox("join.html", {
      location: { hash: "#" + key, search: "", origin: "http://host" },
      fetch: (url, o) => {
        const p = /\/(m|p)\/([0-9a-f]+)(?:\?a=(\d+))?/.exec(url);
        if (p[1] === "m") { relay.toHost(p[2], o.body); return Promise.resolve({ ok: true, status: 204 }); }
        return relay.poll(p[2], +p[3]).then((j) => ({ ok: true, status: 200, json: () => Promise.resolve(j) }));
      }
    });
    G.load(SHARED.concat(["js/view.js", "js/online/proto.js", "js/online/session.js", "js/online/guest.js", "js/online/link.js", "js/join.js"]));
    gp = G.page;
    $g("join-name").value = "iPad";
    click(gp, $g("join-go")); await advance(100);
    const approve = btn($h("dlg-btns"), "Approve"); assert(approve, "the host is asked to approve");
    click(hp, approve); await advance(300);
    assert(/Seated at seat 2|Waiting for host to start/.test($g("lobby-status").textContent), $g("lobby-status").textContent);
    assert.strictEqual($g("mtabs").hidden, true, "phone game tabs stay hidden in the guest lobby");
  });

  const startGame = async (hostFirst) => {
    H.ctx.__rq = hostFirst ? [0.95, 0.05] : [0.05, 0.95]; // the turn draw: 9 against 0, or 0 against 9
    click(hp, $h("lobby-start")); await settle();
    click(hp, $h("order-go")); await advance(300);
  };
  const cards = () => [].concat($h("cards-0").children, $h("cards-1").children);
  const act = (card, what) => buttons(card).find((b) => b.dataset.act === what);
  const finishQuestionOnGuest = async (i) => { click(gp, $g("q-opts").children[i]); await advance(300); click(gp, $g("q-next")); await advance(400); };
  const finishQuestionOnHost = async (i) => { click(hp, $h("q-opts").children[i]); await advance(100); click(hp, $h("q-next")); await advance(400); };

  await test("guest's turn: the question is on the guest's screen only", async () => {
    await startGame(false);
    assert.strictEqual($h("mtabs").hidden, false, "phone game tabs appear in the host game");
    assert.strictEqual($g("mtabs").hidden, false, "phone game tabs appear in the guest game");
    assert.strictEqual($g("spin").disabled, false, "the guest can spin");
    assert.strictEqual($h("spin").disabled, true, "the host cannot spin for the guest");
    pick("normal");
    click(gp, $g("spin")); await advance(4300);
    assert.strictEqual($h("q").hidden, true, "no question on the host screen");
    assert.strictEqual($h("pu").hidden, true);
    assert.strictEqual($g("q").hidden, false, "question on the guest screen");
    assert.strictEqual($g("q-opts").children.length, 4);
    assert.strictEqual($h("q-opts").children.length, 0, "the host never gets the words");
    assert(/is answering/.test($h("msg").textContent), $h("msg").textContent);
    cards().forEach((c) => { assert(act(c, "draw").disabled && act(c, "resign").disabled, "the host cannot offer a draw or resign for anyone now"); });
    assert.strictEqual($g("q").hidden, false);
  });

  await test("the guest answers, sees the result, continues, and the turn passes on", async () => {
    click(gp, $g("q-opts").children[0]); await advance(300);
    assert.strictEqual($h("q").hidden, true, "still no question on the host");
    assert.strictEqual($g("q-next").hidden, false, "the guest sees the result and a Continue button");
    assert(/Correct|Wrong/.test($g("q-level").textContent), $g("q-level").textContent);
    assert(/Correct|Wrong/.test($h("msg").textContent), "the host sees the result line");
    click(gp, $g("q-next")); await advance(400);
    assert.strictEqual($g("q").hidden, true);
    assert.strictEqual($g("spin").disabled, true, "not the guest's turn any more");
    assert.strictEqual($h("spin").disabled, false, "the host's player can spin");
  });

  await test("host's turn: the host answers, the guest sees no question", async () => {
    pick("easy"); click(hp, $h("spin")); await advance(4300);
    assert.strictEqual($h("q").hidden, false, "question on the host");
    assert.strictEqual($g("q").hidden, true, "not on the guest");
    await finishQuestionOnHost(1);
    assert.strictEqual($g("spin").disabled, false, "the guest's turn again");
  });

  await test("power-ups: the guest chooses on their own screen, the host sees nothing", async () => {
    pick("x2"); click(gp, $g("spin")); await advance(4300);          // the guest wins a 2x
    assert.strictEqual($g("spin").disabled, true);
    pick("very-easy"); click(hp, $h("spin")); await advance(4300); await finishQuestionOnHost(0);
    pick("hard"); click(gp, $g("spin")); await advance(4300);
    assert.strictEqual($h("pu").hidden, true, "no power-up choice on the host");
    assert.strictEqual($g("pu").hidden, false, "power-up choice on the guest");
    click(gp, btn($g("pu-btns"), "2x (1)")); await advance(300);
    assert.strictEqual(btn($g("pu-btns"), "2x (1)").attrs["aria-pressed"], "true", "2x shows as chosen");
    assert.strictEqual($g("pu").hidden, false, "the choice stays open after choosing");
    click(gp, $g("pu-go")); await advance(300);
    assert.strictEqual($g("pu").hidden, true);
    assert.strictEqual($g("q").hidden, false);
    assert(/2x active/.test($g("q-level").textContent), $g("q-level").textContent);
    assert.strictEqual($h("q").hidden, true);
    await finishQuestionOnGuest(0);
  });

  await test("host offers a draw: Accept appears only on the guest's screen and works there", async () => {
    assert.strictEqual($h("spin").disabled, false, "it is the host's turn");
    const mine = cards().map((c) => act(c, "draw")).filter((b) => !b.disabled); assert.strictEqual(mine.length, 1, "exactly one enabled Offer draw: the host's own player");
    click(hp, mine[0]); await advance(300);
    assert.strictEqual($h("dlg").open, false, "the host has no Accept dialog");
    assert.strictEqual($g("dlg").open, true, "the guest has the dialog");
    assert(btn($g("dlg-btns"), "Accept draw") && btn($g("dlg-btns"), "Decline"));
    assert.strictEqual($h("spin").disabled, true, "nobody can spin while the offer is open");
    click(gp, btn($g("dlg-btns"), "Accept draw")); await advance(400);
    assert(/Draw/.test($h("turn").textContent) && /Draw/.test($g("turn").textContent), $h("turn").textContent + " | " + $g("turn").textContent);
  });

  await test("after the game both go back to the lobby, then a new game: the guest offers a draw, only the host is asked", async () => {
    click(hp, $h("new")); await advance(300);
    assert.strictEqual($h("lobby").hidden, false); assert.strictEqual($g("lobby").hidden, false, "the guest is back in the lobby");
    await startGame(false);                                     // the guest goes first
    const mine = [].concat($g("cards-0").children, $g("cards-1").children).map((c) => act(c, "draw")).filter((b) => !b.disabled);
    assert.strictEqual(mine.length, 1, "the guest can offer for their own player only");
    click(gp, mine[0]); await advance(300);
    assert.strictEqual($g("dlg").open, false, "the guest has no Accept dialog for their own offer");
    assert.strictEqual($h("dlg").open, true, "the host is asked");
    assert(btn($h("dlg-btns"), "Accept draw"));
    click(hp, btn($h("dlg-btns"), "Decline")); await advance(400);
    assert.strictEqual($h("dlg").open, false);
    assert(/declined/.test($h("msg").textContent), $h("msg").textContent);
    assert.strictEqual($g("spin").disabled, false, "the guest carries on with their turn");
  });

  await test("the guest resigns on their own turn after a confirmation on their own screen", async () => {
    const resign = [].concat($g("cards-0").children, $g("cards-1").children).map((c) => act(c, "resign")).filter((b) => !b.disabled);
    assert.strictEqual(resign.length, 1);
    click(gp, resign[0]); await advance(200);
    assert.strictEqual($g("dlg").open, true); assert.strictEqual($h("dlg").open, false, "the host is not asked");
    click(gp, btn($g("dlg-btns"), "Resign")); await advance(400);
    assert(/wins/.test($h("turn").textContent) && /wins/.test($g("turn").textContent), $h("turn").textContent + " | " + $g("turn").textContent);
  });

  await test("Easter egg on the guest's turn: the guest gets the Continue button, the host does not", async () => {
    click(hp, $h("new")); await advance(300);
    await startGame(false);
    pick("egg"); click(gp, $g("spin")); await advance(4300);
    assert.strictEqual($g("egg").hidden, false, "the guest sees the egg");
    assert.strictEqual($g("egg-ok").hidden, false, "with a Continue button");
    assert.strictEqual($h("egg").hidden, true, "the host does not");
    click(gp, $g("egg-ok")); await advance(400);
    assert.strictEqual($g("egg").hidden, true);
    assert.strictEqual($h("spin").disabled, false, "the turn passed to the host's player");
  });

  await test("a guest who does not answer in time gets time up and the game carries on", async () => {
    pick("very-easy"); click(hp, $h("spin")); await advance(4300); await finishQuestionOnHost(0);
    pick("easy"); click(gp, $g("spin")); await advance(4300);
    assert.strictEqual($g("q").hidden, false);
    await advance(16000);                                          // Easy: 15 seconds
    assert(/Time is up/.test($h("msg").textContent), $h("msg").textContent);
    assert.strictEqual($g("q-next").hidden, false);
    click(gp, $g("q-next")); await advance(400);
    assert.strictEqual($h("spin").disabled, false);
  });

  await test("the host's buttons stay off while a guest's draw offer is open", async () => {
    const offer = cards().map((c) => act(c, "draw")).filter((b) => !b.disabled)[0];
    click(hp, offer); await advance(300);
    assert.strictEqual($h("dlg").open, false); assert.strictEqual($g("dlg").open, true);
    assert.strictEqual(cards().every((c) => act(c, "draw").disabled && act(c, "resign").disabled), true, "all host buttons are off while the offer is open");
    click(gp, btn($g("dlg-btns"), "Decline")); await advance(300);
    assert.strictEqual($g("dlg").open, false); assert(/declined/.test($h("msg").textContent));
  });

  console.log("\n" + count + " tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
