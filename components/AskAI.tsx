import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, X, Trash2, Zap, ChevronRight } from 'lucide-react';
import { ChatMessage, Language } from '../types';
import { TRANSLATIONS, tr } from '../constants';
import { traceApi } from '../services/traceApi';

interface AskAIProps {
  context: string;
  lang: Language;
  isOpen?: boolean;
  onClose?: () => void;
}

const chatHistoryStore: Record<string, ChatMessage[]> = {};

const QUICK_PROMPTS: Record<string, { ru: string; en: string; uz: string }[]> = {
  default: [
    { ru: 'Что улучшить сегодня?', en: 'What to improve today?', uz: 'Bugun nimani yaxshilash kerak?' },
    { ru: 'Покажи аномалии в данных', en: 'Show data anomalies', uz: 'Ma\'lumotlardagi anomaliyalarni ko\'rsat' },
    { ru: 'Дай топ-3 рекомендации', en: 'Give top 3 recommendations', uz: 'Top-3 tavsiyani ber' },
  ],
  Продажи: [
    { ru: 'Какое блюдо продвигать прямо сейчас?', en: 'Which dish to push right now?', uz: 'Hozir qaysi taomni ilgari surish kerak?' },
    { ru: 'Что убрать из меню (группа C)?', en: 'What to cut from menu (C-items)?', uz: 'Menyudan nimani olib tashlash kerak?' },
    { ru: 'Когда пиковые часы и как их усилить?', en: 'What are peak hours and how to boost them?', uz: 'Eng band soatlar qachon va ularni qanday kuchaytirish?' },
  ],
  Sales: [
    { ru: 'Какое блюдо продвигать?', en: 'Which dish to push right now?', uz: 'Hozir qaysi taomni ilgari surish kerak?' },
    { ru: 'Что убрать из меню (группа C)?', en: 'What to cut from menu?', uz: 'Menyudan nimani olib tashlash kerak?' },
    { ru: 'Анализ пиковых часов', en: 'Peak hours analysis', uz: 'Eng band soatlar tahlili' },
  ],
  Операции: [
    { ru: 'Кто из официантов отстаёт и почему?', en: 'Which waiter is underperforming and why?', uz: 'Qaysi ofitsiant orqada qolmoqda?' },
    { ru: 'Что в стоп-листе ударит по выручке?', en: 'What in stop-list hurts revenue?', uz: 'Stop-listdagi nima daromadga ta\'sir qiladi?' },
    { ru: 'Как улучшить скорость обслуживания?', en: 'How to improve service speed?', uz: 'Xizmat tezligini qanday yaxshilash?' },
  ],
  Operations: [
    { ru: 'Кто отстаёт из официантов?', en: 'Which waiter is underperforming?', uz: 'Qaysi ofitsiant orqada qolmoqda?' },
    { ru: 'Что в стоп-листе ударит по выручке?', en: 'Stop-list revenue impact?', uz: 'Stop-listning daromadga ta\'siri?' },
    { ru: 'Рекомендации по смене', en: 'Shift recommendations', uz: 'Smena bo\'yicha tavsiyalar' },
  ],
  Финансы: [
    { ru: 'Где теряем деньги?', en: 'Where are we losing money?', uz: 'Biz qayerda pul yo\'qotmoqdamiz?' },
    { ru: 'Food cost высокий — что делать?', en: 'High food cost — what to do?', uz: 'Food cost yuqori — nima qilish kerak?' },
    { ru: 'Прогноз прибыли на следующий месяц', en: 'Profit forecast next month', uz: 'Keyingi oy uchun foyda prognozi' },
  ],
  Financial: [
    { ru: 'Где теряем деньги?', en: 'Where are we losing money?', uz: 'Qayerda pul yo\'qotmoqdamiz?' },
    { ru: 'Как снизить food cost?', en: 'How to reduce food cost?', uz: 'Food costni qanday kamaytirish?' },
    { ru: 'Прогноз следующего месяца', en: 'Next month forecast', uz: 'Keyingi oy prognozi' },
  ],
  Дашборд: [
    { ru: 'Объясни сегодняшний тренд', en: 'Explain today\'s trend', uz: 'Bugungi tendentsiyani tushuntir' },
    { ru: 'Что ожидать к концу дня?', en: 'What to expect by end of day?', uz: 'Kun oxiriga nima kutish kerak?' },
    { ru: 'Топ-3 действия прямо сейчас', en: 'Top 3 actions right now', uz: 'Hozir amalga oshiriladigan top-3 harakatlar' },
  ],
  Reviews: [
    { ru: 'Что чаще всего критикуют?', en: 'What are the top complaints?', uz: 'Ko\'p shikoyat qilinadigan narsalar?' },
    { ru: 'Как улучшить рейтинг?', en: 'How to improve rating?', uz: 'Reytingni qanday yaxshilash?' },
    { ru: 'Напиши шаблон ответа на негатив', en: 'Write a reply template for negative reviews', uz: 'Salbiy sharhlarga javob shabloni yoz' },
  ],
  'Branch Comparison': [
    { ru: 'Какой филиал растёт быстрее?', en: 'Which branch is growing faster?', uz: 'Qaysi filial tezroq o\'smoqda?' },
    { ru: 'Почему средний чек отличается между филиалами?', en: 'Why does avg check differ between branches?', uz: 'Nima uchun o\'rtacha chek filiallarda farq qiladi?' },
    { ru: 'Что слабый филиал может взять у сильного?', en: 'What can the weaker branch learn from the stronger?', uz: 'Zaif filial quchlidan nima olishi mumkin?' },
  ],
  'Filiallarni taqqoslash': [
    { ru: 'Какой филиал растёт быстрее?', en: 'Which branch is growing faster?', uz: 'Qaysi filial tezroq o\'smoqda?' },
    { ru: 'Почему средний чек отличается?', en: 'Why does avg check differ?', uz: 'Nima uchun o\'rtacha chek farq qiladi?' },
    { ru: 'Топ-3 действия для отстающего филиала', en: 'Top 3 actions for the lagging branch', uz: 'Orqada qolgan filial uchun top-3 harakat' },
  ],
  'Сравнение филиалов': [
    { ru: 'Какой филиал растёт быстрее?', en: 'Which branch is growing faster?', uz: 'Qaysi filial tezroq o\'smoqda?' },
    { ru: 'Что объясняет разницу в выручке?', en: 'What explains the revenue gap?', uz: 'Tushum farqini nima tushuntiradi?' },
    { ru: 'Что сделать отстающему филиалу прямо сейчас?', en: 'What should the lagging branch do right now?', uz: 'Orqada qolgan filial hozir nima qilishi kerak?' },
  ],
};

function getPrompts(context: string, lang: Language) {
  const key = Object.keys(QUICK_PROMPTS).find(k => context.includes(k));
  return (key ? QUICK_PROMPTS[key] : QUICK_PROMPTS.default).slice(0, 3);
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>')
    .replace(/^[-•] (.+)$/gm, '<span style="display:flex;gap:6px"><span style="color:#ff6b35;flex-shrink:0">•</span><span>$1</span></span>')
    .replace(/^\d+\. (.+)$/gm, (_, p) => `<span style="display:flex;gap:6px"><span style="color:#ff6b35;flex-shrink:0">→</span><span>${p}</span></span>`)
    .replace(/\n/g, '<br/>');
}

export const AskAI: React.FC<AskAIProps> = ({ context, lang, isOpen: isOpenProp, onClose }) => {
  const [isOpenLocal, setIsOpenLocal] = useState(false);
  const controlled = isOpenProp !== undefined;
  const isOpen = controlled ? isOpenProp : isOpenLocal;
  const setIsOpen = controlled
    ? (v: boolean) => { if (!v) onClose?.(); }
    : setIsOpenLocal;
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showPrompts, setShowPrompts] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    if (chatHistoryStore[context]) {
      setMessages(chatHistoryStore[context]);
      setShowPrompts(chatHistoryStore[context].length <= 1);
    } else {
      const welcome: ChatMessage = {
        id: 'welcome',
        role: 'ai',
        text: lang === 'ru'
          ? `Анализирую раздел **${context}**. Что вас интересует?`
          : `Analyzing **${context}**. What would you like to know?`,
        timestamp: new Date()
      };
      setMessages([welcome]);
      chatHistoryStore[context] = [welcome];
      setShowPrompts(true);
    }
  }, [context, lang]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text,
      timestamp: new Date()
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    chatHistoryStore[context] = newHistory;
    setQuery('');
    setIsLoading(true);
    setShowPrompts(false);

    traceApi.ai.chat(context, newHistory, lang)
      .then(({ text }) => {
        const aiResponse: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          text,
          timestamp: new Date()
        };
        const updated = [...newHistory, aiResponse];
        setMessages(updated);
        chatHistoryStore[context] = updated;
      })
      .catch((err: any) => {
        const isLimitReached = String(err?.message ?? '').startsWith('429');
        const fallback: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          text: isLimitReached
            ? tr(lang, 'Лимит сообщений достигнут (5 за 2 часа на тарифе Base). Обновите план до Pro для безлимитного чата.', 'Message limit reached (5 per 2 hours on the Base plan). Upgrade to Pro for unlimited chat.', "Xabarlar chegarasiga yetdingiz (Base rejada 2 soatda 5 ta). Cheksiz chat uchun Pro rejaga o'ting.")
            : tr(lang, 'Ошибка соединения. Попробуйте позже.', 'Connection error. Please try again.', 'Ulanish xatosi. Keyinroq urinib ko\'ring.'),
          timestamp: new Date()
        };
        const updated = [...newHistory, fallback];
        setMessages(updated);
        chatHistoryStore[context] = updated;
      })
      .finally(() => setIsLoading(false));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(query);
  };

  const clearHistory = () => {
    const welcome: ChatMessage = {
      id: Date.now().toString(),
      role: 'ai',
      text: tr(lang, 'История очищена. Готов помочь.', 'History cleared. Ready to help.', 'Tarix tozalandi. Yordam berishga tayyorman.'),
      timestamp: new Date()
    };
    setMessages([welcome]);
    chatHistoryStore[context] = [welcome];
    setShowPrompts(true);
  };

  const prompts = getPrompts(context, lang);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  const renderText = renderMarkdown;

  return (
    <div className="fixed bottom-0 right-0 sm:right-4 z-50 flex flex-col items-end">

      {/* Trigger button — only shown when not controlled from outside (TopNav) */}
      {!isOpen && !controlled && (
        <button
          onClick={() => setIsOpen(true)}
          className="mb-4 group relative flex items-center gap-2.5 px-4 h-12 bg-[#111] border border-[#2a2a2a] hover:border-primary/40 rounded-full shadow-xl shadow-black/40 transition-all duration-200 hover:shadow-primary/10"
        >
          {/* Glow pulse */}
          <span className="absolute inset-0 rounded-full bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="relative w-5 h-5 flex items-center justify-center">
            <Sparkles size={16} className="text-primary" />
          </span>
          <span className="relative text-[12px] font-semibold text-white tracking-wide">Ask AI</span>
          <span className="relative flex items-center gap-1 pl-2 border-l border-[#2a2a2a]">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] text-success font-medium">Live</span>
          </span>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          className="w-full sm:w-[380px] md:w-[420px] bg-[#0e0e0e] border border-[#222] rounded-t-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
          style={{ height: 560 }}
        >
          {/* Header */}
          <div className="relative flex-shrink-0 px-4 py-3.5 border-b border-[#1e1e1e]"
            style={{ background: 'linear-gradient(135deg, #111 0%, #0d0d0d 100%)' }}>
            {/* Subtle top accent line */}
            <div className="absolute top-0 left-0 right-0 h-[1px]"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255,107,53,0.5) 50%, transparent)' }} />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* AI Avatar */}
                <div className="relative w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(255,107,53,0.15), rgba(255,107,53,0.05))' }}>
                  <div className="absolute inset-0 rounded-xl border border-primary/20" />
                  <Sparkles size={16} className="text-primary" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-[#0e0e0e]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13px] font-bold text-white tracking-wide">TRACE AI</h3>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase tracking-wider">Beta</span>
                  </div>
                  <p className="text-[10px] text-[#9a9a9a] mt-0.5 truncate max-w-[180px]">{context}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearHistory}
                  className="p-2 text-[#8a8a8a] hover:text-white rounded-lg hover:bg-[#1a1a1a] transition-colors"
                  title="Clear"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-[#8a8a8a] hover:text-white rounded-lg hover:bg-[#1a1a1a] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar"
            style={{ background: '#080808' }}>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'ai' && (
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.15)' }}>
                    <Zap size={11} className="text-primary" />
                  </div>
                )}
                <div className={`flex flex-col gap-1 max-w-[82%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`px-3.5 py-2.5 rounded-xl text-[12.5px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'text-white rounded-tr-sm'
                        : 'text-[#ccc] rounded-tl-sm border border-[#1e1e1e]'
                    }`}
                    style={msg.role === 'user'
                      ? { background: 'linear-gradient(135deg, #ff6b35, #e85a25)' }
                      : { background: '#111' }
                    }
                    dangerouslySetInnerHTML={{ __html: renderText(msg.text) }}
                  />
                  <span className="text-[9px] text-[#8a8a8a] px-1">{formatTime(new Date(msg.timestamp))}</span>
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-lg bg-[#1c1c1c] border border-[#2a2a2a] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[9px] font-bold text-[#666]">U</span>
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.15)' }}>
                  <Zap size={11} className="text-primary" />
                </div>
                <div className="px-4 py-3 rounded-xl rounded-tl-sm border border-[#1e1e1e]" style={{ background: '#111' }}>
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-primary/60"
                        style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Quick prompts */}
            {showPrompts && !isLoading && (
              <div className="pt-2">
                <p className="text-[10px] text-[#8a8a8a] uppercase tracking-widest mb-2 px-1">Suggested</p>
                <div className="flex flex-col gap-1.5">
                  {prompts.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(tr(lang, p.ru, p.en, p.uz))}
                      className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-[12px] text-[#888] hover:text-white border border-[#1e1e1e] hover:border-primary/25 transition-all duration-150 text-left group"
                      style={{ background: '#0d0d0d' }}
                    >
                      <span>{tr(lang, p.ru, p.en, p.uz)}</span>
                      <ChevronRight size={12} className="flex-shrink-0 text-[#8a8a8a] group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 p-3 border-t border-[#161616]" style={{ background: '#0e0e0e' }}>
            <form onSubmit={handleSubmit}>
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[#1e1e1e] hover:border-[#2a2a2a] focus-within:border-primary/30 transition-colors"
                style={{ background: '#080808' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.aiPlaceholder || tr(lang, 'Спросите AI...', 'Ask AI...', 'AI-dan so\'rang...')}
                  className="flex-1 bg-transparent text-[13px] text-white placeholder-[#8a8a8a] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!query.trim() || isLoading}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 disabled:opacity-30 flex-shrink-0"
                  style={query.trim() && !isLoading
                    ? { background: 'linear-gradient(135deg, #ff6b35, #e85a25)', boxShadow: '0 0 12px rgba(255,107,53,0.3)' }
                    : { background: '#1a1a1a' }
                  }
                >
                  <Send size={13} className="text-white" />
                </button>
              </div>
            </form>
            <p className="text-center text-[9px] text-[#252525] mt-2 tracking-wider">TRACE AI · Powered by Claude</p>
          </div>
        </div>
      )}
    </div>
  );
};

