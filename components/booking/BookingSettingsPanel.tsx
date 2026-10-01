import React, { useEffect, useState } from 'react';
import { Loader2, Save, Copy, Check, ExternalLink } from 'lucide-react';
import { Language } from '../../types';
import { bookingApi, BookingSettings, BookingWeekday, getSubdomain, BranchSummary, getActiveBranchId, traceApi } from '../../services/traceApi';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

const DAYS: Array<[BookingWeekday, [string, string, string]]> = [
  ['mon', ['Пн', 'Mon', 'Du']], ['tue', ['Вт', 'Tue', 'Se']], ['wed', ['Ср', 'Wed', 'Ch']], ['thu', ['Чт', 'Thu', 'Pa']],
  ['fri', ['Пт', 'Fri', 'Ju']], ['sat', ['Сб', 'Sat', 'Sh']], ['sun', ['Вс', 'Sun', 'Ya']],
];

type Toast = (message: string, type: 'success' | 'error' | 'info') => void;

const inputCls = 'bg-background border border-border rounded-lg px-2.5 py-2 text-text text-[13px] focus:border-primary focus:outline-none';

// Owner/manager booking settings, including the switch that opens the public
// guest page and the link to share with guests.
export function BookingSettingsPanel({ lang, onShowToast }: { lang: Language; onShowToast: Toast }) {
  const [s, setS] = useState<BookingSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [branch, setBranch] = useState<BranchSummary | null>(null);

  useEffect(() => {
    bookingApi.settings.get().then(setS).catch(e => onShowToast((e as Error).message, 'error'));
    // The branch switcher only re-points API calls; the link must name the branch actually being edited.
    traceApi.org.branches().then(list => {
      const id = getActiveBranchId();
      setBranch(list.find(b => b.id === id) ?? list.find(b => b.subdomain === getSubdomain()) ?? null);
    }).catch(() => {});
  }, []);

  if (!s) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted" size={22} /></div>;

  const set = (patch: Partial<BookingSettings>) => { setS({ ...s, ...patch }); setDirty(true); };
  const hoursOn = Object.keys(s.working_hours ?? {}).length > 0;
  const subdomain = branch?.subdomain ?? getSubdomain();
  const link = `https://book.trace-os.uz/${subdomain}`;

  const setDay = (day: BookingWeekday, v: { open: string; close: string } | null) =>
    set({ working_hours: { ...s.working_hours, [day]: v } });

  const save = async () => {
    setSaving(true);
    try {
      const { tenant_id: _t, ...patch } = s;
      setS(await bookingApi.settings.save(patch));
      setDirty(false);
      onShowToast(tr(lang, 'Настройки сохранены', 'Settings saved', 'Sozlamalar saqlandi'), 'success');
    } catch (e) {
      onShowToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const num = (label: string, value: number, key: keyof BookingSettings, min: number, max: number, suffix?: string) => (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-[13px] text-text">{label}</span>
      <span className="flex items-center gap-1.5">
        <input type="number" min={min} max={max} value={value}
          onChange={e => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) set({ [key]: Math.min(max, Math.max(min, n)) } as Partial<BookingSettings>); }}
          className={`${inputCls} w-20 text-right`} />
        {suffix && <span className="text-[12px] text-muted w-10">{suffix}</span>}
      </span>
    </label>
  );
  const min = tr(lang, 'мин', 'min', 'daq');

  return (
    <div className="space-y-4 max-w-[720px]">
      {/* Guest page switch + link */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span>
            <span className="block text-[14px] font-semibold text-text">{tr(lang, 'Онлайн-бронирование для гостей', 'Online booking for guests', 'Mehmonlar uchun onlayn band qilish')}</span>
            <span className="block text-[12px] text-muted">{tr(lang, 'Гости видят схему зала и бронируют стол сами', 'Guests see the floor plan and book a table themselves', "Mehmonlar zal sxemasini ko'rib, stolni o'zlari band qiladi")}</span>
          </span>
          <input type="checkbox" checked={s.enabled} onChange={e => set({ enabled: e.target.checked })} className="w-5 h-5 accent-primary" />
        </label>
        <div className="flex gap-2">
          <input readOnly value={link} onFocus={e => e.currentTarget.select()} className={`${inputCls} flex-1 min-w-0`} />
          <button onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } }}
            className="px-3 rounded-lg border border-border text-[12px] flex items-center gap-1 text-text">{copied ? <Check size={13} /> : <Copy size={13} />}</button>
          <a href={link} target="_blank" rel="noopener noreferrer" className="px-3 rounded-lg border border-border text-[12px] flex items-center text-text"><ExternalLink size={13} /></a>
        </div>
        {!s.enabled && <p className="text-[12px] text-amber-500">{tr(lang, 'Пока выключено — по ссылке гости увидят «бронирование выключено».', 'Off for now — guests opening the link will see "booking is off".', "Hozircha o'chirilgan — havolani ochgan mehmonlar «band qilish o'chirilgan» ni ko'radi.")}</p>}
      </div>

      {/* Hours */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-[14px] font-semibold text-text mb-1">{tr(lang, 'Часы приёма броней', 'Booking hours', 'Band qilish soatlari')}</p>
        <p className="text-[12px] text-muted mb-3">{hoursOn
          ? tr(lang, 'Если закрытие раньше открытия — значит после полуночи (например 10:00–02:00).', 'A close earlier than open means past midnight (e.g. 10:00–02:00).', "Yopilish ochilishdan oldin bo'lsa — yarim tundan keyin (masalan 10:00–02:00).")
          : tr(lang, 'Не заданы — гостям показывается 10:00–23:00 каждый день.', 'Not set — guests see 10:00–23:00 every day.', "Belgilanmagan — mehmonlarga har kuni 10:00–23:00 ko'rsatiladi.")}</p>
        <div className="space-y-1.5">
          {DAYS.map(([day, labels]) => {
            const v = s.working_hours?.[day] ?? null;
            const open = hoursOn ? !!v : true;
            const cur = v ?? { open: '10:00', close: '23:00' };
            return (
              <div key={day} className="flex items-center gap-2">
                <label className="flex items-center gap-2 w-20 cursor-pointer">
                  <input type="checkbox" checked={open} className="accent-primary"
                    onChange={e => {
                      // First edit turns "not set" into explicit hours for every day.
                      const base = hoursOn ? s.working_hours : Object.fromEntries(DAYS.map(([d]) => [d, { open: '10:00', close: '23:00' }]));
                      set({ working_hours: { ...base, [day]: e.target.checked ? cur : null } });
                    }} />
                  <span className="text-[13px] text-text">{tr(lang, ...labels)}</span>
                </label>
                {open ? (
                  <>
                    <input type="time" value={cur.open} onChange={e => setDay(day, { ...cur, open: e.target.value })} className={inputCls} />
                    <span className="text-muted">—</span>
                    <input type="time" value={cur.close} onChange={e => setDay(day, { ...cur, close: e.target.value })} className={inputCls} />
                  </>
                ) : <span className="text-[12px] text-muted">{tr(lang, 'не принимаем', 'closed', 'qabul qilinmaydi')}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Rules */}
      <div className="rounded-2xl border border-border bg-card p-4 divide-y divide-border">
        {num(tr(lang, 'Длительность брони', 'Booking length', 'Bron davomiyligi'), s.default_duration_min, 'default_duration_min', 15, 720, min)}
        {num(tr(lang, 'Уборка между бронями', 'Cleanup between bookings', 'Bronlar orasida tozalash'), s.buffer_min, 'buffer_min', 0, 120, min)}
        <label className="flex items-center justify-between gap-3 py-2">
          <span className="text-[13px] text-text">{tr(lang, 'Шаг времени', 'Time step', 'Vaqt qadami')}</span>
          <select value={s.slot_step_min} onChange={e => set({ slot_step_min: Number(e.target.value) as 15 | 30 })} className={inputCls}>
            <option value={15}>15 {min}</option>
            <option value={30}>30 {min}</option>
          </select>
        </label>
        {num(tr(lang, 'Бронировать не позже чем за', 'Book at least', 'Kamida oldin band qilish'), s.min_lead_min, 'min_lead_min', 0, 10080, min)}
        {num(tr(lang, 'Максимум дней вперёд', 'Max days ahead', 'Oldinga maksimal kun'), s.max_days_ahead, 'max_days_ahead', 1, 365, tr(lang, 'дн', 'days', 'kun'))}
        {num(tr(lang, 'Активных броней на один телефон', 'Active bookings per phone', 'Bitta telefonga faol bronlar'), s.max_active_per_phone, 'max_active_per_phone', 1, 50)}
        <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
          <span>
            <span className="block text-[13px] text-text">{tr(lang, 'Подтверждать автоматически', 'Confirm automatically', 'Avtomatik tasdiqlash')}</span>
            <span className="block text-[12px] text-muted">{tr(lang, 'Выключите, если хостес должна подтверждать каждую онлайн-бронь', 'Turn off if the hostess should confirm each online booking', "Xostes har bir onlayn bronni tasdiqlashi kerak bo'lsa, o'chiring")}</span>
          </span>
          <input type="checkbox" checked={s.auto_confirm} onChange={e => set({ auto_confirm: e.target.checked })} className="w-5 h-5 accent-primary" />
        </label>
      </div>

      <button onClick={save} disabled={!dirty || saving}
        className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white text-[13px] font-semibold disabled:opacity-40">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        {tr(lang, 'Сохранить', 'Save', 'Saqlash')}
      </button>
    </div>
  );
}
