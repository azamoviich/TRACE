import React, { useState } from 'react';
import { Language } from '../../types';
import { isDemoTenant, getTenantRole } from '../../services/traceApi';
import { HallLayoutEditor } from '../booking/HallLayoutEditor';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

// "Бронирование" section. Phase 2 ships the floor-plan editor; the hostess
// live map, timeline and booking settings join these tabs in later phases.
type Tab = 'layout';

interface Props {
  lang: Language;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function Booking({ lang, onShowToast }: Props) {
  const [tab, setTab] = useState<Tab>('layout');
  const isHostess = getTenantRole() === 'hostess';

  if (isDemoTenant()) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-[13px] text-muted max-w-[520px] mx-auto">
        {tr(lang, 'Бронирование недоступно в демо-режиме.', 'Booking is not available in demo mode.', 'Demo rejimda band qilish mavjud emas.')}
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'layout', label: tr(lang, 'Схема зала', 'Floor plan', 'Zal sxemasi') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-primary text-white' : 'bg-card text-muted hover:text-text'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'layout' && <HallLayoutEditor lang={lang} onShowToast={onShowToast} readOnly={isHostess} />}
    </div>
  );
}
