import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Language } from '../../types';
import { Target, Mail, Loader2, Plus, Trash2, Send, Sun, Moon, Link2, BellRing } from 'lucide-react';
import { traceApi, isDemoTenant, ReportSubscription, ReportType, ReportChannel, TelegramStatus, AlertThresholds } from '../../services/traceApi';
import { TRANSLATIONS } from '../../constants';

const NEW_PREFIX = 'new-';

function blankSubscription(): ReportSubscription {
  return {
    id: `${NEW_PREFIX}${Date.now()}`,
    channel: 'email',
    email: '',
    report_type: 'daily_summary',
    frequency: 'daily',
    send_hour: 7,
    enabled: true,
    last_sent_at: null,
  };
}

export const Settings: React.FC<{
  lang: Language;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
}> = ({ lang, onShowToast, theme, setTheme }) => {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const t = TRANSLATIONS[lang];

  // Business hours + break-even — persisted server-side per tenant (used to
  // be localStorage-only, which reset on a different device/browser/branch
  // subdomain and never synced with anything else that read it, like the
  // Dashboard's "vs yesterday" time-of-day scaling).
  const [breakEven, setBreakEven] = useState('');
  const [openHour,  setOpenHour]  = useState('9');
  const [closeHour, setCloseHour] = useState('23');
  const [hoursSaving, setHoursSaving] = useState(false);

  useEffect(() => {
    if (isDemoTenant()) return;
    traceApi.settings.businessHours().then(h => {
      if (h.openHour != null) setOpenHour(String(h.openHour));
      if (h.closeHour != null) setCloseHour(String(h.closeHour));
      if (h.breakEvenRevenue != null) setBreakEven(String(h.breakEvenRevenue));
    }).catch(() => {});
  }, []);

  // Alert thresholds — drive the low-stock / negative-margin / high-writeoff
  // / stale-open-table flags surfaced elsewhere in the app. Stored as
  // strings in state (like breakEven above) so an empty input clears the
  // threshold instead of coercing to 0.
  const [thresholds, setThresholds] = useState<{ [K in keyof AlertThresholds]: string }>({
    lowStockQty: '', negativeMarginPct: '', highWriteoffPct: '', staleOpenTableMin: '',
  });
  const [thresholdsSaving, setThresholdsSaving] = useState(false);

  useEffect(() => {
    traceApi.settings.alertThresholds().then(v => {
      setThresholds({
        lowStockQty: v.lowStockQty != null ? String(v.lowStockQty) : '',
        negativeMarginPct: v.negativeMarginPct != null ? String(v.negativeMarginPct) : '',
        highWriteoffPct: v.highWriteoffPct != null ? String(v.highWriteoffPct) : '',
        staleOpenTableMin: v.staleOpenTableMin != null ? String(v.staleOpenTableMin) : '',
      });
    }).catch(() => {});
  }, []);

  const handleSaveThresholds = async () => {
    setThresholdsSaving(true);
    try {
      await traceApi.settings.saveAlertThresholds({
        lowStockQty: thresholds.lowStockQty ? Number(thresholds.lowStockQty) : null,
        negativeMarginPct: thresholds.negativeMarginPct ? Number(thresholds.negativeMarginPct) : null,
        highWriteoffPct: thresholds.highWriteoffPct ? Number(thresholds.highWriteoffPct) : null,
        staleOpenTableMin: thresholds.staleOpenTableMin ? Number(thresholds.staleOpenTableMin) : null,
      });
      onShowToast?.(ru ? 'Сохранено' : isUz ? 'Saqlandi' : 'Saved', 'success');
    } catch {
      onShowToast?.(ru ? 'Ошибка сохранения' : isUz ? 'Saqlashda xatolik' : 'Save failed', 'error');
    } finally {
      setThresholdsSaving(false);
    }
  };

  // Report subscriptions (email + telegram) and the tenant's one shared
  // Telegram connection they all ride on.
  const [subs, setSubs] = useState<ReportSubscription[]>([]);
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // Merges freshly-fetched (persisted) subscriptions with any not-yet-saved
  // local rows, so refetching never wipes a subscription the user is still
  // filling in — a `focus` refetch used to blow away unsaved rows entirely.
  const refetchSubs = () => {
    if (isDemoTenant()) return;
    traceApi.settings.listReportSubscriptions()
      .then(fetched => setSubs(prev => [...fetched, ...prev.filter(s => s.id.startsWith(NEW_PREFIX))]))
      .catch(() => {});
  };

  const refetchTelegram = () => {
    if (isDemoTenant()) return;
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

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds(prev => {
      const next = new Set(prev);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleSave = async () => {
    setHoursSaving(true);
    try {
      await traceApi.settings.saveBusinessHours({
        openHour: parseInt(openHour, 10),
        closeHour: parseInt(closeHour, 10),
        breakEvenRevenue: breakEven ? parseInt(breakEven, 10) : null,
      });
      onShowToast?.(ru ? 'Сохранено' : isUz ? 'Saqlandi' : 'Saved', 'success');
    } catch {
      onShowToast?.(ru ? 'Ошибка сохранения' : isUz ? 'Saqlashda xatolik' : 'Save failed', 'error');
    } finally {
      setHoursSaving(false);
    }
  };

  const updateSub = (id: string, patch: Partial<ReportSubscription>) => {
    setSubs(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const handleSaveSubscription = async (sub: ReportSubscription) => {
    if (sub.channel === 'email' && !sub.email) return;
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
      onShowToast?.(t.report_subscription_saved, 'success');
    } catch {
      onShowToast?.(ru ? 'Ошибка сохранения' : isUz ? 'Saqlashda xatolik' : 'Save failed', 'error');
    } finally {
      setBusy(sub.id, false);
    }
  };

  const handleConnectTelegram = async () => {
    setTelegramBusy(true);
    try {
      const status = telegram?.deep_link ? telegram : await traceApi.settings.relinkTelegram();
      setTelegram(status);
      if (status.deep_link) window.open(status.deep_link, '_blank');
    } catch {
      onShowToast?.(ru ? 'Ошибка подключения' : isUz ? 'Ulanishda xatolik' : 'Connect failed', 'error');
    } finally {
      setTelegramBusy(false);
    }
  };

  const handleRelinkTelegram = async () => {
    setTelegramBusy(true);
    try {
      const status = await traceApi.settings.relinkTelegram();
      setTelegram(status);
      if (status.deep_link) window.open(status.deep_link, '_blank');
    } catch {
      onShowToast?.(ru ? 'Ошибка подключения' : isUz ? 'Ulanishda xatolik' : 'Connect failed', 'error');
    } finally {
      setTelegramBusy(false);
    }
  };

  const handleDeleteSubscription = async (sub: ReportSubscription) => {
    if (sub.id.startsWith(NEW_PREFIX)) {
      setSubs(prev => prev.filter(s => s.id !== sub.id));
      return;
    }
    setBusy(sub.id, true);
    try {
      await traceApi.settings.deleteReportSubscription(sub.id);
      setSubs(prev => prev.filter(s => s.id !== sub.id));
    } catch {
      onShowToast?.(ru ? 'Ошибка удаления' : isUz ? "O'chirishda xatolik" : 'Delete failed', 'error');
    } finally {
      setBusy(sub.id, false);
    }
  };

  const handleSendTest = async (sub: ReportSubscription) => {
    if (sub.channel === 'email' && !sub.email) return;
    if (sub.channel === 'telegram' && !telegram?.connected) return;
    setBusy(sub.id, true);
    try {
      const res = await traceApi.settings.sendTestReport({
        channel: sub.channel, email: sub.email, report_type: sub.report_type,
      });
      if (res.ok) onShowToast?.(t.test_email_sent, 'success');
      else onShowToast?.(res.error ?? (ru ? 'Ошибка отправки' : isUz ? "Yuborishda xatolik" : 'Send failed'), 'error');
    } catch {
      onShowToast?.(ru ? 'Ошибка отправки' : isUz ? "Yuborishda xatolik" : 'Send failed', 'error');
    } finally {
      setBusy(sub.id, false);
    }
  };

  return (
    <div className="max-w-2xl animate-fade-in pb-20 space-y-5">
      <Card title={ru ? 'Внешний вид' : isUz ? "Ko'rinish" : 'Appearance'} action={theme === 'dark' ? <Moon size={18} className="text-muted" /> : <Sun size={18} className="text-muted" />}>
        <p className="text-[13px] text-muted -mt-1 mb-5">
          {ru
            ? 'Светлая тема рекомендуется для лучшей читаемости на телефоне'
            : isUz
              ? "Telefonda yaxshi o'qish uchun yorug' mavzu tavsiya etiladi"
              : 'Light mode is recommended for the best readability on a phone'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setTheme('light')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[14px] font-semibold border transition-colors ${
              theme === 'light' ? 'bg-primary text-white border-primary' : 'bg-card border-border text-text hover:bg-card-hover'
            }`}
          >
            <Sun size={16} />
            {ru ? 'Светлая' : isUz ? "Yorug'" : 'Light'}
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[14px] font-semibold border transition-colors ${
              theme === 'dark' ? 'bg-primary text-white border-primary' : 'bg-card border-border text-text hover:bg-card-hover'
            }`}
          >
            <Moon size={16} />
            {ru ? 'Тёмная' : isUz ? 'Qora' : 'Dark'}
          </button>
        </div>
      </Card>

      <Card title={ru ? 'Бизнес-цели' : isUz ? 'Biznes maqsadlari' : 'Business Targets'} action={<Target size={18} className="text-muted" />}>
        <p className="text-[11px] text-muted -mt-1 mb-5">
          {ru
            ? 'Используется для расчёта темпа выручки и порога окупаемости на дашборде'
            : 'Used for revenue pace and break-even tracker on the dashboard'}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-1">
            <label className="text-[11px] text-muted block mb-1.5">
              {ru ? 'Порог окупаемости в день (UZS)' : isUz ? "Kunlik o'z-o'zini oqlash chegarasi (UZS)" : 'Daily break-even revenue (UZS)'}
            </label>
            <input
              type="number"
              value={breakEven}
              onChange={e => setBreakEven(e.target.value)}
              placeholder={ru ? 'напр. 8500000' : isUz ? 'masalan, 8500000' : 'e.g. 8500000'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text placeholder-muted/40 focus:outline-none focus:border-primary transition-colors"
              style={{ fontSize: 'max(16px, 13px)' }}
            />
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1.5">{ru ? 'Открытие' : isUz ? 'Ochilish' : 'Opens at'}</label>
            <select
              value={openHour}
              onChange={e => setOpenHour(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1.5">{ru ? 'Закрытие' : isUz ? 'Yopilish' : 'Closes at'}</label>
            <select
              value={closeHour}
              onChange={e => setCloseHour(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={hoursSaving}
          className="mt-5 px-6 py-2 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {hoursSaving ? <Loader2 size={13} className="animate-spin" /> : null}
          {ru ? 'Сохранить' : isUz ? t.save : 'Save'}
        </button>
      </Card>

      <Card title={ru ? 'Пороги уведомлений' : isUz ? 'Ogohlantirish chegaralari' : 'Alert Thresholds'} action={<BellRing size={18} className="text-muted" />}>
        <p className="text-[11px] text-muted -mt-1 mb-5">
          {ru
            ? 'Значения, при превышении которых система должна поднимать флаг (низкий остаток, отрицательная маржа, высокий % списаний, зависшие открытые столы)'
            : isUz
              ? "Bu qiymatlardan oshganda tizim signal berishi kerak (kam qoldiq, manfiy marja, yuqori % chiqindi, ochiq stollar)"
              : 'Values that trigger a flag elsewhere in the app (low stock, negative margin, high writeoff %, stale open tables)'}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="text-[11px] text-muted block mb-1.5">
              {ru ? 'Низкий остаток (ед.)' : isUz ? 'Kam qoldiq (birlik)' : 'Low stock (units)'}
            </label>
            <input
              type="number"
              value={thresholds.lowStockQty}
              onChange={e => setThresholds(prev => ({ ...prev, lowStockQty: e.target.value }))}
              placeholder={ru ? 'напр. 5' : isUz ? 'masalan, 5' : 'e.g. 5'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text placeholder-muted/40 focus:outline-none focus:border-primary transition-colors"
              style={{ fontSize: 'max(16px, 13px)' }}
            />
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1.5">
              {ru ? 'Отрицательная маржа (%)' : isUz ? 'Manfiy marja (%)' : 'Negative margin (%)'}
            </label>
            <input
              type="number"
              value={thresholds.negativeMarginPct}
              onChange={e => setThresholds(prev => ({ ...prev, negativeMarginPct: e.target.value }))}
              placeholder={ru ? 'напр. 0' : isUz ? 'masalan, 0' : 'e.g. 0'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text placeholder-muted/40 focus:outline-none focus:border-primary transition-colors"
              style={{ fontSize: 'max(16px, 13px)' }}
            />
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1.5">
              {ru ? 'Высокий % списаний' : isUz ? 'Yuqori chiqindi %' : 'High writeoff %'}
            </label>
            <input
              type="number"
              value={thresholds.highWriteoffPct}
              onChange={e => setThresholds(prev => ({ ...prev, highWriteoffPct: e.target.value }))}
              placeholder={ru ? 'напр. 5' : isUz ? 'masalan, 5' : 'e.g. 5'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text placeholder-muted/40 focus:outline-none focus:border-primary transition-colors"
              style={{ fontSize: 'max(16px, 13px)' }}
            />
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1.5">
              {ru ? 'Зависший открытый стол (мин)' : isUz ? "Ochiq stol (daqiqa)" : 'Stale open table (min)'}
            </label>
            <input
              type="number"
              value={thresholds.staleOpenTableMin}
              onChange={e => setThresholds(prev => ({ ...prev, staleOpenTableMin: e.target.value }))}
              placeholder={ru ? 'напр. 180' : isUz ? 'masalan, 180' : 'e.g. 180'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text placeholder-muted/40 focus:outline-none focus:border-primary transition-colors"
              style={{ fontSize: 'max(16px, 13px)' }}
            />
          </div>
        </div>
        <button
          onClick={handleSaveThresholds}
          disabled={thresholdsSaving}
          className="mt-5 px-6 py-2 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {thresholdsSaving ? <Loader2 size={13} className="animate-spin" /> : null}
          {ru ? 'Сохранить' : isUz ? t.save : 'Save'}
        </button>
      </Card>

      {!isDemoTenant() && (
        <Card title={t.email_reports} action={<Mail size={18} className="text-muted" />}>
          <p className="text-[11px] text-muted -mt-1 mb-5">{t.email_reports_desc}</p>

          <div className="mb-5 p-3 rounded-lg border border-border bg-background flex items-center gap-3">
            <Send size={16} className="text-muted shrink-0" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-text">{t.channel_telegram}</p>
              <p className="text-[11px] text-muted">
                {telegram?.connected ? t.telegram_connected : t.telegram_not_connected}
              </p>
            </div>
            <button
              onClick={telegram?.connected ? handleRelinkTelegram : handleConnectTelegram}
              disabled={telegramBusy}
              className="px-3 py-1.5 bg-card border border-border text-text text-[12px] font-semibold rounded-lg hover:bg-card-hover transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              {telegramBusy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              {telegram?.connected ? t.relink_telegram : t.connect_telegram}
            </button>
          </div>

          {subs.length === 0 && (
            <p className="text-[12px] text-muted mb-4">{t.no_subscriptions}</p>
          )}

          <div className="space-y-4">
            {subs.map(sub => {
              const busy = busyIds.has(sub.id);
              const isNew = sub.id.startsWith(NEW_PREFIX);
              return (
                <div key={sub.id} className="p-4 rounded-lg border border-border bg-background">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-[11px] text-muted block mb-1.5">{t.channel_label}</label>
                      <select
                        value={sub.channel}
                        onChange={e => updateSub(sub.id, { channel: e.target.value as ReportChannel })}
                        disabled={!isNew}
                        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="email">{t.channel_email}</option>
                        <option value="telegram">{t.channel_telegram}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-1.5">{t.report_type_label}</label>
                      <select
                        value={sub.report_type}
                        onChange={e => updateSub(sub.id, { report_type: e.target.value as ReportType })}
                        disabled={!isNew}
                        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="daily_summary">{t.daily_summary_label}</option>
                        <option value="financial_summary">{t.financial_summary_label}</option>
                      </select>
                    </div>
                  </div>

                  {sub.channel === 'email' ? (
                    <div className="mb-3">
                      <label className="text-[11px] text-muted block mb-1.5">{t.email_address}</label>
                      <input
                        type="email"
                        value={sub.email ?? ''}
                        onChange={e => updateSub(sub.id, { email: e.target.value })}
                        placeholder="owner@restaurant.com"
                        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-[13px] text-text placeholder-muted/40 focus:outline-none focus:border-primary transition-colors"
                        style={{ fontSize: 'max(16px, 13px)' }}
                      />
                    </div>
                  ) : (
                    <div className="mb-3">
                      <span className={`text-[12px] flex items-center gap-1.5 ${telegram?.connected ? 'text-success' : 'text-muted'}`}>
                        <Link2 size={13} /> {telegram?.connected ? t.telegram_connected : t.telegram_not_connected}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="text-[11px] text-muted block mb-1.5">{t.report_frequency}</label>
                      <select
                        value={sub.frequency}
                        onChange={e => updateSub(sub.id, { frequency: e.target.value as 'daily' | 'weekly' })}
                        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary transition-colors cursor-pointer"
                      >
                        <option value="daily">{t.freq_daily}</option>
                        <option value="weekly">{t.freq_weekly}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-1.5">{t.send_hour_label}</label>
                      <select
                        value={sub.send_hour}
                        onChange={e => updateSub(sub.id, { send_hour: Number(e.target.value) })}
                        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary transition-colors cursor-pointer"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 h-[34px]">
                      <input
                        id={`enabled-${sub.id}`}
                        type="checkbox"
                        checked={sub.enabled}
                        onChange={e => updateSub(sub.id, { enabled: e.target.checked })}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                      <label htmlFor={`enabled-${sub.id}`} className="text-[12px] text-text cursor-pointer">{t.enable_reports}</label>
                    </div>
                  </div>

                  {sub.last_sent_at && (
                    <p className="text-[10px] text-muted mt-2">
                      {t.last_sent}: {new Date(sub.last_sent_at).toLocaleString(ru ? 'ru-RU' : isUz ? 'uz-Latn-UZ' : 'en-US')}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={() => handleSaveSubscription(sub)}
                      disabled={(sub.channel === 'email' && !sub.email) || busy}
                      className="px-5 py-1.5 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : null}
                      {ru ? 'Сохранить' : isUz ? t.save : 'Save'}
                    </button>
                    <button
                      onClick={() => handleSendTest(sub)}
                      disabled={(sub.channel === 'email' ? !sub.email : !telegram?.connected) || busy || isNew}
                      title={isNew ? (ru ? 'Сначала сохраните' : isUz ? 'Avval saqlang' : 'Save first') : ''}
                      className="px-4 py-1.5 bg-card border border-border text-text text-[12px] font-semibold rounded-lg hover:bg-card-hover transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <Send size={12} />
                      {t.send_test_email}
                    </button>
                    <button
                      onClick={() => handleDeleteSubscription(sub)}
                      disabled={busy}
                      className="ml-auto px-3 py-1.5 text-danger text-[12px] font-semibold rounded-lg hover:bg-danger/8 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <Trash2 size={12} />
                      {t.remove_subscription}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setSubs(prev => [...prev, blankSubscription()])}
            className="mt-4 px-4 py-2 bg-card border border-border text-text text-[12px] font-semibold rounded-lg hover:bg-card-hover transition-colors flex items-center gap-2"
          >
            <Plus size={13} />
            {t.add_subscription}
          </button>
        </Card>
      )}
    </div>
  );
};
