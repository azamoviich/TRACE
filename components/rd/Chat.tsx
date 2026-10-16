// "Вопрос по данным" — TRACE-mockups mock-common.js chat: a panel under the
// top bar (bottom sheet on phones) with suggestions, and "Спросить об этом"
// under any phrase or number selected on the page, which opens the chat with
// that quote attached. Styles: styles/rd/shell.css (.chat, .sel-ask, .msg).
import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, Language, ViewState } from '../../types';
import { tr } from '../../constants';
import { traceApi } from '../../services/traceApi';
import { renderAiMarkdown } from '../../utils/aiText';

type Msg = ChatMessage & { quote?: string };
// Kept for the session so closing and reopening keeps the conversation.
let history: Msg[] = [];

const SUGG: Partial<Record<ViewState, [string, string, string][]>> = {
  dashboard: [
    ['Почему вчера выручка была больше?', 'Why was revenue higher yesterday?', 'Nega kecha tushum ko‘proq bo‘ldi?'],
    ['Кто из официантов сегодня отстаёт?', 'Which waiters are behind today?', 'Bugun qaysi ofitsiantlar orqada?'],
    ['Что чаще всего удаляют из чеков?', 'What gets voided most often?', 'Cheklardan eng ko‘p nima o‘chiriladi?'],
  ],
  sales: [
    ['Какое блюдо продвигать прямо сейчас?', 'Which dish should we push right now?', 'Hozir qaysi taomni targ‘ib qilish kerak?'],
    ['Что убрать из меню?', 'What should we cut from the menu?', 'Menyudan nimani olib tashlash kerak?'],
    ['Где фудкост выше нормы?', 'Where is food cost above normal?', 'Qayerda fudkost me’yordan yuqori?'],
  ],
  operations: [
    ['Почему столы сидят дольше обычного?', 'Why are tables staying longer than usual?', 'Nega stollar odatdagidan uzoq o‘tirmoqda?'],
    ['Сколько официантов нужно на вечер?', 'How many waiters do we need tonight?', 'Kechga nechta ofitsiant kerak?'],
    ['Что не так с удалениями сегодня?', 'What is wrong with today’s voids?', 'Bugungi o‘chirishlarda nima muammo?'],
  ],
  financial: [
    ['Куда уходит прибыль?', 'Where is the profit going?', 'Foyda qayerga ketmoqda?'],
    ['Какие списания можно сократить?', 'Which write-offs can we cut?', 'Qaysi chiqimlarni kamaytirish mumkin?'],
    ['Хватит ли денег до конца месяца?', 'Will cash last until month end?', 'Pul oy oxirigacha yetadimi?'],
  ],
};
const SUGG_DEFAULT: [string, string, string][] = [
  ['Что улучшить сегодня?', 'What should we improve today?', 'Bugun nimani yaxshilash kerak?'],
  ['Покажи необычное в данных', 'Show anything unusual in the data', 'Ma’lumotlardagi g‘ayrioddiy narsalarni ko‘rsat'],
  ['Дай три главных совета', 'Give the three main tips', 'Uchta asosiy maslahat ber'],
];

export const RdChat: React.FC<{
  open: boolean; onClose: () => void; onOpen: () => void;
  context: string; lang: Language; view: ViewState;
}> = ({ open, onClose, onOpen, context, lang, view }) => {
  const [msgs, setMsgs] = useState<Msg[]>(history);
  const [quote, setQuote] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => { history = msgs; log.current?.scrollTo({ top: log.current.scrollHeight }); }, [msgs, busy]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 150); }, [open]);

  // Outside click and Escape close the panel (the selection chip is outside but opens it).
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (panel.current?.contains(t) || t.closest('.sel-ask, .ask-bar, .rd-ask')) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open, onClose]);

  // ── Selection → "Спросить об этом" ──
  const [chip, setChip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const check = () => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim().replace(/\s+/g, ' ') : '';
      const main = document.getElementById('content');
      if (!text || text.length > 160 || !sel?.rangeCount || !main?.contains(sel.anchorNode)) { setChip(null); return; }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      setChip({ text, x: Math.min(window.innerWidth - 90, Math.max(90, r.left + r.width / 2)), y: Math.min(window.innerHeight - 50, r.bottom + 10) });
    };
    const onSel = () => { clearTimeout(t); t = setTimeout(check, 250); };
    const hide = () => setChip(null);
    document.addEventListener('selectionchange', onSel);
    window.addEventListener('scroll', hide, { passive: true });
    return () => { clearTimeout(t); document.removeEventListener('selectionchange', onSel); window.removeEventListener('scroll', hide); };
  }, []);
  const askAbout = () => {
    if (!chip) return;
    setQuote(chip.text); setChip(null); setQ('');
    window.getSelection()?.removeAllRanges();
    onOpen();
  };

  const send = (text: string) => {
    const question = text.trim() || (quote ? tr(lang, 'Объясни это', 'Explain this', 'Buni tushuntir') : '');
    if (!question || busy) return;
    const me: Msg = { id: `${Date.now()}`, role: 'user', text: quote ? `«${quote}» — ${question}` : question, timestamp: new Date(), quote: quote ?? undefined };
    const next = [...msgs, me];
    setMsgs(next); setQ(''); setQuote(null); setBusy(true);
    traceApi.ai.chat(context, next, lang)
      .then(({ text: a }) => setMsgs(m => [...m, { id: `${Date.now()}a`, role: 'ai', text: a, timestamp: new Date() }]))
      .catch((e: unknown) => {
        const limit = String((e as Error)?.message ?? '').startsWith('429');
        setMsgs(m => [...m, { id: `${Date.now()}e`, role: 'ai', timestamp: new Date(), text: limit
          ? tr(lang, 'Лимит вопросов на тарифе Base: 5 за 2 часа. На Pro без ограничений.', 'Base plan limit: 5 questions per 2 hours. Pro has no limit.', 'Base tarifida 2 soatda 5 ta savol. Pro’da cheklovsiz.')
          : tr(lang, 'Не получилось ответить. Попробуйте ещё раз.', "Couldn't answer. Try again.", "Javob berib bo'lmadi. Qayta urinib ko'ring.") }]);
      })
      .finally(() => setBusy(false));
  };

  const sugg = SUGG[view] ?? SUGG_DEFAULT;
  return (
    <>
      {chip && (
        <button type="button" className="sel-ask" style={{ left: chip.x, top: chip.y }} onMouseDown={e => e.preventDefault()} onClick={askAbout}>
          <i className="ph ph-chat-teardrop-text" aria-hidden="true" />{tr(lang, 'Спросить об этом', 'Ask about this', 'Bu haqida so‘rash')}
        </button>
      )}
      <div ref={panel} className={`chat${open ? ' on' : ''}`} role="dialog" aria-label={tr(lang, 'Вопрос по данным', 'Ask about your data', "Ma'lumotlar bo'yicha savol")} aria-hidden={!open}>
        <div className="chat-head">
          <div><b>{tr(lang, 'Вопрос по данным', 'Ask about your data', "Ma'lumotlar bo'yicha savol")}</b>
            <div className="faint">{tr(lang, 'Видит эту страницу и продажи за 8 недель', 'Sees this page and 8 weeks of sales', "Shu sahifani va 8 haftalik savdoni ko'radi")}</div></div>
          {msgs.length > 0 && <button type="button" className="chat-x" onClick={() => { setMsgs([]); history = []; }} title={tr(lang, 'Очистить', 'Clear', 'Tozalash')} aria-label={tr(lang, 'Очистить', 'Clear', 'Tozalash')}><i className="ph ph-broom" aria-hidden="true" /></button>}
          <button type="button" className="chat-x" style={msgs.length ? { marginLeft: 0 } : undefined} onClick={onClose} aria-label={tr(lang, 'Закрыть', 'Close', 'Yopish')}><i className="ph ph-x" aria-hidden="true" /></button>
        </div>
        <div className="chat-log" ref={log} aria-live="polite">
          {msgs.length === 0 && !quote && (
            <div className="sugg">{sugg.map(s => <button key={s[0]} type="button" onClick={() => send(tr(lang, ...s))}>{tr(lang, ...s)}</button>)}</div>
          )}
          {msgs.map(m => m.role === 'user' ? (
            <React.Fragment key={m.id}>
              {m.quote && <div className="chat-quote" data-label={tr(lang, 'Про выделенное', 'About the selection', 'Belgilangan haqida')}>{m.quote}</div>}
              <div className="msg me">{m.quote ? m.text.replace(`«${m.quote}» — `, '') : m.text}</div>
            </React.Fragment>
          ) : <div key={m.id} className="msg bot" dangerouslySetInnerHTML={{ __html: renderAiMarkdown(m.text) }} />)}
          {quote && <div className="chat-quote pending" data-label={tr(lang, 'Про выделенное', 'About the selection', 'Belgilangan haqida')}>{quote}</div>}
          {busy && <div className="msg bot typing">{tr(lang, 'Смотрю данные…', 'Looking at the data…', "Ma'lumotlarni ko'ryapman…")}</div>}
        </div>
        <form className="chat-form" onSubmit={e => { e.preventDefault(); send(q); }}>
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} aria-label={tr(lang, 'Вопрос', 'Question', 'Savol')}
            placeholder={quote ? tr(lang, 'Что про это узнать? Например: почему так?', 'What to ask about it? E.g. why?', 'Bu haqida nima bilmoqchisiz? Masalan: nega?') : tr(lang, 'Спросите про продажи, блюда, персонал', 'Ask about sales, dishes, staff', "Savdo, taomlar, xodimlar haqida so'rang")} />
          <button type="submit" disabled={busy} aria-label={tr(lang, 'Отправить', 'Send', 'Yuborish')}><i className="ph ph-arrow-right" aria-hidden="true" /></button>
        </form>
      </div>
    </>
  );
};
