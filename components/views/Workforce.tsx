// TRACE Employee — owner-facing admin surface for the employee mobile app.
// Structured like Checklists.tsx: one file, internal tab state. Phase 0 ships
// only the Geofence tab (branch clock-in radius + attendance/payroll policy);
// Roster/Shifts/Swaps/Payroll/Rules tabs land in later phases as more tabs
// added to the same `Tab` union, following this file's own pattern.
import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Locate, ShieldCheck, ShieldAlert, Save } from 'lucide-react';
import { Card } from '../ui/Card';
import { Language } from '../../types';
import { traceApi, WorkforceGeofenceSettings } from '../../services/traceApi';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

type Tab = 'geofence';

interface Props {
  lang: Language;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function Workforce({ lang, onShowToast }: Props) {
  const [tab, setTab] = useState<Tab>('geofence');

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {([
          { id: 'geofence' as Tab, label: tr(lang, 'Геолокация', 'Geofence', 'Geolokatsiya') },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-primary text-white' : 'bg-card text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'geofence' && <GeofenceTab lang={lang} onShowToast={onShowToast} />}
    </div>
  );
}

// Loaded on demand rather than imported at module top — Leaflet touches
// `window`/DOM globals that don't exist during any server-side pass, and it's
// only ever needed once this tab actually mounts.
async function loadLeaflet() {
  const L = await import('leaflet');
  return L.default ?? L;
}

const DEFAULT_CENTER: [number, number] = [41.311081, 69.240562]; // Tashkent — sane default before a branch pin exists

function GeofenceTab({ lang, onShowToast }: { lang: Language; onShowToast: Props['onShowToast'] }) {
  const [settings, setSettings] = useState<WorkforceGeofenceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState('');
  const [searching, setSearching] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);

  useEffect(() => {
    traceApi.settings.geofence()
      .then(setSettings)
      .catch(() => onShowToast(tr(lang, 'Не удалось загрузить настройки', 'Failed to load settings', "Sozlamalarni yuklab bo'lmadi"), 'error'))
      .finally(() => setLoading(false));
  }, []);

  // Map setup — runs once settings have loaded so the initial pin position
  // (existing lat/lng, or the Tashkent default) is known before Leaflet
  // mounts. Dragging the marker or clicking the map updates `settings`
  // directly; the circle radius reacts to the radius slider separately below.
  useEffect(() => {
    if (loading || !mapRef.current || mapInstance.current) return;
    let cancelled = false;

    loadLeaflet().then(L => {
      if (cancelled || !mapRef.current) return;
      leafletRef.current = L;
      const center: [number, number] = settings?.geofenceLat != null && settings?.geofenceLng != null
        ? [settings.geofenceLat, settings.geofenceLng]
        : DEFAULT_CENTER;

      const map = L.map(mapRef.current, { zoomControl: true }).setView(center, settings?.geofenceLat != null ? 16 : 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker(center, { draggable: true }).addTo(map);
      const circle = L.circle(center, {
        radius: settings?.geofenceRadiusM ?? 150,
        color: '#FF6B35',
        fillColor: '#FF6B35',
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(map);

      const applyPosition = (lat: number, lng: number) => {
        marker.setLatLng([lat, lng]);
        circle.setLatLng([lat, lng]);
        setSettings(s => (s ? { ...s, geofenceLat: lat, geofenceLng: lng } : s));
      };

      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        applyPosition(lat, lng);
      });
      map.on('click', (e: any) => applyPosition(e.latlng.lat, e.latlng.lng));

      mapInstance.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
    });

    return () => { cancelled = true; };
  }, [loading]);

  // Radius slider moves the circle live without waiting for save.
  useEffect(() => {
    if (circleRef.current && settings) circleRef.current.setRadius(settings.geofenceRadiusM);
  }, [settings?.geofenceRadiusM]);

  function update<K extends keyof WorkforceGeofenceSettings>(key: K, value: WorkforceGeofenceSettings[K]) {
    setSettings(s => (s ? { ...s, [key]: value } : s));
  }

  async function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        update('geofenceLat', latitude);
        update('geofenceLng', longitude);
        if (mapInstance.current) mapInstance.current.setView([latitude, longitude], 17);
        if (markerRef.current) markerRef.current.setLatLng([latitude, longitude]);
        if (circleRef.current) circleRef.current.setLatLng([latitude, longitude]);
      },
      () => onShowToast(tr(lang, 'Не удалось определить геолокацию', 'Could not get your location', "Joylashuvni aniqlab bo'lmadi"), 'error'),
    );
  }

  async function searchAddress() {
    if (!address.trim()) return;
    setSearching(true);
    try {
      // Nominatim — free, keyless, matches this project's existing
      // no-paid-map-SDK posture (Tailwind/recharts/lucide are all CDN too).
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        onShowToast(tr(lang, 'Адрес не найден', 'Address not found', 'Manzil topilmadi'), 'error');
        return;
      }
      const lat = parseFloat(rows[0].lat);
      const lng = parseFloat(rows[0].lon);
      update('geofenceLat', lat);
      update('geofenceLng', lng);
      if (mapInstance.current) mapInstance.current.setView([lat, lng], 17);
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      if (circleRef.current) circleRef.current.setLatLng([lat, lng]);
    } finally {
      setSearching(false);
    }
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const result = await traceApi.settings.saveGeofence(settings);
      setSettings(result);
      onShowToast(tr(lang, 'Настройки сохранены', 'Settings saved', 'Sozlamalar saqlandi'), 'success');
    } catch {
      onShowToast(tr(lang, 'Не удалось сохранить', 'Failed to save', "Saqlab bo'lmadi"), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return <Card><div className="h-64 animate-pulse bg-card-hover rounded-2xl" /></Card>;
  }

  const pinDropped = settings.geofenceLat != null && settings.geofenceLng != null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="lg:col-span-2 !p-0 overflow-hidden">
        <div ref={mapRef} className="w-full h-[420px] rounded-3xl" />
      </Card>

      <div className="space-y-5">
        <Card title={tr(lang, 'Точка филиала', 'Branch location', 'Filial nuqtasi')}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchAddress()}
                placeholder={tr(lang, 'Найти по адресу…', 'Search by address…', 'Manzil bo\'yicha qidirish…')}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text"
              />
              <button
                onClick={searchAddress}
                disabled={searching}
                className="px-3 py-2 rounded-lg bg-card-hover text-[13px] font-medium text-text disabled:opacity-50"
              >
                {tr(lang, 'Найти', 'Search', 'Qidirish')}
              </button>
            </div>
            <button
              onClick={useMyLocation}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-card-hover text-[13px] font-medium text-text"
            >
              <Locate size={14} /> {tr(lang, 'Использовать моё местоположение', 'Use my current location', 'Joriy joylashuvimni ishlatish')}
            </button>
            <p className="text-[12px] text-muted flex items-center gap-1.5">
              <MapPin size={12} />
              {pinDropped
                ? `${settings.geofenceLat!.toFixed(6)}, ${settings.geofenceLng!.toFixed(6)}`
                : tr(lang, 'Точка ещё не установлена — кликните по карте', 'No pin set yet — click the map', 'Nuqta hali belgilanmagan — xaritani bosing')}
            </p>
          </div>
        </Card>

        <Card title={tr(lang, 'Радиус входа', 'Clock-in radius', 'Kirish radiusi')}>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[32px] font-display font-bold text-text tabular-nums">{settings.geofenceRadiusM}</span>
              <span className="text-[13px] text-muted">{tr(lang, 'метров', 'meters', 'metr')}</span>
            </div>
            <input
              type="range"
              min={25}
              max={500}
              step={5}
              value={settings.geofenceRadiusM}
              onChange={e => update('geofenceRadiusM', Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        </Card>

        <Card>
          <button
            onClick={() => update('geofenceEnabled', !settings.geofenceEnabled)}
            className="w-full flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 text-left">
              {settings.geofenceEnabled ? <ShieldAlert size={18} className="text-danger shrink-0" /> : <ShieldCheck size={18} className="text-muted shrink-0" />}
              <div>
                <div className="text-[13px] font-semibold text-text">
                  {tr(lang, 'Блокировать вход вне радиуса', 'Enforce geofence on clock-in', 'Kirishni radius tashqarisida bloklash')}
                </div>
                <div className="text-[12px] text-muted mt-0.5">
                  {settings.geofenceEnabled
                    ? tr(lang, 'Сотрудники вне радиуса не смогут открыть смену', 'Employees outside the radius cannot open a shift', "Radiusdan tashqaridagi xodimlar smenani ocha olmaydi")
                    : tr(lang, 'Выключено — вход разрешён из любой точки, попытки логируются', 'Off — clock-in allowed from anywhere, attempts are still logged', "O'chirilgan — istalgan joydan kirish mumkin, urinishlar qayd etiladi")}
                </div>
              </div>
            </div>
            <span className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${settings.geofenceEnabled ? 'bg-danger' : 'bg-card-hover'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.geofenceEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </span>
          </button>
        </Card>

        <Card>
          <button
            onClick={() => update('employeeAppEnabled', !settings.employeeAppEnabled)}
            className="w-full flex items-center justify-between gap-3"
          >
            <div className="text-left">
              <div className="text-[13px] font-semibold text-text">
                {tr(lang, 'Приложение для сотрудников', 'Employee app', 'Xodimlar ilovasi')}
              </div>
              <div className="text-[12px] text-muted mt-0.5">
                {tr(lang, 'Включить смены/пропуска для этого филиала', 'Turn on shifts/clock-in for this branch', 'Ushbu filial uchun smenalarni yoqish')}
              </div>
            </div>
            <span className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${settings.employeeAppEnabled ? 'bg-primary' : 'bg-card-hover'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.employeeAppEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </span>
          </button>
        </Card>

        <button
          onClick={save}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-[13px] font-semibold disabled:opacity-50"
        >
          <Save size={14} /> {saving ? tr(lang, 'Сохранение…', 'Saving…', 'Saqlanmoqda…') : tr(lang, 'Сохранить', 'Save', 'Saqlash')}
        </button>
      </div>
    </div>
  );
}
