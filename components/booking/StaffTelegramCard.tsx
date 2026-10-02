import React, { useEffect, useState } from 'react';
import { Loader2, Send, Users, User, Trash2, RefreshCw } from 'lucide-react';
import { Language } from '../../types';
import { bookingApi, StaffTelegramChat } from '../../services/traceApi';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

type Toast = (message: string, type: 'success' | 'error' | 'info') => void;

// Booking notices in Telegram for the restaurant (the staff bot): the
// hostess's private chat and the restaurant group get new / changed /
// cancelled bookings. The hostess can connect herself; removing a chat is
// for the owner/manager (canManage).
export function StaffTelegramCard({ lang, onShowToast, canManage }: { lang: Language; onShowToast: Toast; canManage: boolean }) {
  const [state, setState] = useState<{ configured: boolean; chats: StaffTelegramChat[] } | null>(null);
  const [links, setLinks] = useState<{ private: string; group: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => bookingApi.staffTelegram.get().then(setState).catch(e => onShowToast((e as Error).message, 'error'));

  useEffect(() => {
    load();
    // Back from Telegram → show the chat that was just connected.
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const makeLinks = async () => {
    setBusy(true);
    try {
      setLinks(await bookingApi.staffTelegram.link());
    } catch (e) {
      onShowToast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: StaffTelegramChat) => {
    if (!window.confirm(tr(lang, `Отключить «${c.title}» от уведомлений?`, `Disconnect "${c.title}"?`, `«${c.title}» xabarnomalardan uzilsinmi?`))) return;
    try {
      await bookingApi.staffTelegram.remove(c.chat_id);
      load();
    } catch (e) {
      onShowToast((e as Error).message, 'error');
    }
  };

  if (!state) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 max-w-[720px]">
      <div>
        <p className="text-[14px] font-semibold text-text">{tr(lang, 'Уведомления о бронях в Telegram', 'Booking notices in Telegram', 'Bronlar haqida Telegram xabarnomalari')}</p>
        <p className="text-[12px] text-muted">{tr(lang,
          'Новые, изменённые и отменённые брони приходят хостес в личку и в группу ресторана. Неподтверждённую бронь можно подтвердить или отклонить прямо в Telegram.',
          'New, changed and cancelled bookings go to the hostess’s private chat and the restaurant group. A pending booking can be confirmed or declined right in Telegram.',
          'Yangi, o‘zgargan va bekor qilingan bronlar xostesga shaxsiy chatga va restoran guruhiga keladi. Tasdiqlanmagan bronni Telegram’da tasdiqlash yoki rad etish mumkin.')}</p>
      </div>

      {!state.configured ? (
        <p className="text-[12px] text-amber-500">{tr(lang, 'Бот для персонала ещё не настроен на сервере.', 'The staff bot is not set up on the server yet.', 'Xodimlar boti serverda hali sozlanmagan.')}</p>
      ) : (
        <>
          {state.chats.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {state.chats.map(c => (
                <li key={c.chat_id} className="flex items-center gap-2 px-3 py-2">
                  {c.kind === 'group' ? <Users size={14} className="text-muted shrink-0" /> : <User size={14} className="text-muted shrink-0" />}
                  <span className="text-[13px] text-text flex-1 min-w-0 truncate">{c.title}</span>
                  <span className="text-[11px] text-muted">{c.kind === 'group' ? tr(lang, 'группа', 'group', 'guruh') : tr(lang, 'личка', 'private', 'shaxsiy')}</span>
                  {canManage && (
                    <button onClick={() => remove(c)} title={tr(lang, 'Отключить', 'Disconnect', 'Uzish')} className="p-1 text-muted hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!links ? (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={makeLinks} disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-semibold disabled:opacity-40">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {tr(lang, 'Подключить Telegram', 'Connect Telegram', 'Telegram’ni ulash')}
              </button>
              <button onClick={load} title={tr(lang, 'Обновить', 'Refresh', 'Yangilash')} className="p-2 rounded-xl border border-border text-muted"><RefreshCw size={14} /></button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <a href={links.private} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => setLinks(null), 500)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-semibold">
                  <User size={14} />{tr(lang, 'В мой личный чат', 'To my private chat', 'Shaxsiy chatimga')}
                </a>
                <a href={links.group} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => setLinks(null), 500)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-text text-[13px] font-semibold">
                  <Users size={14} />{tr(lang, 'Добавить в группу', 'Add to a group', 'Guruhga qo‘shish')}
                </a>
              </div>
              <p className="text-[12px] text-muted">{tr(lang,
                'Личный чат: в Telegram нажмите «Старт». Группа: выберите группу ресторана и подтвердите добавление бота. Ссылка одноразовая и действует 1 час.',
                'Private chat: tap "Start" in Telegram. Group: pick the restaurant group and confirm adding the bot. The link works once, for 1 hour.',
                'Shaxsiy chat: Telegram’da «Start» ni bosing. Guruh: restoran guruhini tanlang va botni qo‘shishni tasdiqlang. Havola bir martalik, 1 soat amal qiladi.')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
