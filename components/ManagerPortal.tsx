import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle, XCircle, ClipboardList, Trash2,
  MapPin, Users, CreditCard, CloudSun, UserCheck, Save, ImagePlus, X, ChevronRight, Circle, ArrowLeft,
} from 'lucide-react';
// XCircle/CheckCircle still used in feedback row buttons
import { managerShiftReportCreate, fetchDailySnapshot, fetchShiftTables, getManagerTenant, uploadPhoto, DailySnapshot, ShiftTable } from '../services/traceApi';
import { ShiftFeedback } from '../types';

function getTenant(): string {
  return getManagerTenant();
}

const BRANCH_BY_TENANT: Record<string, string> = {
  'benedict':      'Мирабад',
  'benedict-nukus': 'Нукус',
};

function getTenantBranch(tenant: string): string {
  return BRANCH_BY_TENANT[tenant] ?? 'Мирабад';
}

const BRANCH_COORDS: Record<string, { lat: number; lon: number }> = {
  'Мирабад': { lat: 41.2995, lon: 69.2401 },
  'Нукус':   { lat: 42.4610, lon: 59.6040 },
};

const WMO: Record<number, string> = {
  0: 'ясно', 1: 'преимущественно ясно', 2: 'переменная облачность', 3: 'пасмурно',
  45: 'туман', 48: 'туман с инеем',
  51: 'лёгкая морось', 53: 'морось', 55: 'сильная морось',
  61: 'лёгкий дождь', 63: 'дождь', 65: 'сильный дождь',
  71: 'лёгкий снег', 73: 'снег', 75: 'сильный снег',
  80: 'ливень', 81: 'ливни', 82: 'сильный ливень',
  95: 'гроза', 96: 'гроза с градом', 99: 'сильная гроза с градом',
};

async function fetchWeather(branch: string): Promise<string> {
  const coords = BRANCH_COORDS[branch];
  if (!coords) return '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code`;
  const r = await fetch(url);
  const d = await r.json();
  const temp = Math.round(d.current.temperature_2m);
  const desc = WMO[d.current.weather_code as number] ?? '';
  return `${temp > 0 ? '+' : ''}${temp}°C${desc ? ', ' + desc : ''}`;
}
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
}

interface FormState {
  branch: string;
  shift: 'morning' | 'evening';
  date: string;
  manager_name: string;
  prev_manager: string;
  weather: string;
  cash_total: string;
  guests_count: string;
  avg_check: string;
  good_feedbacks: ShiftFeedback[];
  bad_feedbacks: ShiftFeedback[];
  report_text: string;
  status: 'good' | 'bad';
}

function makeEmpty(tenant: string): FormState {
  return {
    branch: getTenantBranch(tenant),
    shift: 'morning',
    date: today(),
    manager_name: '',
    prev_manager: '',
    weather: '',
    cash_total: '',
    guests_count: '',
    avg_check: '',
    good_feedbacks: [],
    bad_feedbacks: [],
    report_text: '',
    status: 'good',
  };
}

/* ─── small helpers ─── */
const inputCls = 'w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-3.5 py-3.5 text-white text-base focus:border-[#3d9eff] focus:outline-none placeholder:text-[#7a7a7a] touch-manipulation';
const labelCls = 'block text-[11px] uppercase tracking-[0.15em] text-[#9a9a9a] mb-2 font-medium';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.2em] text-[#3d9eff] font-semibold mb-4 pt-1">
      {children}
    </p>
  );
}

/* ─── Feedback row ─── */
function FeedbackRow({
  item, onChange, onRemove, onSave, onSwap, type, quickPhrase,
}: {
  item: ShiftFeedback;
  onChange: (f: ShiftFeedback) => void;
  onRemove: () => void;
  onSave: () => void;
  onSwap: () => void;
  type: 'good' | 'bad';
  quickPhrase?: string;
}) {
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const empty = !item.note.trim();
  const base = 'bg-[#0a0a0a] rounded-xl px-3 py-3 text-white text-base focus:outline-none placeholder:text-[#7a7a7a] touch-manipulation border';
  const noteCls  = base + (empty ? ' border-red-500/60 focus:border-red-400' : ' border-[#2a2a2a] focus:border-[#3d9eff]');

  const handleSave = () => {
    if (empty) return;
    onSave();
    setSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(f => uploadPhoto(getTenant(), f)));
      const latest = itemRef.current;
      onChange({ ...latest, photos: [...(latest.photos ?? []), ...urls] });
    } catch {
      alert('Не удалось загрузить фото. Попробуйте ещё раз.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removePhoto = (i: number) =>
    onChange({ ...item, photos: (item.photos ?? []).filter((_, j) => j !== i) });

  return (
    <div className={`space-y-2 rounded-2xl p-2 transition-colors ${empty ? 'bg-red-500/5' : saved ? 'bg-emerald-500/5' : ''}`}>
      <div className="flex gap-2 items-center">
        {/* Back — returns to the good/bad choice for this table, in case of
            an accidental tap, without losing the note already typed. */}
        <button type="button" onClick={onSwap} title="Выбрать заново"
          className="w-10 h-10 flex items-center justify-center text-[#8a8a8a] hover:text-white transition-colors flex-shrink-0 touch-manipulation">
          <ArrowLeft size={18} />
        </button>
        <span className={`text-[12px] font-semibold ${type === 'good' ? 'text-emerald-400' : 'text-red-400'}`}>
          {type === 'good' ? 'Положительный' : 'Жалоба'}
        </span>
        <div className="flex-1" />
        {/* Photo upload button */}
        <label className={`w-10 h-10 flex items-center justify-center text-[#9a9a9a] hover:text-[#3d9eff] transition-colors flex-shrink-0 touch-manipulation cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          {uploading
            ? <span className="w-4 h-4 border border-[#3d9eff]/40 border-t-[#3d9eff] rounded-full animate-spin" />
            : <ImagePlus size={16} />}
          <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
        </label>
        <button type="button" onClick={handleSave} disabled={empty}
          className={`w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0 touch-manipulation ${saved ? 'text-emerald-400' : 'text-[#3d9eff] disabled:text-[#7a7a7a]'}`}>
          {saved ? <CheckCircle size={16} /> : <Save size={15} />}
        </button>
        <button type="button" onClick={onRemove}
          className="w-10 h-10 flex items-center justify-center text-[#8a8a8a] hover:text-red-400 transition-colors flex-shrink-0 touch-manipulation">
          <Trash2 size={16} />
        </button>
      </div>
      <input
        type="text"
        value={item.note}
        onChange={e => onChange({ ...item, note: e.target.value })}
        placeholder="Комментарий (обязательно)"
        className={noteCls + ' w-full'}
      />
      {/* Quick-fill: one tap writes the standard phrase instead of typing it out */}
      {quickPhrase && empty && (
        <button
          type="button"
          onClick={() => onChange({ ...item, note: quickPhrase })}
          className="text-[11px] text-[#3d9eff] hover:text-white transition-colors touch-manipulation px-1"
        >
          ⚡ {quickPhrase}
        </button>
      )}
      {/* Per-row photos — collapsed by default */}
      {(item.photos ?? []).length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setPhotosOpen(o => !o)}
            className="flex items-center gap-1 text-[11px] text-[#9a9a9a] hover:text-[#3d9eff] transition-colors touch-manipulation"
          >
            <ChevronRight size={12} className={`transition-transform ${photosOpen ? 'rotate-90' : ''}`} />
            {(item.photos ?? []).length} фото
          </button>
          {photosOpen && (
            <div className="grid grid-cols-4 gap-1.5 mt-1.5">
              {(item.photos ?? []).map((url, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-[#0a0a0a] border border-[#2a2a2a]">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removePhoto(i)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-red-500/80 transition-colors">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {empty && <p className="text-[11px] text-red-400 px-1">Заполните или удалите этот отзыв</p>}
      {saved && <p className="text-[11px] text-emerald-400 px-1">Сохранено ✓</p>}
    </div>
  );
}

/* ─── Table row — live checklist entry with inline feedback editing ─── */
function TableRow({
  t, entry, flagged, onChoose, onChange, onRemove, onSave,
}: {
  t: ShiftTable;
  entry: { item: ShiftFeedback; type: 'good' | 'bad' } | null;
  flagged: boolean;
  onChoose: (type: 'good' | 'bad') => void;
  onChange: (v: ShiftFeedback) => void;
  onRemove: () => void;
  onSave: () => void;
}) {
  const [reChoosing, setReChoosing] = useState(false);
  const time = new Date(t.openTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
  const showChooser = !entry || reChoosing;

  const choose = (type: 'good' | 'bad') => {
    onChoose(type);
    setReChoosing(false);
  };

  return (
    <div className={`bg-[#0a0a0a] border rounded-xl px-3 py-2.5 space-y-2 ${flagged ? 'border-red-500/50' : 'border-[#2a2a2a]'}`}>
      <div className="flex items-center gap-2">
        {t.status === 'open'
          ? <Circle size={9} className="text-emerald-400 fill-emerald-400 flex-shrink-0" />
          : <Circle size={9} className="text-[#5a5a5a] flex-shrink-0" />}
        <span className="text-[14px] font-semibold text-white flex-shrink-0">Стол {t.table}</span>
        <span className="text-[11px] text-[#7a7a7a] flex-shrink-0">{time}</span>
        {t.status === 'open' && (
          <span className={`text-[11px] font-semibold flex-shrink-0 ${flagged ? 'text-red-400' : 'text-[#7a7a7a]'}`}>
            · {t.minsOpen} мин
          </span>
        )}
        {t.waiter && <span className="text-[11px] text-[#8a8a8a] truncate">{t.waiter}</span>}
        <div className="flex-1" />
        {showChooser ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button type="button" onClick={() => choose('good')}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 touch-manipulation">
              <CheckCircle size={13} />
            </button>
            <button type="button" onClick={() => choose('bad')}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 touch-manipulation">
              <XCircle size={13} />
            </button>
          </div>
        ) : (
          <span className={`text-[11px] flex items-center gap-1 flex-shrink-0 ${entry!.type === 'good' ? 'text-emerald-400' : 'text-red-400'}`}>
            {entry!.type === 'good' ? <CheckCircle size={12} /> : <XCircle size={12} />} Отзыв есть
          </span>
        )}
      </div>
      {entry && !reChoosing && (
        <FeedbackRow
          item={entry.item}
          onChange={onChange}
          onRemove={onRemove}
          onSave={onSave}
          onSwap={() => setReChoosing(true)}
          type={entry.type}
          quickPhrase={entry.type === 'good' ? 'Положительный отзыв получен' : 'Жалоба зафиксирована, меры приняты'}
        />
      )}
    </div>
  );
}

// Points at whichever date/shift draft the manager is actively working on.
// "today" flips at midnight, but an evening shift that started before 00:00
// may still be in progress after — this lets restore find the right draft
// even when the page reloads on the other side of that boundary.
function activePtrKey(tenant: string) {
  return `mgr_active_draft_${tenant}`;
}

function draftKeyFor(tenant: string, date: string, shift: string) {
  return `mgr_draft_${tenant}_${date}_${shift}`;
}

// Drafts saved before ShiftFeedback had a stable `id` may have rows without
// one — backfill so id-based matching (updateGood/removeGood/etc.) works.
function withFeedbackIds(f: FormState): FormState {
  const fill = (list: ShiftFeedback[]) =>
    list.map(x => x.id ? x : { ...x, id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}` });
  return { ...f, good_feedbacks: fill(f.good_feedbacks ?? []), bad_feedbacks: fill(f.bad_feedbacks ?? []) };
}

function loadInitialForm(tenant: string): { form: FormState; restored: boolean } {
  const empty = makeEmpty(tenant);

  // 1. Prefer the last actively-worked draft, regardless of what "today" is now.
  try {
    const ptrRaw = localStorage.getItem(activePtrKey(tenant));
    if (ptrRaw) {
      const ptr = JSON.parse(ptrRaw) as { date: string; shift: FormState['shift'] };
      const saved = localStorage.getItem(draftKeyFor(tenant, ptr.date, ptr.shift));
      if (saved) return { form: withFeedbackIds({ ...empty, ...JSON.parse(saved), date: ptr.date, shift: ptr.shift }), restored: true };
    }
  } catch {}

  // 2. Fall back to today's draft (first run / pointer stale or missing).
  const todayKey = draftKeyFor(tenant, empty.date, empty.shift);
  try {
    const saved = localStorage.getItem(todayKey);
    if (saved) return { form: withFeedbackIds({ ...empty, ...JSON.parse(saved) }), restored: true };
    // Migrate draft saved under old key (benedictnukus → benedict-nukus)
    const oldKey = todayKey.replace('benedict-nukus', 'benedictnukus');
    const oldSaved = oldKey !== todayKey ? localStorage.getItem(oldKey) : null;
    if (oldSaved) {
      localStorage.setItem(todayKey, oldSaved);
      localStorage.removeItem(oldKey);
      return { form: withFeedbackIds({ ...empty, ...JSON.parse(oldSaved) }), restored: true };
    }
  } catch {}

  return { form: empty, restored: false };
}

/* ─── Report form ─── */
function ReportForm({ onDone }: { onDone: () => void }) {
  const tenant = getTenant();
  const branch = getTenantBranch(tenant);

  const [initial] = useState(() => loadInitialForm(tenant));
  const [form, setForm] = useState<FormState>(initial.form);
  const [draftRestored, setDraftRestored] = useState(initial.restored);
  // Reactive draft key — updates when manager changes date or shift
  const draftKey = draftKeyFor(tenant, form.date, form.shift);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<DailySnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [shiftTables, setShiftTables] = useState<ShiftTable[]>([]);
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; });

  // Auto-fetch weather (used for evening shift or when no snapshot)
  useEffect(() => {
    if (form.shift === 'morning' && snapshot) return;
    setWeatherLoading(true);
    fetchWeather(branch)
      .then(w => { if (w) set({ weather: w }); })
      .catch(() => {})
      .finally(() => setWeatherLoading(false));
  }, [form.shift, snapshot]);

  // Load daily snapshot for both shifts
  useEffect(() => {
    setSnapshotLoading(true);
    fetchDailySnapshot(tenant, form.date)
      .then(snap => {
        setSnapshot(snap);
        if (snap) {
          setForm(f => {
            const weather = branch === 'Нукус' ? snap.weather_nukus : snap.weather_mirabad;
            const patch: Partial<FormState> = {};
            if (!f.weather      && weather)                        patch.weather      = weather;
            if (!f.guests_count && snap.guest_count != null)       patch.guests_count = String(snap.guest_count);
            if (!f.cash_total   && snap.cash_total  != null)       patch.cash_total   = String(snap.cash_total);
            if (!f.avg_check    && snap.avg_check   != null)       patch.avg_check    = String(snap.avg_check);
            if (!Object.keys(patch).length) return f;
            const next = { ...f, ...patch };
            saveDraft(next);
            return next;
          });
        }
      })
      .catch(() => {})
      .finally(() => setSnapshotLoading(false));
  }, [form.shift, form.date]);

  // Live tables opened by the plugin during this shift — polled so the
  // checklist below stays current without a page reload. Also seeds the
  // manager's name from whoever's actually logged into the terminal.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetchShiftTables(tenant, form.date, form.shift).then(res => {
        if (cancelled) return;
        setShiftTables(res.tables);
        if (res.managerName) {
          setForm(f => {
            if (f.manager_name.trim()) return f;
            const next = { ...f, manager_name: res.managerName! };
            saveDraft(next);
            return next;
          });
        }
      });
    };
    poll();
    const interval = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [tenant, form.date, form.shift]);

  const saveDraft = (f: FormState) => {
    const key = draftKeyFor(tenant, f.date, f.shift);
    try {
      localStorage.setItem(key, JSON.stringify(f));
      localStorage.setItem(activePtrKey(tenant), JSON.stringify({ date: f.date, shift: f.shift }));
    } catch {
      // Quota exceeded — drop only drafts older than 2 days (never a same-day
      // draft from another shift/tenant on this device) and retry once
      try {
        const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
        Object.keys(localStorage)
          .filter(k => {
            if (!k.startsWith('mgr_draft_') || k === key) return false;
            const m = k.match(/_(\d{4}-\d{2}-\d{2})_(morning|evening)$/);
            return !m || new Date(m[1]).getTime() < cutoff;
          })
          .forEach(k => localStorage.removeItem(k));
        localStorage.setItem(key, JSON.stringify(f));
        localStorage.setItem(activePtrKey(tenant), JSON.stringify({ date: f.date, shift: f.shift }));
      } catch {}
    }
  };

  // Save synchronously on every change — localStorage.setItem on this small
  // object is sub-millisecond, so there's no need to debounce. A debounce
  // window left a gap where backgrounding the PWA (iOS pagehide/beforeunload
  // fire unreliably) could drop the last edits.
  //
  // All mutations go through this functional updater (never reading `form`
  // directly) so a late-resolving async callback — e.g. a photo upload that
  // finishes after the manager added another row — merges into the LATEST
  // state instead of overwriting the array with a stale snapshot.
  const update = (fn: (f: FormState) => FormState) => setForm(f => {
    const next = fn(f);
    saveDraft(next);
    return next;
  });

  const set = (patch: Partial<FormState>) => update(f => ({ ...f, ...patch }));

  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`);

  const normTable = (t: string) => t.trim().toLowerCase();
  // Matched by the "table · time" label, not the bare table number — a
  // table that turns over twice in one shift is two separate seatings, and
  // a review for the 10am party shouldn't mark the 1pm party as covered.
  const coveredTables = new Set(
    [...form.good_feedbacks, ...form.bad_feedbacks].map(fb => normTable(fb.table)).filter(Boolean)
  );
  // Submit silently drops any row whose note was never typed (see submit()
  // below) — so the progress counter has to require a note too, or it shows
  // e.g. "12/12" while the report that actually gets sent only covers 8.
  const notedTables = new Set(
    [...form.good_feedbacks, ...form.bad_feedbacks].filter(fb => fb.note.trim()).map(fb => normTable(fb.table)).filter(Boolean)
  );

  // Tapping a table from the live checklist below prefills a feedback row
  // instead of the manager typing the table number by hand. No-op if that
  // specific seating already has a row, so repeated taps can't duplicate it.
  const addTableFeedback = (t: ShiftTable, type: 'good' | 'bad') => {
    if (coveredTables.has(normTable(t.label))) return;
    if (type === 'good') update(f => ({ ...f, good_feedbacks: [...f.good_feedbacks, { id: newId(), table: t.label, note: '' }] }));
    else update(f => ({ ...f, bad_feedbacks: [...f.bad_feedbacks, { id: newId(), table: t.label, note: '' }] }));
  };

  // Matched by stable id, not array index — deleting one row can no longer
  // make an in-flight photo upload for another row land on the wrong item.
  const updateGood = (id: string, v: ShiftFeedback) =>
    update(f => ({ ...f, good_feedbacks: f.good_feedbacks.map(x => x.id === id ? v : x) }));
  const updateBad = (id: string, v: ShiftFeedback) =>
    update(f => ({ ...f, bad_feedbacks: f.bad_feedbacks.map(x => x.id === id ? v : x) }));

  const removeGood = (id: string) => update(f => ({ ...f, good_feedbacks: f.good_feedbacks.filter(x => x.id !== id) }));
  const removeBad  = (id: string) => update(f => ({ ...f, bad_feedbacks:  f.bad_feedbacks.filter(x => x.id !== id) }));

  // Moves a row between the good/bad lists — fixes an accidental tap on the
  // wrong good/bad button in the live table checklist without losing the
  // table number or note already entered.
  const swapToBad = (id: string) => update(f => {
    const fb = f.good_feedbacks.find(x => x.id === id);
    if (!fb) return f;
    return { ...f, good_feedbacks: f.good_feedbacks.filter(x => x.id !== id), bad_feedbacks: [...f.bad_feedbacks, fb] };
  });
  const swapToGood = (id: string) => update(f => {
    const fb = f.bad_feedbacks.find(x => x.id === id);
    if (!fb) return f;
    return { ...f, bad_feedbacks: f.bad_feedbacks.filter(x => x.id !== id), good_feedbacks: [...f.good_feedbacks, fb] };
  });

  const findFeedback = (t: ShiftTable): { item: ShiftFeedback; type: 'good' | 'bad' } | null => {
    const key = normTable(t.label);
    const g = form.good_feedbacks.find(fb => normTable(fb.table) === key);
    if (g) return { item: g, type: 'good' };
    const b = form.bad_feedbacks.find(fb => normTable(fb.table) === key);
    if (b) return { item: b, type: 'bad' };
    return null;
  };

  // Creates a fresh row on first choice, or moves the existing one over if
  // re-choosing a different type — re-choosing the SAME type is a no-op.
  const chooseFeedback = (t: ShiftTable, entry: { item: ShiftFeedback; type: 'good' | 'bad' } | null, type: 'good' | 'bad') => {
    if (!entry) { addTableFeedback(t, type); return; }
    if (entry.type === type) return;
    if (type === 'bad') swapToBad(entry.item.id); else swapToGood(entry.item.id);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // A tapped ✓/✗ with no note ever typed shouldn't block sending the whole
    // report — drop it silently instead of erroring (nothing useful to show
    // in the report anyway with a blank note).
    const goodFeedbacks = form.good_feedbacks.filter(f => f.note.trim());
    const badFeedbacks  = form.bad_feedbacks.filter(f => f.note.trim());
    setSubmitting(true);
    setError('');
    try {
      await managerShiftReportCreate(tenant, {
        ...form,
        good_feedbacks: goodFeedbacks,
        bad_feedbacks:  badFeedbacks,
        status:       (badFeedbacks.length > 3 || badFeedbacks.length > goodFeedbacks.length) ? 'bad' : 'good',
        cash_total:   form.cash_total   ? parseInt(form.cash_total.replace(/[\s,.]/g, ''), 10)   : null,
        guests_count: form.guests_count ? parseInt(form.guests_count.replace(/[\s,.]/g, ''), 10) : null,
        avg_check:    form.avg_check    ? parseInt(form.avg_check.replace(/[\s,.]/g, ''), 10)    : null,
        prev_manager: form.prev_manager || null,
        weather:      form.weather || null,
      } as any);
      localStorage.removeItem(draftKeyFor(tenant, form.date, form.shift));
      try {
        const ptrRaw = localStorage.getItem(activePtrKey(tenant));
        if (ptrRaw) {
          const ptr = JSON.parse(ptrRaw);
          if (ptr.date === form.date && ptr.shift === form.shift) localStorage.removeItem(activePtrKey(tenant));
        }
      } catch {}
      onDone();
    } catch {
      setError('Ошибка при сохранении. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-6 pb-12 px-4">
      <div className="max-w-[580px] mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-[#141414] border border-[#222] overflow-hidden flex-shrink-0">
            <img src="/trace-logo.png" alt="TRACE" className="w-full h-full object-cover"
              onError={e => { e.currentTarget.style.display = 'none'; }} />
          </div>
          <div>
            <p className="text-[15px] font-bold text-white">Benedict — Отчёт по смене</p>
            <p className="text-[11px] text-[#9a9a9a] uppercase tracking-[0.12em]">Менеджер портал</p>
          </div>
        </div>

        {/* Description */}
        <div className="bg-[#3d9eff]/5 border border-[#3d9eff]/15 rounded-2xl px-4 py-3 mb-5">
          <p className="text-[13px] text-[#aaa] leading-relaxed">
            Заполняйте в конце смены до передачи поста{' '}
            <span className="text-white font-medium">(не позднее 15 мин)</span>.
          </p>
        </div>

        {/* Draft restored banner */}
        {draftRestored && (
          <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/25 rounded-2xl px-4 py-2.5 mb-4">
            <p className="text-[13px] text-emerald-400">Черновик восстановлен</p>
            <button type="button" onClick={() => {
              setForm(makeEmpty(tenant));
              localStorage.removeItem(draftKey);
              try {
                const ptrRaw = localStorage.getItem(activePtrKey(tenant));
                if (ptrRaw) {
                  const ptr = JSON.parse(ptrRaw);
                  if (ptr.date === form.date && ptr.shift === form.shift) localStorage.removeItem(activePtrKey(tenant));
                }
              } catch {}
              setDraftRestored(false);
            }}
              className="text-[11px] text-[#9a9a9a] hover:text-white transition-colors touch-manipulation">
              Очистить
            </button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">

          {/* ── 1. Основное ── */}
          <div className="bg-[#141414] border border-[#222] rounded-2xl p-4 space-y-4">
            <SectionTitle>Основная информация</SectionTitle>

            {/* Branch pill */}
            <div className="flex items-center gap-2">
              <MapPin size={11} className="text-[#3d9eff]" />
              <span className="text-[13px] text-[#3d9eff] font-semibold">{branch}</span>
            </div>

            {/* Shift — tap buttons */}
            <div>
              <label className={labelCls}>Смена</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => set({ shift: 'morning' })}
                  className={`py-3.5 rounded-xl text-[14px] font-semibold transition-colors touch-manipulation ${form.shift === 'morning' ? 'bg-[#3d9eff] text-white' : 'bg-[#0a0a0a] border border-[#2a2a2a] text-[#9a9a9a]'}`}>
                  Утро
                </button>
                <button type="button" onClick={() => set({ shift: 'evening' })}
                  className={`py-3.5 rounded-xl text-[14px] font-semibold transition-colors touch-manipulation ${form.shift === 'evening' ? 'bg-[#3d9eff] text-white' : 'bg-[#0a0a0a] border border-[#2a2a2a] text-[#9a9a9a]'}`}>
                  Вечер
                </button>
              </div>
              <p className="text-[11px] text-[#8a8a8a] mt-1.5 px-1">
                {form.shift === 'morning' ? '07:30 – 15:30' : '15:30 – 00:00'}
              </p>
            </div>

            <div>
              <label className={labelCls}>Ваше имя</label>
              <input type="text" value={form.manager_name} onChange={e => set({ manager_name: e.target.value })}
                placeholder="Имя Фамилия" required className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Дата</label>
              <input type="date" value={form.date} onChange={e => set({ date: e.target.value })} required
                className={inputCls} style={{ colorScheme: 'dark' }} />
            </div>

            {form.shift === 'evening' && (
              <div>
                <label className={labelCls}><UserCheck size={10} className="inline mr-1" />Смену принял у</label>
                <input type="text" value={form.prev_manager} onChange={e => set({ prev_manager: e.target.value })}
                  placeholder="Имя утреннего менеджера" className={inputCls} />
              </div>
            )}
          </div>

          {/* ── 2. Показатели ── */}
          <div className="bg-[#141414] border border-[#222] rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <SectionTitle>Показатели смены</SectionTitle>
              {snapshotLoading && (
                <span className="flex items-center gap-1.5 text-[11px] text-[#3d9eff] mb-4">
                  <span className="w-3 h-3 border border-[#3d9eff]/40 border-t-[#3d9eff] rounded-full animate-spin" />
                  Загрузка...
                </span>
              )}
              {snapshot && !snapshotLoading && (
                <span className="text-[11px] text-emerald-400 mb-4">✓ Из TRACE</span>
              )}
            </div>

            {snapshot && form.shift === 'morning' ? (
              // Read-only snapshot for morning shift
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <CloudSun size={11} />, label: 'Погода', value: (branch === 'Нукус' ? snapshot.weather_nukus : snapshot.weather_mirabad) ?? '—' },
                  { icon: <Users size={11} />, label: 'Гостей', value: snapshot.guest_count != null ? String(snapshot.guest_count) : '—' },
                  { icon: <CreditCard size={11} />, label: 'Касса (сум)', value: snapshot.cash_total != null ? Number(snapshot.cash_total).toLocaleString() : '—' },
                  { label: 'Средний чек', value: snapshot.avg_check != null ? Number(snapshot.avg_check).toLocaleString() : '—' },
                ].map(f => (
                  <div key={f.label}>
                    <label className={labelCls}>{f.icon && <span className="inline mr-1">{f.icon}</span>}{f.label}</label>
                    <div className="w-full bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl px-3.5 py-3.5 text-[#3d9eff] text-base font-medium">
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Editable fields for evening shift or when no snapshot
              <>
                <div>
                  <label className={labelCls}><CloudSun size={10} className="inline mr-1" />Погода</label>
                  <div className="relative">
                    <input type="text" value={weatherLoading ? '' : form.weather}
                      onChange={e => set({ weather: e.target.value })}
                      placeholder={weatherLoading ? 'Загрузка...' : '+32°C, ясно'}
                      className={inputCls + (weatherLoading ? ' opacity-50' : '')} />
                    {weatherLoading && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border border-[#3d9eff]/40 border-t-[#3d9eff] rounded-full animate-spin" />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}><Users size={10} className="inline mr-1" />Гостей</label>
                    <input type="number" inputMode="numeric" value={form.guests_count} onChange={e => set({ guests_count: e.target.value })}
                      placeholder="196" min={0} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}><CreditCard size={10} className="inline mr-1" />Касса (сум)</label>
                    <input type="text" inputMode="numeric" value={form.cash_total} onChange={e => set({ cash_total: e.target.value })}
                      placeholder="45 146 500" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Средний чек (сум)</label>
                  <input type="text" inputMode="numeric" value={form.avg_check} onChange={e => set({ avg_check: e.target.value })}
                    placeholder="317 933" className={inputCls} />
                </div>
              </>
            )}
          </div>

          {/* ── 2.5 Столы смены (живые, от плагина) — отзыв заполняется прямо здесь ── */}
          {shiftTables.length > 0 && (() => {
            const pending = shiftTables.filter(t => t.needsAttention && !coveredTables.has(normTable(t.label)));
            return (
            <div className="bg-[#141414] border border-[#222] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <SectionTitle>Столы смены</SectionTitle>
                {pending.length > 0 && (
                  <span className="text-[11px] font-semibold text-red-400 mb-4">
                    {pending.length} ждут визита 25+ мин
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {shiftTables.map(t => {
                  const entry = findFeedback(t);
                  const flagged = t.needsAttention && !entry;
                  return (
                    <TableRow
                      key={t.orderId}
                      t={t}
                      entry={entry}
                      flagged={flagged}
                      onChoose={type => chooseFeedback(t, entry, type)}
                      onChange={v => entry && (entry.type === 'good' ? updateGood(entry.item.id!, v) : updateBad(entry.item.id!, v))}
                      onRemove={() => entry && (entry.type === 'good' ? removeGood(entry.item.id!) : removeBad(entry.item.id!))}
                      onSave={() => { const f = formRef.current; localStorage.setItem(draftKeyFor(tenant, f.date, f.shift), JSON.stringify(f)); }}
                    />
                  );
                })}
              </div>
              {(() => {
                const covered = shiftTables.filter(t => notedTables.has(normTable(t.label))).length;
                const left = shiftTables.length - covered;
                return (
                  <p className={`text-[11px] px-1 ${left > 0 ? 'text-red-400 font-medium' : 'text-[#7a7a7a]'}`}>
                    {covered} из {shiftTables.length} посадок с отзывом{left > 0 ? ` · осталось ${left}` : ''}
                  </p>
                );
              })()}
            </div>
            );
          })()}

          {/* ── 5. Комментарий ── */}
          <div className="bg-[#141414] border border-[#222] rounded-2xl p-4">
            <SectionTitle>Комментарий по смене</SectionTitle>
            <textarea
              value={form.report_text}
              onChange={e => set({ report_text: e.target.value })}
              placeholder="Загруженность, команда, кухня, бар, нестандартные ситуации..."
              rows={5}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-3.5 py-3.5 text-white text-base focus:border-[#3d9eff] focus:outline-none resize-none leading-relaxed placeholder:text-[#7a7a7a] touch-manipulation"
            />
          </div>

          {error && <p className="text-[13px] text-red-400 px-1">{error}</p>}

          <button type="submit" disabled={submitting || !form.manager_name}
            className="w-full bg-[#3d9eff] active:bg-[#2d8ef0] text-white font-semibold py-4 rounded-2xl text-[15px] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation">
            {submitting
              ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><ClipboardList size={16} /> Отправить отчёт</>}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Success ─── */
function SuccessScreen({ onNew }: { onNew: () => void }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="text-center max-w-[300px]">
        <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={28} className="text-emerald-400" />
        </div>
        <h2 className="text-[20px] font-bold text-white mb-2">Отчёт сохранён</h2>
        <p className="text-[13px] text-[#9a9a9a] mb-8">Руководство уже видит ваш отчёт в системе.</p>
        <button onClick={onNew}
          className="px-6 py-2.5 bg-[#141414] border border-[#222] text-[#888] hover:text-white hover:border-[#7a7a7a] rounded-lg text-[12px] font-medium transition-colors">
          Добавить ещё отчёт
        </button>
      </div>
    </div>
  );
}

/* ─── Root ─── */
export const ManagerPortal: React.FC = () => {
  const [done, setDone] = useState(false);

  if (done) return <SuccessScreen onNew={() => setDone(false)} />;
  return <ReportForm onDone={() => setDone(true)} />;
};
