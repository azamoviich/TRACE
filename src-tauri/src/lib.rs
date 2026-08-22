#[tauri::command]
fn get_preset_tenant(app: tauri::AppHandle) -> Option<String> {
  use tauri::Manager;
  let dir = app.path().app_data_dir().ok()?;
  let contents = std::fs::read_to_string(dir.join("tenant.txt")).ok()?;
  let tenant = contents.trim().to_string();
  if tenant.is_empty() { None } else { Some(tenant) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![get_preset_tenant])
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
