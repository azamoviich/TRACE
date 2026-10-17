// Настройки — redesigned per TRACE-mockups/owner/settings.js S.settings
// (styles/rd/more.css): language, theme, accent and logo, visible sections
// and start page, alert thresholds, Telegram and report subscriptions, the
// desktop app, help.
import React, { useEffect, useRef, useState } from 'react';
import { Language, ViewState } from '../../types';
import { traceApi, isDemoTenant, ReportSubscription, ReportType, ReportChannel, TelegramStatus, AlertThresholds, uploadPhoto, getSubdomain, downloadUrl } from '../../services/traceApi';
import { TRANSLATIONS, tr } from '../../constants';
import { NAV_ITEMS, HIDEABLE_PAGE_IDS, DEFAULT_PAGE_CHOICES, ACCENT_SWATCHES } from '../navConfig';

const NEW_PREFIX = 'new-';

function blankSubscription(channel: ReportChannel): ReportSubscription {
  return { id: `${NEW_PREFIX}${Date.now()}`, channel, email: '', report_type: 'daily_summary', frequency: 'daily', send_hour: 23, enabled: true, last_sent_at: null };
}

// Demo tenant: two sample subscriptions, edits stay in memory.
const DEMO_SUBS: ReportSubscription[] = [
  { id: 'demo-1', channel: 'telegram', email: null, report_type: 'daily_summary', frequency: 'daily', send_hour: 23, enabled: true, last_sent_at: null },
  { id: 'demo-2', channel: 'email', email: 'owner@demo.uz', report_type: 'weekly_summary', frequency: 'weekly', send_hour: 9, enabled: true, last_sent_at: null },
];

const LANGS: { v: Language; label: string }[] = [{ v: 'ru', label: 'Русский' }, { v: 'uz', label: 'O‘zbekcha' }, { v: 'en', label: 'English' }];

export const Settings: React.FC<{
  lang: Language;
  setLang: (l: Language) => void;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  onLogout?: () => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  hiddenPages: ViewState[];
  // Pages the tenant doesn't have (add-on off, POS without plan/fact) — not
  // listed here at all, since showing or hiding them isn't the user's call.
  unavailablePages: ViewState[];
  setHiddenPages: (pages: ViewState[]) => void;
  defaultPage: ViewState;
  setDefaultPage: (p: ViewState) => void;
  accent: string;
  setAccent: (rgb: string) => void;
  logoUrl: string | null;
  setLogoUrl: (url: string | null) => void;
}> = ({
  lang, setLang, onShowToast, onLogout, theme, setTheme,
  hiddenPages, unavailablePages, setHiddenPages, defaultPage, setDefaultPage, accent, setAccent, logoUrl, setLogoUrl,
}) => {
  const T = (ru: string, en: string, uz: string) => tr(lang, ru, en, uz);
  const t = TRANSLATIONS[lang];
  const demo = isDemoTenant();
  // Which download to highlight and which install warning to explain.
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

  // Report subscriptions (email + telegram) and the tenant's one shared
  // Telegram connection they all ride on.
  const [subs, setSubs] = useState<ReportSubscription[]>(demo ? DEMO_SUBS : []);
  const [editing, setEditing] = useState<string | null>(null);
  const [telegram, setTelegram] = useState<TelegramStatus | null>(demo ? { connected: true, deep_link: null } : null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [thresholds, setThresholds] = useState<AlertThresholds | null>(null);
  const saveTimer = useRef<number | null>(null);

  // The "financial_summary" scheduled report calls computeDailyPL on the
  // backend, which is 100% iiko-only — for Poster it returns null and the
  // cron sender just logs a warning and skips silently (cron/reports.ts),
  // so a Poster tenant subscribing to it would never get an error AND
  // never get a report, forever. Hide the option until a Poster-backed
  // financial summary exists.
  const [isPoster, setIsPoster] = useState(false);
  useEffect(() => { traceApi.sales.status().then(s => setIsPoster(!!s.poster)).catch(() => {}); }, []);
  useEffect(() => { traceApi.settings.alertThresholds().then(setThresholds).catch(() => {}); }, []);

  // Merges freshly-fetched (persisted) subscriptions with any not-yet-saved
  // local rows, so refetching never wipes a subscription the user is still
  // filling in — a `focus` refetch used to blow away unsaved rows entirely.
  const refetchSubs = () => {
    if (demo) return;
    traceApi.settings.listReportSubscriptions()
      .then(fetched => setSubs(prev => [...fetched, ...prev.filter(s => s.id.startsWith(NEW_PREFIX))]))
      .catch(() => {});
  };
  const refetchTelegram = () => {
    if (demo) return;
    traceApi.settings.telegramStatus().then(setTelegram).catch(() => {});
  };
  useEffect(() => {
    refetchSubs();
    refetchTelegram();
    // Picks up the Telegram link once the user comes back from pressing
    // "Start" in the bot — that happens in another tab/app, not a click here.
    window.addEventListener('focus', refetchTelegram);
    return () => window.removeEventListener('focus', refetchTelegram);
  }, []);

  const setBusy = (id: string, busy: boolean) => setBusyIds(prev => { const n = new Set(prev); if (busy) n.add(id); else n.delete(id); return n; });
  const updateSub = (id: string, patch: Partial<ReportSubscription>) => setSubs(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const failed = (ru: string, en: string, uz: string) => onShowToast?.(T(ru, en, uz), 'error');

  const saveSub = async (sub: ReportSubscription) => {
    if (sub.channel === 'email' && !sub.email) return;
    if (demo) { setSubs(prev => prev.map(s => s.id === sub.id ? { ...sub, id: s.id.startsWith(NEW_PREFIX) ? `demo-${Date.now()}` : s.id } : s)); setEditing(null); onShowToast?.(t.report_subscription_saved, 'success'); return; }
    setBusy(sub.id, true);
    try {
      if (sub.id.startsWith(NEW_PREFIX)) {
        const created = await traceApi.settings.createReportSubscription({
          channel: sub.channel, email: sub.channel === 'email' ? sub.email ?? undefined : undefined,
          report_type: sub.report_type, frequency: sub.frequency, send_hour: sub.send_hour, enabled: sub.enabled,
        });
        setSubs(prev => prev.map(s => s.id === sub.id ? created : s));
      } else {
        const updated = await traceApi.settings.updateReportSubscription(sub.id, {
          email: sub.channel === 'email' ? sub.email ?? undefined : undefined,
          frequency: sub.frequency, send_hour: sub.send_hour, enabled: sub.enabled,
        });
        setSubs(prev => prev.map(s => s.id === sub.id ? updated : s));
      }
      setEditing(null);
      onShowToast?.(t.report_subscription_saved, 'success');
    } catch {
      failed('Не удалось сохранить', "Couldn't save", "Saqlab bo'lmadi");
    } finally {
      setBusy(sub.id, false);
    }
  };

  const deleteSub = async (sub: ReportSubscription) => {
    if (sub.id.startsWith(NEW_PREFIX) || demo) { setSubs(prev => prev.filter(s => s.id !== sub.id)); setEditing(null); return; }
    setBusy(sub.id, true);
    try {
      await traceApi.settings.deleteReportSubscription(sub.id);
      setSubs(prev => prev.filter(s => s.id !== sub.id));
      setEditing(null);
    } catch {
      failed('Не удалось удалить', "Couldn't delete", "O'chirib bo'lmadi");
    } finally {
      setBusy(sub.id, false);
    }
  };

  const sendTest = async (sub: ReportSubscription) => {
    if (sub.channel === 'email' && !sub.email) return;
    if (sub.channel === 'telegram' && !telegram?.connected) return;
    if (demo) { onShowToast?.(t.test_email_sent, 'success'); return; }
    setBusy(sub.id, true);
    try {
      const res = await traceApi.settings.sendTestReport({ channel: sub.channel, email: sub.email, report_type: sub.report_type });
      if (res.ok) onShowToast?.(t.test_email_sent, 'success');
      else onShowToast?.(res.error ?? T('Не удалось отправить', "Couldn't send", "Yuborib bo'lmadi"), 'error');
    } catch {
      failed('Не удалось отправить', "Couldn't send", "Yuborib bo'lmadi");
    } finally {
      setBusy(sub.id, false);
    }
  };

  const connectTelegram = async (relink: boolean) => {
    if (demo) { onShowToast?.(T('В демо Telegram уже подключён', 'Telegram is already connected in the demo', 'Demoda Telegram ulangan'), 'info'); return; }
    setTelegramBusy(true);
    try {
      const status = !relink && telegram?.deep_link ? telegram : await traceApi.settings.relinkTelegram();
      setTelegram(status);
      if (status.deep_link) window.open(status.deep_link, '_blank');
    } catch {
      failed('Не удалось подключить', "Couldn't connect", "Ulab bo'lmadi");
    } finally {
      setTelegramBusy(false);
    }
  };

  const [logoUploading, setLogoUploading] = useState(false);
  const uploadLogo = async (file: File) => {
    setLogoUploading(true);
    try {
      setLogoUrl(await uploadPhoto(getSubdomain(), file));
    } catch {
      failed('Не удалось загрузить', "Couldn't upload", "Yuklab bo'lmadi");
    } finally {
      setLogoUploading(false);
    }
  };

  // Thresholds save a moment after the last click, not on every step.
  const stepThreshold = (k: keyof AlertThresholds, d: number, min: number, fallback: number) => {
    if (!thresholds) return;
    const next = { ...thresholds, [k]: Math.max(min, (thresholds[k] ?? fallback) + d) };
    setThresholds(next);
    if (demo) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      traceApi.settings.saveAlertThresholds(next).then(setThresholds).catch(() => failed('Не удалось сохранить', "Couldn't save", "Saqlab bo'lmadi"));
    }, 700);
  };

  const togglePage = (id: ViewState) => setHiddenPages(hiddenPages.includes(id) ? hiddenPages.filter(p => p !== id) : [...hiddenPages, id]);
  const pages = NAV_ITEMS.filter(({ id }) => HIDEABLE_PAGE_IDS.includes(id) && !unavailablePages.includes(id));
  const startChoices = DEFAULT_PAGE_CHOICES.filter(id => !hiddenPages.includes(id) && !unavailablePages.includes(id));
  const sw = ACCENT_SWATCHES.find(s => s.rgb === accent) ?? ACCENT_SWATCHES[0];

  const reportName = (r: ReportType) => r === 'daily_summary' ? t.daily_summary_label : r === 'weekly_summary' ? t.weekly_summary_label : t.financial_summary_label;
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const subLine = (s: ReportSubscription) => [
    s.frequency === 'daily' ? T('Ежедневно', 'Daily', 'Har kuni') : T('Еженедельно, пн', 'Weekly, Mon', 'Har hafta, du'),
    T(`в ${hh(s.send_hour)}`, `at ${hh(s.send_hour)}`, `soat ${hh(s.send_hour)}`),
    s.channel === 'email' ? s.email : null,
    !s.enabled ? T('на паузе', 'paused', "to'xtatilgan") : null,
  ].filter(Boolean).join(' · ');

  const THRESH: { k: keyof AlertThresholds; label: string; unit: string; step: number; min: number; fallback: number }[] = [
    { k: 'staleOpenTableMin', label: T('Стол открыт и не закрыт дольше', 'Table open without closing longer than', 'Stol yopilmasdan ochiq'), unit: T('мин', 'min', 'daq'), step: 15, min: 15, fallback: 180 },
    { k: 'lowStockQty', label: T('На складе осталось меньше', 'Stock below', 'Omborda qoldi'), unit: T('шт', 'pcs', 'dona'), step: 1, min: 0, fallback: 5 },
    { k: 'highWriteoffPct', label: T('Списания выше', 'Write-offs above', 'Hisobdan chiqarish'), unit: T('% выручки', '% of revenue', '% tushum'), step: 1, min: 0, fallback: 5 },
    { k: 'negativeMarginPct', label: T('Маржа блюда ниже', 'Dish margin below', 'Taom marjasi'), unit: '%', step: 1, min: -50, fallback: 0 },
  ];

  return (
    <>
      <div className="page-head rise">
        <div>
          <h1>{T('Настройки', 'Settings', 'Sozlamalar')}</h1>
          <div className="sub">{T('Оформление, разделы, отчёты и приложение для компьютера', 'Appearance, sections, reports and the desktop app', "Ko'rinish, bo'limlar, hisobotlar va kompyuter ilovasi")}</div>
        </div>
      </div>

      <div className="set-col rise">
        <div className="sec-label">{T('Язык', 'Language', 'Til')}</div>
        <div className="seg" role="group" aria-label={T('Язык', 'Language', 'Til')}>
          {LANGS.map(l => <button key={l.v} type="button" aria-pressed={lang === l.v} onClick={() => setLang(l.v)}>{l.label}</button>)}
        </div>

        <div className="sec-label">{T('Оформление', 'Appearance', "Ko'rinish")}</div>
        <div className="seg" role="group" aria-label={T('Тема', 'Theme', 'Mavzu')}>
          <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><i className="ph ph-sun" aria-hidden="true" style={{ marginRight: 6 }} />{T('Светлая', 'Light', "Yorug'")}</button>
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><i className="ph ph-moon" aria-hidden="true" style={{ marginRight: 6 }} />{T('Тёмная', 'Dark', "Qorong'i")}</button>
        </div>
        <div className="list" style={{ marginTop: 12 }}>
          <div className="li col">
            <span className="li-main"><span className="li-t">{T('Акцентный цвет', 'Accent colour', 'Asosiy rang')}</span><span className="li-s">{T('Кнопки, активная вкладка, графики', 'Buttons, active tab, charts', 'Tugmalar, faol tab, grafiklar')}</span></span>
            <div className="acc-row">
              {ACCENT_SWATCHES.map(s => <button key={s.id} type="button" className="accsw" style={{ '--c': s.light, '--cd': s.dark } as React.CSSProperties} aria-pressed={s.rgb === sw.rgb} aria-label={tr(lang, ...s.name)} onClick={() => setAccent(s.rgb)} />)}
              <span className="faint" style={{ fontSize: 13 }}>{tr(lang, ...sw.name)}</span>
            </div>
          </div>
          <div className="li">
            <span className="logo-box">{logoUrl ? <img src={logoUrl} alt="" /> : 'TRACE'}</span>
            <span className="li-main"><span className="li-t">{T('Логотип', 'Logo', 'Logotip')}</span><span className="li-s">{T('Показывается в шапке вместо TRACE', 'Shown in the header instead of TRACE', "Sarlavhada TRACE o'rniga")}</span></span>
            {logoUrl && <button type="button" className="row-btn neg" onClick={() => setLogoUrl(null)}>{T('Убрать', 'Remove', 'Olib tashlash')}</button>}
            <label className="btn" style={{ cursor: 'pointer' }}>
              <i className={`ph ${logoUploading ? 'ph-circle-notch spin' : 'ph-upload-simple'}`} aria-hidden="true" />
              {logoUploading ? T('Загружаем…', 'Uploading…', 'Yuklanmoqda…') : logoUrl ? T('Заменить', 'Replace', 'Almashtirish') : T('Загрузить', 'Upload', 'Yuklash')}
              <input type="file" accept="image/*" hidden disabled={logoUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
            </label>
          </div>
        </div>

        <div className="sec-label">{T('Разделы', 'Sections', "Bo'limlar")}</div>
        <div className="list">
          {pages.map(({ id }) => {
            const on = !hiddenPages.includes(id);
            const name = t[id as keyof typeof t] as string;
            return (
              <div className="li" key={id}>
                <span className="li-main li-t">{name}</span>
                <button type="button" className="switch" role="switch" aria-checked={on} aria-label={T(`Показывать «${name}»`, `Show “${name}”`, `«${name}» ko'rsatish`)} onClick={() => togglePage(id)} />
              </div>
            );
          })}
          <div className="li">
            <span className="li-main"><span className="li-t">{T('Стартовая страница', 'Start page', 'Boshlang‘ich sahifa')}</span><span className="li-s">{T('Открывается при входе', 'Opens when you sign in', 'Kirishda ochiladi')}</span></span>
            <span className="sel" style={{ width: 200 }}>
              <select className="input" value={startChoices.includes(defaultPage) ? defaultPage : 'dashboard'} onChange={e => setDefaultPage(e.target.value as ViewState)} aria-label={T('Стартовая страница', 'Start page', 'Boshlang‘ich sahifa')}>
                {startChoices.map(id => <option key={id} value={id}>{t[id as keyof typeof t] as string}</option>)}
              </select><i className="ph ph-caret-down chev" aria-hidden="true" />
            </span>
          </div>
        </div>
        <p className="note">{T('Выключенные разделы пропадут из меню. Главная и настройки остаются всегда.', 'Turned-off sections disappear from the menu. Home and Settings always stay.', "O'chirilgan bo'limlar menyudan yo'qoladi. Bosh sahifa va sozlamalar doim qoladi.")}</p>

        {thresholds && <>
          <div className="sec-label">{T('Когда подсвечивать проблему', 'When to flag a problem', "Muammoni qachon ko'rsatish")}</div>
          <div className="list">
            {THRESH.map(th => (
              <div className="li" key={th.k}>
                <span className="li-main li-t">{th.label}</span>
                <span className="stepper">
                  <button type="button" onClick={() => stepThreshold(th.k, -th.step, th.min, th.fallback)} aria-label={T('Меньше', 'Less', 'Kamroq')}><i className="ph ph-minus" aria-hidden="true" /></button>
                  <b className="num">{thresholds[th.k] ?? '—'}</b>
                  <button type="button" onClick={() => stepThreshold(th.k, th.step, th.min, th.fallback)} aria-label={T('Больше', 'More', "Ko'proq")}><i className="ph ph-plus" aria-hidden="true" /></button>
                </span>
                <span className="unit">{th.unit}</span>
              </div>
            ))}
          </div>
          <p className="note">{T('Главная и «Операции» отметят это как повод вмешаться.', 'Home and Operations will flag these as a reason to step in.', "Bosh sahifa va «Operatsiyalar» buni aralashish sababi sifatida belgilaydi.")}</p>
        </>}

        <div className="sec-label">{T('Отчёты в Telegram', 'Reports in Telegram', 'Telegramda hisobotlar')}</div>
        <div className="list">
          <div className="li">
            <i className="ph ph-telegram-logo" aria-hidden="true" />
            <span className="li-main"><span className="li-t">{telegram?.connected ? T('Подключено', 'Connected', 'Ulangan') : T('Не подключено', 'Not connected', 'Ulanmagan')}</span>
              <span className="li-s">{telegram?.connected ? T('Отчёты приходят в ваш чат с ботом TRACE', 'Reports arrive in your chat with the TRACE bot', 'Hisobotlar TRACE boti bilan chatingizga keladi') : T('Подключите бота, чтобы получать отчёты', 'Connect the bot to get reports', 'Hisobot olish uchun botni ulang')}</span></span>
            {telegram?.connected && <span className="tag pos">{T('Работает', 'Working', 'Ishlayapti')}</span>}
          </div>
          <button type="button" className="li" disabled={telegramBusy} onClick={() => connectTelegram(!!telegram?.connected)}>
            <i className={`ph ${telegramBusy ? 'ph-circle-notch spin' : 'ph-link'}`} aria-hidden="true" />
            <span className="li-main li-t">{telegram?.connected ? T('Переподключить Telegram', 'Reconnect Telegram', 'Telegramni qayta ulash') : T('Подключить Telegram', 'Connect Telegram', 'Telegramni ulash')}</span>
            <i className="ph ph-arrow-square-out" aria-hidden="true" />
          </button>
        </div>

        <div className="sec-label">{T('Подписки на отчёты', 'Report subscriptions', 'Hisobot obunalari')}</div>
        {subs.length > 0 ? (
          <div className="list">
            {subs.map(s => {
              const busy = busyIds.has(s.id);
              const isNew = s.id.startsWith(NEW_PREFIX);
              const open = editing === s.id || isNew;
              return (
                <div className="sub-row" key={s.id}>
                  <div className="sub-h"><b>{reportName(s.report_type)}</b><span className="tag">{s.channel === 'telegram' ? 'Telegram' : 'Email'}</span>{!s.enabled && <span className="tag">{T('Пауза', 'Paused', "To'xtatilgan")}</span>}</div>
                  <div className="sub-s">{subLine(s)}{s.last_sent_at ? ` · ${T('последний', 'last', 'oxirgi')} ${new Date(s.last_sent_at).toLocaleString(lang === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })}` : ''}</div>
                  {!open && <div className="sub-a">
                    <button type="button" className="row-btn" disabled={busy || (s.channel === 'telegram' && !telegram?.connected)} onClick={() => sendTest(s)}><i className={`ph ${busy ? 'ph-circle-notch spin' : 'ph-paper-plane-tilt'}`} aria-hidden="true" />{T('Отправить тест', 'Send test', 'Test yuborish')}</button>
                    <button type="button" className="row-btn" onClick={() => setEditing(s.id)}><i className="ph ph-pencil-simple" aria-hidden="true" />{T('Изменить', 'Edit', "O'zgartirish")}</button>
                    <button type="button" className="row-btn neg" disabled={busy} onClick={() => deleteSub(s)}><i className="ph ph-trash" aria-hidden="true" />{T('Удалить', 'Delete', "O'chirish")}</button>
                  </div>}
                  {open && <div className="sub-edit">
                    <div className="fields">
                      <label className="field">{T('Отчёт', 'Report', 'Hisobot')}
                        <span className="sel"><select className="input" value={s.report_type} disabled={!isNew} onChange={e => updateSub(s.id, { report_type: e.target.value as ReportType })}>
                          <option value="daily_summary">{t.daily_summary_label}</option>
                          {!isPoster && <option value="financial_summary">{t.financial_summary_label}</option>}
                          <option value="weekly_summary">{t.weekly_summary_label}</option>
                        </select><i className="ph ph-caret-down chev" aria-hidden="true" /></span></label>
                      <label className="field">{T('Куда', 'Where', 'Qayerga')}
                        <span className="sel"><select className="input" value={s.channel} disabled={!isNew} onChange={e => updateSub(s.id, { channel: e.target.value as ReportChannel })}>
                          <option value="telegram">Telegram</option><option value="email">Email</option>
                        </select><i className="ph ph-caret-down chev" aria-hidden="true" /></span></label>
                      {s.channel === 'email' && <label className="field">Email<input className="input" type="email" autoComplete="email" placeholder="owner@restaurant.uz" value={s.email ?? ''} onChange={e => updateSub(s.id, { email: e.target.value })} /></label>}
                      <label className="field">{T('Как часто', 'How often', 'Qanchalik tez')}
                        <span className="sel"><select className="input" value={s.frequency} onChange={e => updateSub(s.id, { frequency: e.target.value as 'daily' | 'weekly' })}>
                          <option value="daily">{T('Ежедневно', 'Daily', 'Har kuni')}</option><option value="weekly">{T('Еженедельно, пн', 'Weekly, Mon', 'Har hafta, du')}</option>
                        </select><i className="ph ph-caret-down chev" aria-hidden="true" /></span></label>
                      <label className="field">{T('Время', 'Time', 'Vaqt')}
                        <span className="sel"><select className="input" value={s.send_hour} onChange={e => updateSub(s.id, { send_hour: Number(e.target.value) })}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
                        </select><i className="ph ph-caret-down chev" aria-hidden="true" /></span></label>
                    </div>
                    {s.channel === 'telegram' && !telegram?.connected && <p className="note" style={{ margin: 0 }}>{T('Сначала подключите Telegram выше.', 'Connect Telegram above first.', 'Avval yuqorida Telegramni ulang.')}</p>}
                    <div className="li" style={{ padding: 0, minHeight: 0 }}>
                      <span className="li-main li-t">{T('Отправлять', 'Send', 'Yuborish')}</span>
                      <button type="button" className="switch" role="switch" aria-checked={s.enabled} aria-label={T('Отправлять', 'Send', 'Yuborish')} onClick={() => updateSub(s.id, { enabled: !s.enabled })} />
                    </div>
                    <div className="acts">
                      <button type="button" className="btn" disabled={busy} onClick={() => { if (isNew) deleteSub(s); else { setEditing(null); refetchSubs(); } }}>{T('Отмена', 'Cancel', 'Bekor')}</button>
                      <button type="button" className="btn solid" disabled={busy || (s.channel === 'email' && !s.email)} onClick={() => saveSub(s)}>{busy && <i className="ph ph-circle-notch spin" aria-hidden="true" />}{T('Сохранить', 'Save', 'Saqlash')}</button>
                    </div>
                  </div>}
                </div>
              );
            })}
          </div>
        ) : <p className="note" style={{ marginTop: 0 }}>{T('Пока нет подписок. Добавьте первую.', 'No subscriptions yet. Add the first one.', "Hozircha obuna yo'q. Birinchisini qo'shing.")}</p>}
        <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => setSubs(prev => [...prev, blankSubscription(telegram?.connected ? 'telegram' : 'email')])}>
          <i className="ph ph-plus" aria-hidden="true" />{T('Новая подписка', 'New subscription', 'Yangi obuna')}
        </button>

        <div className="sec-label">{T('Приложение для компьютера', 'Desktop app', 'Kompyuter ilovasi')}</div>
        <div className="list">
          <div className="li col">
            <span className="li-main li-s" style={{ fontSize: 14, color: 'var(--text-2)' }}>{T('TRACE как отдельное приложение, без браузера каждый день. На телефоне вход по QR-коду.', 'TRACE as its own app, no browser every day. Sign in with a QR code from your phone.', "TRACE alohida ilova sifatida, har kuni brauzersiz. Telefondan QR-kod orqali kirish.")}</span>
            <div className="acts" style={{ justifyContent: 'flex-start' }}>
              {/* Tenant in the path, not just the download attribute: this link is
                  cross-origin, so browsers ignore `download` and the backend's
                  Content-Disposition is what names the file for the installer hook. */}
              <a className={`btn${isMac ? '' : ' solid'}`} href={downloadUrl(`/downloads/TRACE-Setup-${getSubdomain()}.exe`)} download={`TRACE-Setup-${getSubdomain()}.exe`}><i className="ph ph-windows-logo" aria-hidden="true" />{T('Для Windows', 'For Windows', 'Windows uchun')}</a>
              {/* One shared dmg for every tenant: a dmg has no install hook to read
                  the tenant from its filename, so the launcher's login picks it. */}
              <a className={`btn${isMac ? ' solid' : ''}`} href={downloadUrl('/downloads/TRACE.dmg')} download="TRACE.dmg"><i className="ph ph-apple-logo" aria-hidden="true" />{T('Для Mac', 'For Mac', 'Mac uchun')}</a>
            </div>
            {/* Neither build is code-signed yet, so browsers, SmartScreen and
                Gatekeeper warn on first download/run — tell users how to get past it. */}
            <div className="warn">
              <p><b style={{ fontWeight: 500, color: 'var(--text)' }}>{T('Если появится предупреждение', 'If you see a warning', 'Agar ogohlantirish chiqsa')}</b></p>
              {isMac ? <>
                <p>{T('Откройте TRACE.dmg и перетащите TRACE в папку «Программы».', 'Open TRACE.dmg and drag TRACE into Applications.', 'TRACE.dmg ni oching va TRACE ni «Dasturlar» papkasiga torting.')}</p>
                <p>{T('Если Mac не может проверить приложение: «Готово», затем Системные настройки → Конфиденциальность и безопасность → «Всё равно открыть».', "If your Mac can't verify the app: “Done”, then System Settings → Privacy & Security → “Open Anyway”.", "Mac ilovani tekshira olmasa: «Tayyor», so'ng Tizim sozlamalari → Maxfiylik va xavfsizlik → «Baribir ochish».")}</p>
              </> : <>
                <p>{T('В браузере нажмите «Сохранить» или «Всё равно скачать».', 'In the browser, click “Keep” or “Download anyway”.', "Brauzerda «Saqlash» yoki «Baribir yuklab olish» ni bosing.")}</p>
                <p>{T('В окне «Windows защитила ваш компьютер»: «Подробнее» → «Выполнить в любом случае».', 'On “Windows protected your PC”: “More info” → “Run anyway”.', "«Windows kompyuteringizni himoya qildi» oynasida: «Batafsil» → «Baribir ishga tushirish».")}</p>
              </>}
              <p>{T('Это официальное приложение TRACE. Предупреждение появляется для всех новых программ.', 'This is the official TRACE app. Your computer warns about every new app.', "Bu TRACE ning rasmiy ilovasi. Ogohlantirish barcha yangi dasturlar uchun chiqadi.")}</p>
            </div>
          </div>
        </div>

        <div className="sec-label">{T('Помощь и правила', 'Help and terms', 'Yordam va qoidalar')}</div>
        <div className="list">
          <a className="li" href="https://trace-os.uz/terms" target="_blank" rel="noopener noreferrer"><i className="ph ph-file-text" aria-hidden="true" /><span className="li-main li-t">{T('Условия использования', 'Terms of use', 'Foydalanish shartlari')}</span><i className="ph ph-arrow-square-out" aria-hidden="true" /></a>
          <a className="li" href="https://trace-os.uz/privacy" target="_blank" rel="noopener noreferrer"><i className="ph ph-shield-check" aria-hidden="true" /><span className="li-main li-t">{T('Политика конфиденциальности', 'Privacy policy', 'Maxfiylik siyosati')}</span><i className="ph ph-arrow-square-out" aria-hidden="true" /></a>
          <a className="li" href="https://t.me/trace_executive" target="_blank" rel="noopener noreferrer"><i className="ph ph-lifebuoy" aria-hidden="true" /><span className="li-main"><span className="li-t">{T('Написать в поддержку', 'Contact support', "Qo'llab-quvvatlashga yozish")}</span><span className="li-s">{T('Telegram, отвечаем примерно за 30 минут', 'Telegram, we reply in about 30 minutes', 'Telegram, taxminan 30 daqiqada javob beramiz')}</span></span><i className="ph ph-arrow-square-out" aria-hidden="true" /></a>
        </div>

        {onLogout && <div className="list" style={{ marginTop: 24 }}>
          <button type="button" className="li" style={{ justifyContent: 'center', color: 'var(--neg)' }} onClick={onLogout}>{T('Выйти', 'Sign out', 'Chiqish')}</button>
        </div>}
      </div>
    </>
  );
};
