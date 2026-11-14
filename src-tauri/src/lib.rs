// The game itself is the web/ folder. This only opens a window around it and
// lets links to other sites open in the system browser.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running PlayGloss");
}
