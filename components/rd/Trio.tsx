// Three on-demand AI tools in a row: the one in use takes the row, the others
// fold into a rail (TRACE-mockups sales/operations). Styles in shell.css.
import React, { useState } from 'react';
import { Language } from '../../types';
import { tr } from '../../constants';
import { AiMeta, AiState, Skel } from './ui';

export interface TrioTile {
  key: string;
  icon: string;          // phosphor class, e.g. 'ph-tag'
  short: string;         // rail label
  title: string;
  desc: string;
  runLabel: string;
  wait: string;          // loading line
  state: AiState;
  when?: string | null;
  summary?: React.ReactNode;   // one line shown while folded
  body?: React.ReactNode;      // full result
  error?: string | null;
  locked?: string | null;      // e.g. plan restriction — replaces the button
  onRun: (force?: boolean) => void;
}

export const Trio: React.FC<{ lang: Language; tiles: TrioTile[] }> = ({ lang, tiles }) => {
  const [active, setActive] = useState<string | null>(null);
  const open = (k: string | null) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (doc.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(() => setActive(k));
    else setActive(k);
  };
  return (
    <div className="trio band rise" data-active={active ?? undefined} style={{ animationDelay: '.18s' }}>
      {tiles.map(t => (
        <section key={t.key} className={`tile${active === t.key ? ' active' : ''}`} data-tile={t.key} data-state={t.state}
          aria-labelledby={`h-${t.key}`} style={{ viewTransitionName: `tile-${t.key}` } as React.CSSProperties}>
          <button className="tile-pick" type="button" title={t.title} onClick={() => open(t.key)}>
            <i className={`ph ${t.icon}`} aria-hidden="true" /><span>{t.short}</span><i className="tile-dot" aria-hidden="true" />
          </button>
          <div className="tile-full">
            <div className="tile-head">
              <span className="tile-ico"><i className={`ph ${t.icon}`} aria-hidden="true" /></span>
              <h2 id={`h-${t.key}`}>{t.title}</h2>
              {t.state === 'done' && <AiMeta lang={lang} when={t.when} onRerun={() => t.onRun(true)} />}
              <button className="tile-x" type="button" aria-label={tr(lang, 'Свернуть', 'Collapse', "Yig'ish")} onClick={() => open(null)}>
                <i className="ph ph-x" aria-hidden="true" />
              </button>
            </div>
            {t.state === 'empty' && (
              <div className="st-empty st-col">
                <p className="ai-desc">{t.desc}{t.error && <span className="rd-err" style={{ display: 'block' }}>{t.error}</span>}</p>
                {t.locked
                  ? <span className="sec-note"><i className="ph ph-lock-simple" aria-hidden="true" /> {t.locked}</span>
                  : <button className="btn solid" onClick={() => { t.onRun(); open(t.key); }}>{t.runLabel}</button>}
              </div>
            )}
            {t.state === 'loading' && (
              <div className="st-loading" aria-live="polite"><p className="ai-wait">{t.wait}</p><Skel lines={['w9', 'w7', 'w9', 'w5']} /></div>
            )}
            {t.state === 'done' && (
              <div className="st-done">
                <div className="tile-sum">
                  <p>{t.summary}</p>
                  <button className="btn" type="button" onClick={() => open(t.key)}>{tr(lang, 'Открыть', 'Open', 'Ochish')}</button>
                </div>
                <div className="tile-body">{t.body}</div>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
};
