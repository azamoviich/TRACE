import React, { useState } from 'react';
import { Language } from '../../types';
import { isDemoTenant, getTenantRole } from '../../services/traceApi';
import { HallLayoutEditor } from '../booking/HallLayoutEditor';
import { BookingSettingsPanel } from '../booking/BookingSettingsPanel';
import { HostessPanel } from '../booking/HostessPanel';
import { StaffTelegramCard } from '../booking/StaffTelegramCard';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

// "Бронирование" section: the hostess panel (live map, timeline, guests),
// the floor-plan editor and booking settings.
type Tab = 'live' | 'layout' | 'settings' | 'telegram';

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
      { id: 'settings' as Tab, label: tr(lang, 'Настройки', 'Settings', 'Sozlamalar') },
    ]),
  ];

  return (
    <div className="space-y-4">
      {tabs.length > 1 && <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-primary text-white' : 'bg-card text-muted hover:text-text'}`}
          >
            {t.label}
          </button>
        ))}
      </div>}

      {isDemoTenant() && (
        <p className="text-[12px] text-muted">{tr(lang,
          'Демо работает по-настоящему: забронируйте стол на book-demo.trace-os.uz — бронь появится здесь и в Telegram. Данные общие для всех и обновляются каждую ночь.',
          'The demo is live: book a table at book-demo.trace-os.uz — it shows up here and in Telegram. Data is shared and reset every night.',
          'Demo haqiqiy ishlaydi: book-demo.trace-os.uz da stol band qiling — bron shu yerda va Telegram’da paydo bo‘ladi. Ma’lumotlar umumiy va har kecha yangilanadi.')}</p>
      )}

      {tab === 'live' && <HostessPanel lang={lang} onShowToast={onShowToast} />}
      {tab === 'layout' && !isHostess && <HallLayoutEditor lang={lang} onShowToast={onShowToast} />}
      {tab === 'settings' && !isHostess && <BookingSettingsPanel lang={lang} onShowToast={onShowToast} />}
      {tab === 'telegram' && isHostess && <StaffTelegramCard lang={lang} onShowToast={onShowToast} canManage={false} />}
    </div>
  );
}
