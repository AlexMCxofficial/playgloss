// The game itself is the web/ folder. This opens a window around it, lets links to other sites open in the
// system browser, joins a game from inside the app (see guest.rs), and (only when the player turns it on and presses "Host a game") runs the small network
// server for online play on the same network. See lan.rs.
mod guest;
mod lan;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(lan::Hub::default())
        .invoke_handler(tauri::generate_handler![
            lan::lan_start,
            lan::lan_stop,
            lan::lan_send,
            lan::lan_close,
            lan::lan_status,
            guest::guest_post,
            guest::guest_poll
        ])
        .run(tauri::generate_context!())
        .expect("error while running PlayGloss");
}
