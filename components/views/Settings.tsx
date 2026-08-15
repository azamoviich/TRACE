import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Language, ViewState } from '../../types';
import { Mail, Loader2, Plus, Trash2, Send, Sun, Moon, Link2, PanelLeft, PanelTop, Rows3, PanelBottom, Eye, EyeOff, Palette, Check, ImagePlus, X, Home } from 'lucide-react';
import { traceApi, isDemoTenant, ReportSubscription, ReportType, ReportChannel, TelegramStatus, uploadPhoto, getSubdomain } from '../../services/traceApi';
import { TRANSLATIONS } from '../../constants';
import { NAV_ITEMS, HIDEABLE_PAGE_IDS, DEFAULT_PAGE_CHOICES, ACCENT_SWATCHES, NavStyle, MobileNavStyle } from '../navConfig';

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
  navStyle: NavStyle;
  setNavStyle: (s: NavStyle) => void;
  mobileNavStyle: MobileNavStyle;
  setMobileNavStyle: (s: MobileNavStyle) => void;
  hiddenPages: ViewState[];
  setHiddenPages: (pages: ViewState[]) => void;
  defaultPage: ViewState;
  setDefaultPage: (p: ViewState) => void;
  accent: string;
  setAccent: (rgb: string) => void;
  logoUrl: string | null;
  setLogoUrl: (url: string | null) => void;
}> = ({
  lang, onShowToast, theme, setTheme, navStyle, setNavStyle, mobileNavStyle, setMobileNavStyle,
  hiddenPages, setHiddenPages, defaultPage, setDefaultPage, accent, setAccent, logoUrl, setLogoUrl,
}) => {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const t = TRANSLATIONS[lang];

  // Report subscriptions (email + telegram) and the tenant's one shared
  // Telegram connection they all ride on.
  const [subs, setSubs] = useState<ReportSubscription[]>([]);
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // The "financial_summary" scheduled report calls computeDailyPL on the
  // backend, which is 100% iiko-only — for Poster it returns null and the
  // cron sender just logs a warning and skips silently (cron/reports.ts),
  // so a Poster tenant subscribing to it would never get an error AND
  // never get a report, forever. Hide the option until a Poster-backed
  // financial summary exists.
  const [isPoster, setIsPoster] = useState(false);
  useEffect(() => { traceApi.sales.status().then(s => setIsPoster(!!s.poster)).catch(() => {}); }, []);

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

  const togglePageHidden = (id: ViewState) => {
    setHiddenPages(hiddenPages.includes(id) ? hiddenPages.filter(p => p !== id) : [...hiddenPages, id]);
  };

  const [logoUploading, setLogoUploading] = useState(false);
  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const url = await uploadPhoto(getSubdomain(), file);
      setLogoUrl(url);
    } catch {
      onShowToast?.(ru ? 'Ошибка загрузки' : isUz ? 'Yuklashda xatolik' : 'Upload failed', 'error');
    } finally {
      setLogoUploading(false);
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

      <Card title={t.nav_settings_title} action={navStyle === 'side' ? <PanelLeft size={18} className="text-muted" /> : <PanelTop size={18} className="text-muted" />}>
        <p className="text-[13px] text-muted -mt-1 mb-5">{t.nav_settings_desc}</p>

        <div className="mb-4">
          <label className="text-[11px] text-muted block mb-1.5">{t.nav_style_desktop}</label>
          <div className="flex gap-2">
            <button
              onClick={() => setNavStyle('top')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[14px] font-semibold border transition-colors ${
                navStyle === 'top' ? 'bg-primary text-white border-primary' : 'bg-card border-border text-text hover:bg-card-hover'
              }`}
            >
              <PanelTop size={16} />
              {t.nav_style_top}
            </button>
            <button
              onClick={() => setNavStyle('side')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[14px] font-semibold border transition-colors ${
                navStyle === 'side' ? 'bg-primary text-white border-primary' : 'bg-card border-border text-text hover:bg-card-hover'
              }`}
            >
              <PanelLeft size={16} />
              {t.nav_style_side}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1.5">{t.nav_style_mobile}</label>
          <div className="flex gap-2">
            <button
              onClick={() => setMobileNavStyle('bottom')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[14px] font-semibold border transition-colors ${
                mobileNavStyle === 'bottom' ? 'bg-primary text-white border-primary' : 'bg-card border-border text-text hover:bg-card-hover'
              }`}
            >
              <PanelBottom size={16} />
              {t.nav_style_bottom_tabs}
            </button>
            <button
              onClick={() => setMobileNavStyle('drawer')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[14px] font-semibold border transition-colors ${
                mobileNavStyle === 'drawer' ? 'bg-primary text-white border-primary' : 'bg-card border-border text-text hover:bg-card-hover'
              }`}
            >
              <Rows3 size={16} />
              {t.nav_style_drawer}
            </button>
          </div>
        </div>
      </Card>

      <Card title={t.pages_visibility_title} action={<Eye size={18} className="text-muted" />}>
        <p className="text-[13px] text-muted -mt-1 mb-5">{t.pages_visibility_desc}</p>
        <div className="space-y-1">
          {NAV_ITEMS.filter(({ id }) => id !== 'settings').map(({ id, icon: Icon }) => {
            const isHideable = HIDEABLE_PAGE_IDS.includes(id);
            const isHidden = hiddenPages.includes(id);
            return (
              <div key={id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-background transition-colors">
                <Icon size={16} className="text-muted shrink-0" />
                <span className="text-[13px] text-text flex-1">{t[id as keyof typeof t] as string}</span>
                {!isHideable ? (
                  <span className="text-[11px] text-muted">{t.page_locked_note}</span>
                ) : (
                  <button
                    onClick={() => togglePageHidden(id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${
                      isHidden ? 'bg-card border-border text-muted hover:bg-card-hover' : 'bg-primary/10 border-primary/25 text-primary'
                    }`}
                  >
                    {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    {isHidden ? (ru ? 'Скрыто' : isUz ? 'Yashirin' : 'Hidden') : (ru ? 'Видно' : isUz ? "Ko'rinadi" : 'Visible')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={t.default_page_title} action={<Home size={18} className="text-muted" />}>
        <p className="text-[13px] text-muted -mt-1 mb-4">{t.default_page_desc}</p>
        <select
          value={hiddenPages.includes(defaultPage) ? 'dashboard' : defaultPage}
          onChange={e => setDefaultPage(e.target.value as ViewState)}
          className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-[13px] text-text focus:outline-none focus:border-primary transition-colors cursor-pointer"
        >
          {DEFAULT_PAGE_CHOICES.filter(id => !hiddenPages.includes(id)).map(id => (
            <option key={id} value={id}>{t[id as keyof typeof t] as string}</option>
          ))}
        </select>
      </Card>

      <Card title={t.accent_title} action={<Palette size={18} className="text-muted" />}>
        <p className="text-[13px] text-muted -mt-1 mb-4">{t.accent_desc}</p>
        <div className="flex gap-2.5 flex-wrap">
          {ACCENT_SWATCHES.map(swatch => {
            const isActive = accent === swatch.rgb;
            return (
              <button
                key={swatch.id}
                onClick={() => setAccent(swatch.rgb)}
                style={{ backgroundColor: `rgb(${swatch.rgb})` }}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 shrink-0"
              >
                {isActive && <Check size={16} className="text-white" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title={t.logo_title} action={<ImagePlus size={18} className="text-muted" />}>
        <p className="text-[13px] text-muted -mt-1 mb-4">{t.logo_desc}</p>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
              : <span className="font-display font-black text-[12px] tracking-[0.15em] text-muted">TRACE</span>}
          </div>
          <div className="flex items-center gap-2">
            <label className="px-4 py-2 bg-card border border-border text-text text-[12px] font-semibold rounded-lg hover:bg-card-hover transition-colors cursor-pointer flex items-center gap-2">
              {logoUploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
              {logoUploading ? t.logo_uploading : logoUrl ? t.logo_change : t.logo_upload}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={logoUploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ''; }}
              />
            </label>
            {logoUrl && (
              <button
                onClick={() => setLogoUrl(null)}
                className="px-3 py-2 text-danger text-[12px] font-semibold rounded-lg hover:bg-danger/8 transition-colors flex items-center gap-1.5"
              >
                <X size={13} />
                {t.logo_remove}
              </button>
            )}
          </div>
        </div>
      </Card>

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
                        {!isPoster && <option value="financial_summary">{t.financial_summary_label}</option>}
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
    </div>
  );
};
