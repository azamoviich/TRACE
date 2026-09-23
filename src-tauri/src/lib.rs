use std::sync::atomic::{AtomicU32, Ordering};

static WINDOW_SEQ: AtomicU32 = AtomicU32::new(0);

#[tauri::command]
fn get_preset_tenant(app: tauri::AppHandle) -> Option<String> {
  use tauri::Manager;
  let dir = app.path().app_data_dir().ok()?;
  let contents = std::fs::read_to_string(dir.join("tenant.txt")).ok()?;
  let tenant = contents.trim().to_string();
  if tenant.is_empty() { None } else { Some(tenant) }
}

// tenant.txt is the exe's single "which restaurant is this device on" record.
// It lives on the Rust side (not the launcher's localStorage) so a remote
// tenant page can update it too -- e.g. when someone signs into a different
// restaurant from rodena's login form. `None` clears it.
#[tauri::command]
fn set_remembered_tenant(app: tauri::AppHandle, tenant: Option<String>) -> Result<(), String> {
  use tauri::Manager;
  let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
  let path = dir.join("tenant.txt");
  match tenant.map(|t| t.trim().to_string()).filter(|t| !t.is_empty()) {
    Some(t) => {
      std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
      std::fs::write(path, t).map_err(|e| e.to_string())
    }
    None => match std::fs::remove_file(path) {
      Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
      _ => Ok(()),
    },
  }
}

// Sign-out needs to get the webview back to the local launcher. Neither
// `window.location.href` from JS nor `WebviewWindow::navigate` from Rust
// works: WebView2 refuses an in-place top-level navigation from a remote
// https origin back to the app's own tauri.localhost custom-protocol host
// (ERR_CONNECTION_REFUSED either way -- confirmed by logging `navigate()`'s
// Result, which comes back Ok(()) even though the navigation visibly fails).
// So instead of navigating the existing webview, open a fresh window on the
// local URL -- the same thing that happens on a cold launch -- and then close
// the old one. Opening first means a window always exists, so Tauri's
// exit-when-no-windows-remain behavior never fires. The new window needs a
// fresh label (the old one is still alive), hence the `main-N` counter; the
// capability's `main*` window glob covers it. Browser args must match the
// config's window exactly, or WebView2 refuses to create the second webview.
// Async because creating a window from a sync command can deadlock on Windows.
#[tauri::command]
async fn sign_out(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
  // Forget the restaurant so the next launch shows the login picker.
  set_remembered_tenant(app.clone(), None)?;
  // WebviewUrl::App resolves to whatever origin Tauri actually serves the
  // launcher from (http://tauri.localhost on Windows by default) -- a
  // hardcoded https://tauri.localhost URL is refused outright.
  let url = tauri::WebviewUrl::App("index.html?switchAccount=1".into());
  let label = format!("main-{}", WINDOW_SEQ.fetch_add(1, Ordering::SeqCst) + 1);
  tauri::WebviewWindowBuilder::new(&app, label, url)
    .title("TRACE")
    .inner_size(1280.0, 820.0)
    .min_inner_size(900.0, 600.0)
    .resizable(true)
    .additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-gpu --disable-gpu-compositing")
    .build()
    .map_err(|e| e.to_string())?;
  window.close().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![get_preset_tenant, set_remembered_tenant, sign_out])
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
