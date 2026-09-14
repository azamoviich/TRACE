#[tauri::command]
fn get_preset_tenant(app: tauri::AppHandle) -> Option<String> {
  use tauri::Manager;
  let dir = app.path().app_data_dir().ok()?;
  let contents = std::fs::read_to_string(dir.join("tenant.txt")).ok()?;
  let tenant = contents.trim().to_string();
  if tenant.is_empty() { None } else { Some(tenant) }
}

// Sign-out needs the webview itself to navigate back to the local launcher
// — doing this via `window.location.href` from the remote tenant page hit
// ERR_CONNECTION_REFUSED on tauri.localhost (WebView2 custom-protocol
// navigation triggered from JS on a foreign origin is unreliable). Driving
// the navigation from Rust via WebviewWindow::navigate goes through the
// same API Tauri itself uses to load the app initially, sidestepping that.
#[tauri::command]
fn sign_out(window: tauri::WebviewWindow) -> Result<(), String> {
  let url = "https://tauri.localhost/index.html?switchAccount=1"
    .parse::<tauri::Url>()
    .map_err(|e| e.to_string())?;
  window.navigate(url).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![get_preset_tenant, sign_out])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
