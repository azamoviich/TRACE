import React, { useEffect, useState } from 'react';
import { X, Share, Plus, MoreVertical, Download } from 'lucide-react';
import { Language } from '../types';

type Platform = 'ios' | 'android' | null;

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /Android/.test(ua);
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return null;
}

function isInStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

const STORAGE_KEY = 'trace_pwa_dismissed';

interface Props {
  lang: Language;
}

export const PWAInstallGuide: React.FC<Props> = ({ lang }) => {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) return;
    if (isInStandaloneMode()) return;

    const p = detectPlatform();
    setPlatform(p);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Show after 8s delay — don't interrupt first load
    const timer = setTimeout(() => {
      if (p === 'ios' || p === 'android') setVisible(true);
    }, 8000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  const handleAndroidInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') dismiss();
    }
  };

  if (!visible) return null;

  const ru = lang === 'ru';
  const isUz = lang === 'uz';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] animate-slide-up"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div
        className="mx-3 mb-3 rounded-2xl border border-border overflow-hidden"
        style={{ background: '#111111', boxShadow: '0 -4px 40px rgba(0,0,0,0.7)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <img src="/trace-logo.png" alt="TRACE" className="w-10 h-10 rounded-xl object-cover" />
            <div>
              <div className="text-[13px] font-semibold text-text">TRACE</div>
              <div className="text-[11px] text-muted">
                {ru ? 'Добавить на главный экран' : isUz ? 'Asosiy ekranga qo\'shish' : 'Add to Home Screen'}
              </div>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-muted hover:text-text p-1.5 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="h-px bg-border mx-4" />

        {platform === 'ios' && (
          <div className="px-4 py-4">
            <p className="text-[12px] text-muted mb-4">
              {ru
                ? 'Откройте TRACE как приложение — без браузера, с иконкой на экране.'
                : isUz
                ? 'TRACE-ni ilova sifatida oching — brauzersiz, ekranda belgi bilan.'
                : 'Open TRACE as an app — no browser bar, icon on your screen.'}
            </p>
            <div className="space-y-3">
              <Step n={1} icon={<Share size={15} />} color="#007AFF">
                {ru ? (
                  <>Нажмите <b className="text-text">«Поделиться»</b> (иконка со стрелкой вверх) внизу Safari</>
                ) : isUz ? (
                  <>Safari pastidagi <b className="text-text">«Ulashish»</b> tugmasini (yuqoriga o'q) bosing</>
                ) : (
                  <>Tap the <b className="text-text">Share</b> button (arrow up) at the bottom of Safari</>
                )}
              </Step>
              <Step n={2} icon={<Plus size={15} />} color="#34C759">
                {ru ? (
                  <>Прокрутите вниз и выберите <b className="text-text">«На экран "Домой"»</b></>
                ) : isUz ? (
                  <>Pastga aylantirib <b className="text-text">«Bosh ekranga qo'shish»</b>ni tanlang</>
                ) : (
                  <>Scroll down and tap <b className="text-text">«Add to Home Screen»</b></>
                )}
              </Step>
              <Step n={3} icon={<span className="text-[13px]">✓</span>} color="#ff6b35">
                {ru ? (
                  <>Нажмите <b className="text-text">«Добавить»</b> — готово!</>
                ) : isUz ? (
                  <>«<b className="text-text">Qo'shish</b>»ni bosing — tayyor!</>
                ) : (
                  <>Tap <b className="text-text">«Add»</b> — done!</>
                )}
              </Step>
            </div>
          </div>
        )}

        {platform === 'android' && (
          <div className="px-4 py-4">
            <p className="text-[12px] text-muted mb-4">
              {ru
                ? 'Установите TRACE как приложение одним нажатием.'
                : isUz
                ? 'TRACE-ni bir bosishda ilova sifatida o\'rnating.'
                : 'Install TRACE as an app with one tap.'}
            </p>
            {deferredPrompt ? (
              <button
                onClick={handleAndroidInstall}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold text-white transition-all active:scale-[0.98]"
                style={{ background: '#ff6b35' }}
              >
                <Download size={15} />
                {ru ? 'Установить TRACE' : isUz ? "TRACE-ni o'rnatish" : 'Install TRACE'}
              </button>
            ) : (
              <div className="space-y-3">
                <Step n={1} icon={<MoreVertical size={15} />} color="#007AFF">
                  {ru ? (
                    <>Нажмите <b className="text-text">⋮</b> (меню браузера) в правом верхнем углу</>
                  ) : isUz ? (
                    <>Yuqori o'ng burchakdagi <b className="text-text">⋮</b> (brauzer menyusi) tugmasini bosing</>
                  ) : (
                    <>Tap <b className="text-text">⋮</b> (browser menu) in the top right</>
                  )}
                </Step>
                <Step n={2} icon={<Plus size={15} />} color="#34C759">
                  {ru ? (
                    <>Выберите <b className="text-text">«Добавить на главный экран»</b></>
                  ) : isUz ? (
                    <>«<b className="text-text">Bosh ekranga qo'shish</b>»ni tanlang</>
                  ) : (
                    <>Select <b className="text-text">«Add to Home Screen»</b></>
                  )}
                </Step>
              </div>
            )}
          </div>
        )}

        <div className="px-4 pb-4">
          <button
            onClick={dismiss}
            className="w-full py-2.5 text-[12px] text-muted hover:text-text transition-colors"
          >
            {ru ? 'Не сейчас' : isUz ? 'Hozir emas' : 'Not now'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Step: React.FC<{
  n: number;
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
}> = ({ n, icon, color, children }) => (
  <div className="flex items-start gap-3">
    <div
      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-white"
      style={{ background: color + '22', color }}
    >
      {icon}
    </div>
    <div className="flex-1 text-[12px] text-muted leading-relaxed pt-1">{children}</div>
  </div>
);
