import { useEffect, useRef, useState } from 'react';
import { traceApi } from '../services/traceApi';

export interface OccupiedTableInfo {
  min: number;
  sum: number;
}

/**
 * Single source of truth for "which tables are occupied right now", shared by
 * the Dashboard occupancy stat and the Operations hall heatmap. Re-polls the
 * backend's full-day computation on an interval instead of only replaying
 * live WebSocket events — a purely event-driven Map drifts from reality
 * whenever a send is lost (reconnects, restarts) and never self-corrects.
 */
export function useOccupiedTables(enabled: boolean, intervalMs = 30_000) {
  const [tables, setTables] = useState<Set<number>>(new Set());
  const [info, setInfo] = useState<Map<number, OccupiedTableInfo>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const load = () => {
      traceApi.operations.activeOrders()
        .then(rows => {
          const nums = new Set<number>();
          const infoMap = new Map<number, OccupiedTableInfo>();
          const openMsMap = new Map<number, number>();
          const now = Date.now();
          for (const o of rows) {
            if (o.tableNum == null) continue;
            const openMs = new Date(o.openTime).getTime();
            const prevOpenMs = openMsMap.get(o.tableNum);
            // Multiple "active" rows can reference the same table (a stale
            // order whose close event was dropped); keep only the most
            // recently opened one so the seated-duration clock is accurate.
            if (prevOpenMs != null && prevOpenMs >= openMs) continue;
            nums.add(o.tableNum);
            openMsMap.set(o.tableNum, openMs);
            const min = Math.floor((now - openMs) / 60000);
            infoMap.set(o.tableNum, { min: Math.max(0, min), sum: o.sum });
          }
          setTables(nums);
          setInfo(infoMap);
        })
        .catch(() => {});
    };

    load();
    timerRef.current = setInterval(load, intervalMs);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [enabled, intervalMs]);

  return { tables, info };
}
