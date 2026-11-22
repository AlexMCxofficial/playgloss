// Joining a game from inside the app. MIT License (see LICENSE).
//
// The join page opened inside the app cannot use the browser's own network calls to reach the host (the app
// page and the host are different origins, and some systems block plain http from an app window). So the page
// asks this small client to do the two calls for it, exactly like a browser would:
//   guest_post  POST /m/<id>        send one message (answer 204)
//   guest_poll  GET  /p/<id>?a=<n>  wait for messages (answer 200 with JSON)
// Messages are already encrypted by the page; this code never reads them. Only the standard library is used.
//
// What it refuses: any address that is not a private (home or office) IPv4 address, ports below 1024, ids that
// are not 32 lowercase hex characters, message text with anything but base64url characters, big messages and
// big answers. It sends nothing except these two requests, keeps nothing, and logs nothing.

use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

const MAX_BODY: usize = 8 * 1024; // largest message a guest can send (same as the host accepts)
const MAX_REPLY: usize = 64 * 1024; // largest answer read from the host
const POLL_WAIT_SECS: u64 = 30; // the host holds a poll for 20 seconds

// "192.168.1.23:49152" -> a socket address, only if it is a private network address.
fn parse_host(host: &str) -> Result<(SocketAddr, String), String> {
    let (ip_text, port_text) = host.split_once(':').ok_or_else(|| "bad address".to_string())?;
    let ip: Ipv4Addr = ip_text.parse().map_err(|_| "bad address".to_string())?;
    let port: u16 = port_text.parse().map_err(|_| "bad address".to_string())?;
    if port < 1024 || !(ip.is_private() || ip.is_link_local()) {
        return Err("not a local network address".to_string());
    }
    // The host compares its Host header with ip:port written the plain way, so write it that way.
    Ok((SocketAddr::new(IpAddr::V4(ip), port), format!("{}:{}", ip, port)))
}

fn valid_id(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

// base64url text only: letters, digits, - _ and .
fn is_safe_text(s: &str) -> bool {
    s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
}

fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}

// One request, one answer, then the connection is closed. Returns the status code and the body.
fn exchange(addr: SocketAddr, request: Vec<u8>, read_secs: u64) -> Result<(u16, Vec<u8>), String> {
    let mut s = TcpStream::connect_timeout(&addr, Duration::from_secs(5)).map_err(|e| format!("connect: {}", e))?;
    s.set_read_timeout(Some(Duration::from_secs(read_secs))).map_err(|e| e.to_string())?;
    s.set_write_timeout(Some(Duration::from_secs(10))).map_err(|e| e.to_string())?;
    let _ = s.set_nodelay(true);
    s.write_all(&request).map_err(|e| format!("send: {}", e))?;
    let mut buf: Vec<u8> = Vec::with_capacity(1024);
    let mut tmp = [0u8; 4096];
    loop {
        match s.read(&mut tmp) {
            Ok(0) => break, // the host closes the connection after its answer
            Ok(n) => {
                buf.extend_from_slice(&tmp[..n]);
                if buf.len() > MAX_REPLY + 4096 {
                    return Err("answer too large".to_string());
                }
            }
            Err(e) => return Err(format!("read: {}", e)),
        }
    }
    let head_end = find(&buf, b"\r\n\r\n").ok_or_else(|| "bad answer".to_string())?;
    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let status: u16 = head
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|c| c.parse().ok())
        .ok_or_else(|| "bad answer".to_string())?;
    let body = buf[head_end + 4..].to_vec();
    if body.len() > MAX_REPLY {
        return Err("answer too large".to_string());
    }
    Ok((status, body))
}

fn post_blocking(host: &str, id: &str, data: &str) -> Result<(), String> {
    let (addr, hostline) = parse_host(host)?;
    if !valid_id(id) || data.is_empty() || data.len() > MAX_BODY || !is_safe_text(data) {
        return Err("bad message".to_string());
    }
    let mut req = format!(
        "POST /m/{} HTTP/1.1\r\nHost: {}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        id,
        hostline,
        data.len()
    )
    .into_bytes();
    req.extend_from_slice(data.as_bytes());
    let (status, _) = exchange(addr, req, 10)?;
    if status == 204 {
        Ok(())
    } else {
        Err(format!("HTTP {}", status))
    }
}

fn poll_blocking(host: &str, id: &str, ack: u64) -> Result<String, String> {
    let (addr, hostline) = parse_host(host)?;
    if !valid_id(id) {
        return Err("bad id".to_string());
    }
    let req = format!(
        "GET /p/{}?a={} HTTP/1.1\r\nHost: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        id, ack, hostline
    )
    .into_bytes();
    let (status, body) = exchange(addr, req, POLL_WAIT_SECS)?;
    if status != 200 {
        return Err(format!("HTTP {}", status));
    }
    String::from_utf8(body).map_err(|_| "bad answer".to_string())
}

// These wait for the network, so they run off the window's thread (a poll can take 20 seconds).
#[tauri::command]
pub async fn guest_post(host: String, id: String, data: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || post_blocking(&host, &id, &data))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn guest_poll(host: String, id: String, ack: u64) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || poll_blocking(&host, &id, ack))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_private_addresses() {
        assert!(parse_host("192.168.1.23:49152").is_ok());
        assert!(parse_host("10.0.0.5:50000").is_ok());
        assert!(parse_host("172.16.4.1:40000").is_ok());
        assert!(parse_host("8.8.8.8:49152").is_err());
        assert!(parse_host("127.0.0.1:49152").is_err());
        assert!(parse_host("192.168.1.23:80").is_err());
        assert!(parse_host("example.com:49152").is_err());
        assert!(parse_host("192.168.1.23").is_err());
    }

    #[test]
    fn ids_and_text() {
        assert!(valid_id("0123456789abcdef0123456789abcdef"));
        assert!(!valid_id("0123456789ABCDEF0123456789abcdef"));
        assert!(!valid_id("short"));
        assert!(is_safe_text("abc-DEF_123."));
        assert!(!is_safe_text("a b"));
        assert!(!is_safe_text("a\r\nb"));
    }
}
