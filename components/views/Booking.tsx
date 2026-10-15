import React, { useState } from 'react';
import { Language } from '../../types';
import { isDemoTenant, getTenantRole } from '../../services/traceApi';
import { HallLayoutEditor } from '../booking/HallLayoutEditor';
import { BookingSettingsPanel } from '../booking/BookingSettingsPanel';
import { HostessPanel } from '../booking/HostessPanel';
import { StaffTelegramCard } from '../booking/StaffTelegramCard';
import { BookingReport } from '../booking/BookingReport';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

// "Бронирование" section: the hostess panel (live map, timeline, guests),
// the floor-plan editor, the owner's report and booking settings.
type Tab = 'live' | 'layout' | 'report' | 'settings' | 'telegram';

interface Props {
  lang: Language;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function Booking({ lang, onShowToast }: Props) {
  const [tab, setTab] = useState<Tab>('live');
  const isHostess = getTenantRole() === 'hostess';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'live', label: tr(lang, 'Хостес', 'Hostess', 'Xostes') },
    // Floor editor and settings are owner/manager-only (the API refuses hostess writes anyway).
    // The hostess has no settings tab — she connects her Telegram here.
    ...(isHostess ? [{ id: 'telegram' as Tab, label: 'Telegram' }] : [
      { id: 'layout' as Tab, label: tr(lang, 'Схема зала', 'Floor plan', 'Zal sxemasi') },
      { id: 'report' as Tab, label: tr(lang, 'Отчёт', 'Report', 'Hisobot') },
      { id: 'settings' as Tab, label: tr(lang, 'Настройки', 'Settings', 'Sozlamalar') },
    ]),
  ];

  const sub: Record<Tab, string> = {
    live: tr(lang, 'Живая карта зала, таймлайн и гости. Брони с сайта приходят сюда и в Telegram.', 'Live floor map, timeline and guests. Online bookings arrive here and in Telegram.', "Jonli zal xaritasi, vaqt jadvali va mehmonlar. Saytdagi bronlar shu yerga va Telegram'ga keladi."),
    layout: tr(lang, 'Столы, места и залы, которые видят хостес и гости.', 'Tables, seats and halls that hostesses and guests see.', "Xostes va mehmonlar ko'radigan stollar, o'rinlar va zallar."),
    report: tr(lang, 'Сколько броней, откуда они и какие столы загружены.', 'How many bookings, where they come from and which tables are busy.', "Qancha bron, qayerdan va qaysi stollar band."),
    settings: tr(lang, 'Часы, длительность брони и уведомления.', 'Hours, booking length and notifications.', 'Ish vaqti, bron davomiyligi va bildirishnomalar.'),
    telegram: tr(lang, 'Уведомления о бронях в Telegram.', 'Booking notifications in Telegram.', "Telegram'da bron bildirishnomalari."),
  };

  return (
    <>
      <div className="page-head rise">
        <div>
          <h1>{tr(lang, 'Бронирование', 'Bookings', 'Bron qilish')}</h1>
          <div className="sub"><span>{sub[tab]}</span></div>
        </div>
      </div>

      {tabs.length > 1 && <div className="tabs" role="tablist">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>}

      <div className="bk space-y-4">
      {isDemoTenant() && (
        <p className="bk-note">{tr(lang,
          'Демо работает по-настоящему: забронируйте стол на book-demo.trace-os.uz — бронь появится здесь и в Telegram. Данные общие для всех и обновляются каждую ночь.',
          'The demo is live: book a table at book-demo.trace-os.uz — it shows up here and in Telegram. Data is shared and reset every night.',
          'Demo haqiqiy ishlaydi: book-demo.trace-os.uz da stol band qiling — bron shu yerda va Telegram’da paydo bo‘ladi. Ma’lumotlar umumiy va har kecha yangilanadi.')}</p>
      )}

      {tab === 'live' && <HostessPanel lang={lang} onShowToast={onShowToast} />}
      {tab === 'layout' && !isHostess && <HallLayoutEditor lang={lang} onShowToast={onShowToast} />}
      {tab === 'report' && !isHostess && <BookingReport lang={lang} />}
      {tab === 'settings' && !isHostess && <BookingSettingsPanel lang={lang} onShowToast={onShowToast} />}
      {tab === 'telegram' && isHostess && <StaffTelegramCard lang={lang} onShowToast={onShowToast} canManage={false} />}
      </div>
    </>
  );
}
