// TRACE Employee — owner-facing admin surface for the employee mobile app.
// Structured like Checklists.tsx: one file, internal tab state. Phase 0 ships
// only the Geofence tab (branch clock-in radius + attendance/payroll policy);
// Roster/Shifts/Swaps/Payroll/Rules tabs land in later phases as more tabs
// added to the same `Tab` union, following this file's own pattern.
import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Locate, ShieldCheck, ShieldAlert, Save, Plus, Send, Check, X, Calendar } from 'lucide-react';
import { Card } from '../ui/Card';
import { Language, ChecklistRole, ChecklistEmployee } from '../../types';
import { traceApi, WorkforceGeofenceSettings, checklistApi, RosterShift, SwapRequest } from '../../services/traceApi';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

type Tab = 'geofence' | 'roster';

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
          { id: 'roster' as Tab, label: tr(lang, 'Расписание', 'Roster', 'Jadval') },
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
      {tab === 'roster' && <RosterTab lang={lang} onShowToast={onShowToast} />}
    </div>
  );
}

// ── Roster ───────────────────────────────────────────────────────────────
// Build-a-week + swap approvals. Keeps the same Card/tr conventions as the
// rest of this file — a genuine "grid" builder (drag to assign, etc.) is a
// future pass; this ships create → publish → approve end-to-end.
function RosterTab({ lang, onShowToast }: { lang: Language; onShowToast: Props['onShowToast'] }) {
  const [roles, setRoles] = useState<ChecklistRole[]>([]);
  const [employees, setEmployees] = useState<ChecklistEmployee[]>([]);
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  const [roleId, setRoleId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');

  const load = () => {
    checklistApi.roles.list().then(setRoles).catch(() => {});
    checklistApi.employees.list().then(setEmployees).catch(() => {});
    checklistApi.roster.list().then(setShifts).catch(() => {});
    checklistApi.roster.swapRequests('open').then(setSwaps).catch(() => {});
    checklistApi.roster.swapRequests('claimed').then(claimed => setSwaps(prev => [...prev.filter(s => s.status !== 'claimed'), ...claimed])).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!roleId && roles[0]) setRoleId(roles[0].id); }, [roles]);
  useEffect(() => {
    const roleEmployees = employees.filter(e => e.role_id === roleId);
    if (roleEmployees[0] && !roleEmployees.some(e => e.id === employeeId)) setEmployeeId(roleEmployees[0].id);
  }, [roleId, employees]);

  const roleEmployees = employees.filter(e => e.role_id === roleId);
  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? '—';
  const employeeName = (id: string) => employees.find(e => e.id === id)?.name ?? '—';

  const addShift = async () => {
    if (!employeeId || !roleId || !date) {
      onShowToast(tr(lang, 'Укажите дату, роль и сотрудника', 'Enter a date, role and employee', "Sana, rol va xodimni kiriting"), 'error');
      return;
    }
    setBusy(true);
    try {
      const plannedStart = new Date(`${date}T${startTime}:00`).toISOString();
      const plannedEnd = new Date(`${date}T${endTime}:00`).toISOString();
      const created = await checklistApi.roster.create({ employeeId, roleId, plannedStart, plannedEnd });
      await checklistApi.roster.publish([created.id]);
      setShowAdd(false);
      load();
      onShowToast(tr(lang, 'Смена опубликована', 'Shift published', 'Smena e\'lon qilindi'), 'success');
    } catch { onShowToast(tr(lang, 'Не удалось создать смену', 'Failed to create shift', "Smena yaratib bo'lmadi"), 'error'); }
    finally { setBusy(false); }
  };

  const cancelShift = async (id: string) => {
    try { await checklistApi.roster.cancel(id); load(); } catch { onShowToast(tr(lang, 'Не удалось отменить', 'Failed to cancel', "Bekor qilib bo'lmadi"), 'error'); }
  };

  const approveSwap = async (id: string) => {
    try { await checklistApi.roster.approveSwap(id); load(); onShowToast(tr(lang, 'Замена одобрена', 'Swap approved', 'Almashtirish tasdiqlandi'), 'success'); }
    catch { onShowToast(tr(lang, 'Нужен исполнитель — дождитесь отклика', 'Needs a claimer first — wait for someone to volunteer', "Avval kimdir javob berishini kuting"), 'error'); }
  };
  const rejectSwap = async (id: string) => {
    try { await checklistApi.roster.rejectSwap(id); load(); }
    catch { onShowToast(tr(lang, 'Не удалось отклонить', 'Failed to reject', "Rad etib bo'lmadi"), 'error'); }
  };

  const upcoming = shifts.filter(s => s.status === 'published' && new Date(s.planned_end) > new Date()).sort((a, b) => a.planned_start.localeCompare(b.planned_start));

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h3 className="text-[15px] font-semibold text-text tracking-tight flex items-center gap-2">
            <Calendar size={16} /> {tr(lang, 'Расписание', 'Roster', 'Jadval')}
          </h3>
          <button onClick={() => setShowAdd(v => !v)} className="px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] font-semibold flex items-center gap-1.5">
            <Plus size={14} /> {tr(lang, 'Добавить смену', 'Add shift', "Smena qo'shish")}
          </button>
        </div>

        {showAdd && (
          <div className="mt-3 mb-4 p-3.5 rounded-xl border border-border bg-background space-y-2">
            <div className="grid sm:grid-cols-2 gap-2">
              <select value={roleId} onChange={e => setRoleId(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text">
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text">
                {roleEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text" />
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text" />
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={addShift} disabled={busy} className="px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-50">
                <Send size={14} /> {tr(lang, 'Опубликовать', 'Publish', "E'lon qilish")}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-3.5 py-2 rounded-lg bg-card border border-border text-muted text-[13px] font-medium">
                {tr(lang, 'Отмена', 'Cancel', 'Bekor qilish')}
              </button>
            </div>
          </div>
        )}

        {upcoming.length === 0 ? (
          <p className="text-[13px] text-muted">{tr(lang, 'Смены не запланированы', 'No shifts scheduled', "Smenalar rejalashtirilmagan")}</p>
        ) : (
          <div className="space-y-1.5">
            {upcoming.map(s => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border">
                <div>
                  <span className="text-[13px] text-text font-medium">{s.employee_name}</span>
                  <span className="text-[11px] text-muted ml-2">{s.role_name}</span>
                  <p className="text-[11px] text-muted mt-0.5">
                    {new Date(s.planned_start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {' – '}
                    {new Date(s.planned_end).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button onClick={() => cancelShift(s.id)} className="text-red-500 hover:text-red-600 text-[11px] font-semibold">
                  {tr(lang, 'Отменить', 'Cancel', 'Bekor qilish')}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-[15px] font-semibold text-text tracking-tight mb-3">{tr(lang, 'Запросы на замену', 'Swap requests', "Almashtirish so'rovlari")}</h3>
        {swaps.length === 0 ? (
          <p className="text-[13px] text-muted">{tr(lang, 'Нет активных запросов', 'No active requests', "Faol so'rovlar yo'q")}</p>
        ) : (
          <div className="space-y-1.5">
            {swaps.map(s => (
              <div key={s.id} className="p-3 rounded-lg bg-background border border-border space-y-1.5">
                <p className="text-[13px] text-text">
                  <span className="font-medium">{s.requesting_employee_name}</span>{' '}
                  {tr(lang, 'просит замену на', 'wants coverage for', 'uchun almashtirish so\'ramoqda')}{' '}
                  {new Date(s.planned_start).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {s.reason && <p className="text-[11px] text-muted">{s.reason}</p>}
                <p className="text-[11px] text-muted">
                  {s.status === 'claimed'
                    ? tr(lang, `Готов выйти: ${s.coverer_employee_name}`, `Volunteered: ${s.coverer_employee_name}`, `Tayyor: ${s.coverer_employee_name}`)
                    : tr(lang, 'Ожидает желающего', 'Waiting for a volunteer', "Ko'ngilli kutilmoqda")}
                </p>
                {s.status === 'claimed' && (
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => approveSwap(s.id)} className="px-2.5 py-1.5 rounded-lg bg-green-500/10 text-green-600 text-[12px] font-semibold flex items-center gap-1">
                      <Check size={13} /> {tr(lang, 'Одобрить', 'Approve', 'Tasdiqlash')}
                    </button>
                    <button onClick={() => rejectSwap(s.id)} className="px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-600 text-[12px] font-semibold flex items-center gap-1">
                      <X size={13} /> {tr(lang, 'Отклонить', 'Reject', 'Rad etish')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
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
