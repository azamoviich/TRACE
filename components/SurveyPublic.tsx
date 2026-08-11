import React, { useState, useEffect } from 'react';
import { CheckCircle2, RefreshCw, AlertCircle, Star, Send } from 'lucide-react';
import { fetchSurveyPublic, submitSurveyPublic, SurveyPublicData } from '../services/traceApi';

// Standalone public survey page, reached at "{tenant-subdomain}/survey/:slug"
// — no login, no PIN, no department context (see getSurveySlugFromPath).
// Renders top-to-bottom, one submit button, no per-question autosave (this
// is a short one-off form, not an ongoing checklist).
export const SurveyPublic: React.FC<{ slug: string }> = ({ slug }) => {
  const [phase, setPhase] = useState<'loading' | 'form' | 'submitting' | 'done' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SurveyPublicData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});

  useEffect(() => {
    document.documentElement.classList.toggle(
      'dark',
      localStorage.getItem('trace_theme') === 'dark' ||
      (!localStorage.getItem('trace_theme') && window.matchMedia?.('(prefers-color-scheme: dark)').matches),
    );
  }, []);

  useEffect(() => {
    fetchSurveyPublic(slug)
      .then(d => { setData(d); setPhase('form'); })
      .catch((e: Error) => { setError(e.message); setPhase('error'); });
  }, [slug]);

  const handleSubmit = async () => {
    setPhase('submitting');
    try {
      await submitSurveyPublic(slug, answers);
      setPhase('done');
    } catch (e: any) {
      setError(e.message ?? 'Error');
      setPhase('form');
    }
  };

  if (phase === 'loading') {
    return <div className="min-h-screen bg-background flex items-center justify-center"><RefreshCw size={22} className="text-muted animate-spin" /></div>;
  }

  if (phase === 'error' || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle size={28} className="text-danger mx-auto mb-3" />
          <p className="text-[13px] text-muted">{error ?? 'Not found'}</p>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center animate-fade-in">
          <CheckCircle2 size={40} className="text-success mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-text">Спасибо за ответы!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-8 pb-16 px-4">
      <div className="max-w-[480px] mx-auto animate-fade-in">
        <div className="text-[11px] uppercase tracking-[0.15em] text-muted font-semibold mb-2">{data.tenantName}</div>
        <h1 className="font-display text-[24px] font-bold text-text tracking-tight leading-tight mb-6">{data.name}</h1>

        <div className="space-y-4">
          {data.questions.map(q => (
            <div key={q.id} className="glass rounded-2xl p-4">
              <p className="text-[13px] font-medium text-text mb-3">{q.text}</p>

              {q.question_type === 'text' && (
                <textarea
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => setAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                  rows={2}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary resize-none"
                />
              )}

              {q.question_type === 'single_choice' && (
                <div className="flex flex-wrap gap-1.5">
                  {(q.options ?? []).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAnswers(p => ({ ...p, [q.id]: opt }))}
                      className={`text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors ${answers[q.id] === opt ? 'bg-primary text-white border-primary' : 'bg-background border-border text-muted hover:text-text'}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {q.question_type === 'multi_choice' && (
                <div className="flex flex-wrap gap-1.5">
                  {(q.options ?? []).map(opt => {
                    const selected = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setAnswers(p => {
                          const current = Array.isArray(p[q.id]) ? [...(p[q.id] as string[])] : [];
                          const idx = current.indexOf(opt);
                          if (idx >= 0) current.splice(idx, 1); else current.push(opt);
                          return { ...p, [q.id]: current };
                        })}
                        className={`text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors ${selected ? 'bg-primary text-white border-primary' : 'bg-background border-border text-muted hover:text-text'}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {q.question_type === 'rating' && (
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setAnswers(p => ({ ...p, [q.id]: n }))} className="p-1">
                      <Star size={24} className={typeof answers[q.id] === 'number' && (answers[q.id] as number) >= n ? 'text-amber-500 fill-amber-500' : 'text-muted'} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-[12px] text-danger mt-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={phase === 'submitting'}
          className="w-full mt-5 flex items-center justify-center gap-2 py-3 bg-primary text-white text-[14px] font-semibold rounded-2xl hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {phase === 'submitting' ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
          Отправить
        </button>
      </div>
    </div>
  );
};
