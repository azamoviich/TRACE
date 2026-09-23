import { useEffect, useState } from 'react';
import { isTauriApp } from '../services/traceApi';

/**
 * Live "is the exe window maximized" flag, used to auto-switch between top
 * nav and side nav layouts (see navConfig NavStyle 'auto'). Always false in
 * a plain browser tab (isTauriApp() false) — the marketing site / tenant
 * subdomains never render a window chrome, so they're unaffected.
 */
export function useWindowMaximized(): boolean {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauriApp()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();

      const sync = () => {
        win.isMaximized().then(v => { if (!cancelled) setIsMaximized(v); }).catch(() => {});
      };

      sync();
      // Fires on maximize/restore/snap and plain resize — cheap to re-check on each.
      const un = await win.onResized(sync);
      if (cancelled) { un(); return; }
      unlisten = un;
    })();

    return () => { cancelled = true; unlisten?.(); };
  }, []);

  return isMaximized;
}
