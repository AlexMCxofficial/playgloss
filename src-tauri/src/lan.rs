// Online play on the same network: a small relay server. MIT License (see LICENSE).
//
// What it is: the app opens a tiny web server on the local network (only after the host presses "Host a game"),
// hands out the guest page, and passes ENCRYPTED messages between the guests' browsers and the game running in the
// app's own window. It never reads, decrypts or understands a message, so the game rules, the answers and the keys
// stay in JavaScript. Only the standard library is used (no extra crates).
//
// How guests talk to it (plain HTTP/1.1, every connection is closed after one answer):
//   GET  /                  the join page (and the other whitelisted files below)
//   POST /m/<id>            a guest sends one message. <id> is 32 lowercase hex characters the guest made up.
//                           The body is base64url text (at most MAX_BODY bytes). Answer: 204.
//                           The message reaches the app as the event "lan-msg" with {"id":"...","data":"..."}.
//   GET  /p/<id>?a=<n>      a guest waits (up to POLL_SECS) for messages numbered above n. Answer: 200 with
//                           {"n":<highest number>,"m":["...","..."]}. This is how the app talks back.
//
// What it refuses: anyone who is not on a private (home or office) network, a Host header that is not exactly this
// server's address (stops DNS rebinding), a different Origin or a cross-site request, big or slow requests, too
// many connections or too many messages, and every file that is not on the whitelist (words.js is never served).
//
// The app's window controls it with these commands: lan_start, lan_stop, lan_send, lan_close and lan_status.

use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const MAX_CONN: usize = 24; // connections open at the same time
const MAX_PER_IP: usize = 10; // ... from one device
const MAX_PEERS: usize = 8; // different guest ids at the same time
const MAX_BODY: usize = 8 * 1024; // largest message a guest can send
const MAX_SEND: usize = 24 * 1024; // largest message the app can send to a guest
const MAX_OUTBOX: usize = 64; // messages kept for a guest who is slow to collect them
const MAX_HITS: usize = 40; // messages from one guest id per 10 seconds
const MAX_IP_HITS: usize = 150; // requests from one device per 10 seconds
const POLL_SECS: u64 = 20; // how long a "wait for messages" request is held

// The only files a guest may download. They come from the app's own embedded web folder.
const ASSETS: [&str; 12] = [
    "/join.html",
    "/css/style.css",
    "/js/theme.js",
    "/js/core/wheel.js",
    "/js/core/game.js",
    "/js/core/filter.js",
    "/js/view.js",
    "/js/overlays.js",
    "/js/online/proto.js",
    "/js/online/session.js",
    "/js/online/guest.js",
    "/js/vendor/nacl-fast.min.js",
];

struct Peer {
    out: VecDeque<(u64, String)>,
    next: u64,
    last: Instant,
    hits: VecDeque<Instant>,
    blocked: bool,
}

impl Peer {
    fn new() -> Peer {
        Peer { out: VecDeque::new(), next: 0, last: Instant::now(), hits: VecDeque::new(), blocked: false }
    }
}

struct Shared {
    ip: Ipv4Addr,
    port: u16,
    running: AtomicBool,
    conns: AtomicUsize,
    per_ip: Mutex<HashMap<IpAddr, usize>>,
    ip_hits: Mutex<HashMap<IpAddr, VecDeque<Instant>>>,
    peers: Mutex<HashMap<String, Peer>>,
}

#[derive(Default)]
pub struct Hub {
    cur: Mutex<Option<Arc<Shared>>>,
}

struct Req {
    method: String,
    path: String,
    query: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

/* ---------- commands the app window can call ---------- */

#[tauri::command]
pub fn lan_start(app: AppHandle, hub: State<'_, Hub>) -> Result<String, String> {
    let mut cur = hub.cur.lock().map_err(|_| "busy".to_string())?;
    if let Some(old) = cur.as_ref() {
        if old.running.load(Ordering::SeqCst) {
            return Err("Already hosting".to_string());
        }
    }
    let ip = lan_ip().ok_or_else(|| "No local network found. Connect to Wi-Fi first.".to_string())?;
    let listener = TcpListener::bind((ip, 0u16)).map_err(|e| format!("Could not open a port: {}", e))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let sh = Arc::new(Shared {
        ip,
        port,
        running: AtomicBool::new(true),
        conns: AtomicUsize::new(0),
        per_ip: Mutex::new(HashMap::new()),
        ip_hits: Mutex::new(HashMap::new()),
        peers: Mutex::new(HashMap::new()),
    });
    let sh2 = Arc::clone(&sh);
    thread::spawn(move || accept_loop(listener, sh2, app));
    *cur = Some(sh);
    Ok(format!("{{\"ip\":\"{}\",\"port\":{}}}", ip, port))
}

#[tauri::command]
pub fn lan_stop(hub: State<'_, Hub>) {
    let taken = match hub.cur.lock() {
        Ok(mut g) => g.take(),
        Err(_) => None,
    };
    if let Some(sh) = taken {
        sh.running.store(false, Ordering::SeqCst);
        if let Ok(mut p) = sh.peers.lock() {
            p.clear();
        }
    }
}

// The app sends one message to one guest. The data must already be encrypted base64url text.
#[tauri::command]
pub fn lan_send(hub: State<'_, Hub>, id: String, data: String) -> Result<(), String> {
    if !valid_id(&id) || data.is_empty() || data.len() > MAX_SEND || !is_safe_text(&data) {
        return Err("bad message".to_string());
    }
    let sh = current(&hub).ok_or_else(|| "not hosting".to_string())?;
    let mut peers = sh.peers.lock().map_err(|_| "busy".to_string())?;
    let p = peers.get_mut(&id).ok_or_else(|| "unknown guest".to_string())?;
    if p.blocked {
        return Err("removed".to_string());
    }
    p.next += 1;
    let n = p.next;
    p.out.push_back((n, data));
    while p.out.len() > MAX_OUTBOX {
        p.out.pop_front();
    }
    Ok(())
}

// Remove a guest: everything from that id is refused from now on.
#[tauri::command]
pub fn lan_close(hub: State<'_, Hub>, id: String) {
    if !valid_id(&id) {
        return;
    }
    if let Some(sh) = current(&hub) {
        if let Ok(mut peers) = sh.peers.lock() {
            if let Some(p) = peers.get_mut(&id) {
                p.blocked = true;
                p.out.clear();
            }
        }
    }
}

// {"running":true,"ip":"192.168.1.23","port":49152,"peers":[{"id":"...","idle":3,"blocked":false}]}
#[tauri::command]
pub fn lan_status(hub: State<'_, Hub>) -> String {
    let off = "{\"running\":false,\"peers\":[]}".to_string();
    let sh = match current(&hub) {
        Some(s) => s,
        None => return off,
    };
    let peers = match sh.peers.lock() {
        Ok(p) => p,
        Err(_) => return off,
    };
    let list: Vec<String> = peers
        .iter()
        .map(|(id, p)| format!("{{\"id\":\"{}\",\"idle\":{},\"blocked\":{}}}", id, p.last.elapsed().as_secs(), p.blocked))
        .collect();
    format!(
        "{{\"running\":{},\"ip\":\"{}\",\"port\":{},\"peers\":[{}]}}",
        sh.running.load(Ordering::SeqCst),
        sh.ip,
        sh.port,
        list.join(",")
    )
}

fn current(hub: &Hub) -> Option<Arc<Shared>> {
    match hub.cur.lock() {
        Ok(g) => g.as_ref().cloned(),
        Err(_) => None,
    }
}

/* ---------- finding this device's address on the local network ---------- */

// Connecting a UDP socket sends nothing; it only makes the system pick the network card it would use.
fn lan_ip() -> Option<Ipv4Addr> {
    for target in ["192.168.1.1:9", "192.168.0.1:9", "10.0.0.1:9", "172.16.0.1:9", "8.8.8.8:9"] {
        if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
            if sock.connect(target).is_ok() {
                if let Ok(SocketAddr::V4(a)) = sock.local_addr() {
                    let ip = *a.ip();
                    if ip.is_private() || ip.is_link_local() {
                        return Some(ip);
                    }
                }
            }
        }
    }
    None
}

fn allowed_peer(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => v.is_private() || v.is_loopback() || v.is_link_local(),
        IpAddr::V6(_) => false,
    }
}

/* ---------- the server ---------- */

fn accept_loop(listener: TcpListener, sh: Arc<Shared>, app: AppHandle) {
    while sh.running.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((mut stream, addr)) => {
                let ip = addr.ip();
                if !allowed_peer(&ip) {
                    continue; // dropping the stream closes it
                }
                if sh.conns.load(Ordering::SeqCst) >= MAX_CONN {
                    reply(&mut stream, 503, "text/plain", b"", &[]);
                    continue;
                }
                let too_many = match sh.per_ip.lock() {
                    Ok(mut m) => {
                        let c = m.entry(ip).or_insert(0);
                        if *c >= MAX_PER_IP {
                            true
                        } else {
                            *c += 1;
                            false
                        }
                    }
                    Err(_) => true,
                };
                if too_many {
                    reply(&mut stream, 429, "text/plain", b"", &[]);
                    continue;
                }
                sh.conns.fetch_add(1, Ordering::SeqCst);
                let sh2 = Arc::clone(&sh);
                let app2 = app.clone();
                thread::spawn(move || {
                    handle(stream, ip, &sh2, &app2);
                    sh2.conns.fetch_sub(1, Ordering::SeqCst);
                    if let Ok(mut m) = sh2.per_ip.lock() {
                        if let Some(c) = m.get_mut(&ip) {
                            if *c > 0 {
                                *c -= 1;
                            }
                        }
                    }
                });
            }
            Err(_) => thread::sleep(Duration::from_millis(40)), // nothing waiting (or a hiccup)
        }
    }
}

fn handle(mut s: TcpStream, ip: IpAddr, sh: &Arc<Shared>, app: &AppHandle) {
    // sockets from a non-blocking listener can be non-blocking on some systems
    let _ = s.set_nonblocking(false);
    let _ = s.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = s.set_write_timeout(Some(Duration::from_secs(10)));
    let _ = s.set_nodelay(true);

    let req = match read_request(&mut s) {
        Ok(r) => r,
        Err(code) => {
            reply(&mut s, code, "text/plain", b"", &[]);
            return;
        }
    };

    // Only requests that really came to this address, from a page on this address.
    let me = format!("{}:{}", sh.ip, sh.port);
    let host_ok = req.headers.get("host").map_or(false, |h| h.eq_ignore_ascii_case(&me));
    if !host_ok {
        reply(&mut s, 421, "text/plain", b"", &[]);
        return;
    }
    if let Some(o) = req.headers.get("origin") {
        if !o.eq_ignore_ascii_case(&format!("http://{}", me)) {
            reply(&mut s, 403, "text/plain", b"", &[]);
            return;
        }
    }
    if let Some(f) = req.headers.get("sec-fetch-site") {
        if f != "same-origin" && f != "none" {
            reply(&mut s, 403, "text/plain", b"", &[]);
            return;
        }
    }

    let ok = match sh.ip_hits.lock() {
        Ok(mut m) => hit(m.entry(ip).or_insert_with(VecDeque::new), MAX_IP_HITS, Duration::from_secs(10)),
        Err(_) => false,
    };
    if !ok {
        reply(&mut s, 429, "text/plain", b"", &[]);
        return;
    }

    if req.method == "POST" && req.path.starts_with("/m/") {
        post_msg(&mut s, &req, sh, app);
    } else if req.method == "GET" && req.path.starts_with("/p/") {
        poll(&mut s, &req, sh);
    } else if req.method == "GET" {
        match asset(app, &req.path) {
            Some((mime, bytes)) => {
                let csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
                if mime.starts_with("text/html") {
                    reply(&mut s, 200, &mime, &bytes, &[("Content-Security-Policy", csp), ("X-Frame-Options", "DENY")]);
                } else {
                    reply(&mut s, 200, &mime, &bytes, &[]);
                }
            }
            None => reply(&mut s, 404, "text/plain", b"", &[]),
        }
    } else {
        reply(&mut s, 405, "text/plain", b"", &[]);
    }
}

// A guest sends a message: check it, remember the guest, and pass it to the app window.
fn post_msg(s: &mut TcpStream, req: &Req, sh: &Arc<Shared>, app: &AppHandle) {
    let cid = &req.path[3..];
    let data = std::str::from_utf8(&req.body).unwrap_or("");
    if !valid_id(cid) || data.is_empty() || !is_safe_text(data) {
        reply(s, 400, "text/plain", b"", &[]);
        return;
    }
    let code: u16 = match sh.peers.lock() {
        Ok(mut peers) => {
            if !peers.contains_key(cid) && peers.len() >= MAX_PEERS {
                503
            } else {
                let p = peers.entry(cid.to_string()).or_insert_with(Peer::new);
                if p.blocked {
                    403
                } else {
                    p.last = Instant::now();
                    if hit(&mut p.hits, MAX_HITS, Duration::from_secs(10)) {
                        204
                    } else {
                        429
                    }
                }
            }
        }
        Err(_) => 503,
    };
    if code == 204 {
        // both parts were checked above, so this text is safe to build by hand
        let _ = app.emit("lan-msg", format!("{{\"id\":\"{}\",\"data\":\"{}\"}}", cid, data));
    }
    reply(s, code, "text/plain", b"", &[]);
}

// A guest waits for messages from the app (up to POLL_SECS), then gets whatever is new.
fn poll(s: &mut TcpStream, req: &Req, sh: &Arc<Shared>) {
    let cid = &req.path[3..];
    if !valid_id(cid) {
        reply(s, 400, "text/plain", b"", &[]);
        return;
    }
    let after: u64 = req
        .query
        .split('&')
        .find_map(|kv| kv.strip_prefix("a="))
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let end = Instant::now() + Duration::from_secs(POLL_SECS);
    loop {
        let mut status: u16 = 0;
        let mut body = String::new();
        match sh.peers.lock() {
            Ok(mut peers) => match peers.get_mut(cid) {
                None => status = 404,
                Some(p) => {
                    if p.blocked {
                        status = 403;
                    } else {
                        p.last = Instant::now();
                        let items: Vec<&(u64, String)> = p.out.iter().filter(|it| it.0 > after).collect();
                        if let Some(lastit) = items.last() {
                            let list: Vec<String> = items.iter().map(|it| format!("\"{}\"", it.1)).collect();
                            body = format!("{{\"n\":{},\"m\":[{}]}}", lastit.0, list.join(","));
                            status = 200;
                        }
                    }
                }
            },
            Err(_) => status = 503,
        }
        if status != 0 {
            reply(s, status, "application/json", body.as_bytes(), &[]);
            return;
        }
        if !sh.running.load(Ordering::SeqCst) || Instant::now() >= end {
            let empty = format!("{{\"n\":{},\"m\":[]}}", after);
            reply(s, 200, "application/json", empty.as_bytes(), &[]);
            return;
        }
        thread::sleep(Duration::from_millis(100));
    }
}

// A whitelisted file from the app's embedded web folder (names are matched without regard to upper or lower case).
fn asset(app: &AppHandle, path: &str) -> Option<(String, Vec<u8>)> {
    let wanted = if path == "/" { "/join.html" } else { path };
    let name = ASSETS.iter().find(|a| a.eq_ignore_ascii_case(wanted))?;
    let resolver = app.asset_resolver();
    let found = resolver
        .get(name.to_string())
        .or_else(|| resolver.get(name.trim_start_matches('/').to_string()))?;
    Some((found.mime_type, found.bytes))
}

/* ---------- small helpers ---------- */

fn valid_id(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

// base64url text only: letters, digits, - _ and .
fn is_safe_text(s: &str) -> bool {
    s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
}

// Allows `limit` hits per `window`; returns false when the limit is used up.
fn hit(q: &mut VecDeque<Instant>, limit: usize, window: Duration) -> bool {
    let now = Instant::now();
    while q.front().map_or(false, |t| now.duration_since(*t) > window) {
        q.pop_front();
    }
    if q.len() >= limit {
        return false;
    }
    q.push_back(now);
    true
}

fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}

// Reads one HTTP request. The error is the HTTP status to answer with.
fn read_request(s: &mut TcpStream) -> Result<Req, u16> {
    let mut buf: Vec<u8> = Vec::with_capacity(1024);
    let mut tmp = [0u8; 1024];
    let head_end = loop {
        if let Some(p) = find(&buf, b"\r\n\r\n") {
            break p + 4;
        }
        if buf.len() > 8192 {
            return Err(431);
        }
        match s.read(&mut tmp) {
            Ok(0) => return Err(400),
            Ok(n) => buf.extend_from_slice(&tmp[..n]),
            Err(_) => return Err(408),
        }
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let mut lines = head.split("\r\n");
    let first = lines.next().unwrap_or("");
    let mut parts = first.split(' ');
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("").to_string();
    let version = parts.next().unwrap_or("");
    if !version.starts_with("HTTP/1.") || !target.starts_with('/') || target.len() > 300 {
        return Err(400);
    }
    let mut headers: HashMap<String, String> = HashMap::new();
    for l in lines {
        if l.is_empty() {
            break;
        }
        if headers.len() >= 40 {
            return Err(431);
        }
        if let Some((k, v)) = l.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    if headers.contains_key("transfer-encoding") {
        return Err(400);
    }
    let len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if len > MAX_BODY {
        return Err(413);
    }
    let mut body: Vec<u8> = buf[head_end..].to_vec();
    while body.len() < len {
        match s.read(&mut tmp) {
            Ok(0) => return Err(400),
            Ok(n) => body.extend_from_slice(&tmp[..n]),
            Err(_) => return Err(408),
        }
        if body.len() > MAX_BODY {
            return Err(413);
        }
    }
    body.truncate(len);
    let (path, query) = match target.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (target.clone(), String::new()),
    };
    Ok(Req { method, path, query, headers, body })
}

fn reply(s: &mut TcpStream, code: u16, ctype: &str, body: &[u8], extra: &[(&str, &str)]) {
    let text = match code {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        408 => "Request Timeout",
        413 => "Payload Too Large",
        421 => "Misdirected Request",
        429 => "Too Many Requests",
        431 => "Request Header Fields Too Large",
        503 => "Service Unavailable",
        _ => "Error",
    };
    let mut head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nCross-Origin-Resource-Policy: same-origin\r\nConnection: close\r\n",
        code,
        text,
        ctype,
        body.len()
    );
    for (k, v) in extra {
        head.push_str(&format!("{}: {}\r\n", k, v));
    }
    head.push_str("\r\n");
    let _ = s.write_all(head.as_bytes());
    if !body.is_empty() {
        let _ = s.write_all(body);
    }
    let _ = s.flush();
}
