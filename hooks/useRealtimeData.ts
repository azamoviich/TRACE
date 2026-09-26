import { useEffect, useRef, useState, useCallback } from 'react';

export type RealtimeEventType =
  // Order lifecycle
  | 'order_opened'
  | 'order_updated'
  | 'order_closed'
  | 'order_removed'
  | 'order_bill_printed'
  | 'order_bill_cancelled'
  | 'order_cash_receipt_printed'
  | 'order_payment_page_opened'
  | 'order_edit_page_opened'
  | 'order_before_delete'
  | 'order_printed_items_deleted'
  // Session
  | 'cashier_session_opened'
  | 'cashier_session_closed'
  // Stop list
  | 'stop_list_updated'
  // Kitchen
  | 'kitchen_order_changed'
  // Deliveries
  | 'delivery_changed'
  // Terminal
  | 'terminal_opened'
  | 'terminal_closed'
  // Poster — pushed by the backend's posterWebhook.ts (Poster's own
  // Marketplace webhook, re-broadcast over this same socket), not
  // TRACEPLUGIN. Named `poster.<object>.<action>` after Poster's own
  // webhook shape (e.g. `poster.transaction.changed`) rather than one of
  // the plugin's fixed event names above, since Poster's entity set is
  // different and only loosely maps onto it.
  | `poster.${string}`;

export interface RealtimeOrderData {
  orderId: string;
  number?: number;
  table?: { number: number; name: string };
  /** @deprecated use table.number */
  tableNumber?: number;
  waiter?: string;
  status: string;
  sum: number;
  discount?: number;
  guestsCount?: number;
  openTime?: string;
  closeTime?: string;
  billTime?: string;
  items: { name: string; category?: string; quantity: number; price: number; sum?: number }[];
  payments?: { type: string; amount: number; isPreliminary?: boolean }[];
}

export interface StopListUpdateData {
  items: { productId: string; amount: number | null; isAvailable: boolean }[];
}

export interface KitchenOrderData {
  orderId: string;
  orderNum?: number;
  status: string;
  cookingStartTime?: string;
  readyTime?: string;
  table?: { number: number; name: string };
  waiter?: string;
  items: { name: string; amount: number; status: string }[];
}

export interface ReserveData {
  reserveId: string;
  guestName?: string;
  phone?: string;
  guestCount: number;
  reserveTime: string;
  table?: { number: number; name: string };
  comment?: string;
  isDeleted?: boolean;
}

export interface DeliveryData {
  deliveryId: string;
  number?: number;
  status: string;
  sum: number;
}

// Shape of a Poster-sourced event's `data` field — set by the backend's
// posterWebhook.ts, one level of indirection removed from Poster's own raw
// webhook body (object/object_id/action/data) since `data` there is
// Poster's own per-entity payload (undocumented/varies by entity), passed
// through as-is rather than reshaped into one of the plugin types above.
export interface PosterWebhookData {
  object: string; // Poster's webhook entity name, e.g. 'transaction', 'incoming_order', 'stock'
  objectId: string;
  action: 'added' | 'changed' | 'removed' | 'transformed';
  data?: unknown;
}

export interface RealtimeEvent {
  type: RealtimeEventType;
  timestamp: string;
  data: RealtimeOrderData | StopListUpdateData | KitchenOrderData | ReserveData | DeliveryData | PosterWebhookData | Record<string, never>;
}

interface UseRealtimeDataOptions {
  backendWsUrl: string;
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
}

export function useRealtimeData({ backendWsUrl, enabled = true, onEvent }: UseRealtimeDataOptions) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const destroyedRef = useRef(false);
  const connectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!enabled || destroyedRef.current) return;
    const effectiveWsUrl = backendWsUrl ||
      `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

    const tenantId = import.meta.env.VITE_TENANT_ID as string | undefined;
    // The backend resolves the tenant from the Host header only when the WS
    // endpoint is on the tenant's own domain. In prod the WS URL points at
    // Railway directly, so pass the page's subdomain explicitly.
    const subdomain = window.location.hostname.split('.')[0];
    const tenantParam = tenantId
      ? `&tenant_id=${tenantId}`
      : `&subdomain=${encodeURIComponent(subdomain)}`;
    const url = `${effectiveWsUrl.replace(/\/$/, '')}/?type=frontend${tenantParam}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    // Debounce: only mark connected if the socket stays open for 600ms.
    // Prevents a one-frame green flash when the server accepts then closes immediately.
    ws.onopen = () => {
      if (destroyedRef.current) return;
      connectedTimerRef.current = setTimeout(() => {
        if (!destroyedRef.current && ws.readyState === WebSocket.OPEN) setConnected(true);
      }, 600);
    };

    ws.onmessage = (e) => {
      if (destroyedRef.current) return;
      try {
        const event: RealtimeEvent = JSON.parse(e.data);
        setLastEvent(event);
        onEventRef.current?.(event);
      } catch {
        // malformed message — ignore
      }
    };

    ws.onclose = () => {
      if (destroyedRef.current) return;
      connectedTimerRef.current && clearTimeout(connectedTimerRef.current);
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 5_000);
    };

    ws.onerror = () => ws.close();
  }, [backendWsUrl, enabled]);

  useEffect(() => {
    destroyedRef.current = false;
    connect();
    return () => {
      destroyedRef.current = true;
      reconnectTimer.current && clearTimeout(reconnectTimer.current);
      connectedTimerRef.current && clearTimeout(connectedTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, lastEvent };
}
