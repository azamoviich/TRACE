import React, { useEffect, useRef, useState } from 'react';

const DIGIT_RE = /[0-9]/;
const randomDigit = () => String(Math.floor(Math.random() * 10));

function scramble(s: string): string {
  return s.split('').map(c => (DIGIT_RE.test(c) ? randomDigit() : c)).join('');
}

// Slot-machine number: while `loading` is true, digits keep spinning
// continuously (not a one-shot animation) — the number never sits frozen
// on a stale value while new data is being fetched. Once loading clears,
// digits lock in left-to-right onto the real value. Non-digit characters
// (spaces, separators, currency suffixes) pass through untouched.
export function SlotText({
  text, loading = false, duration = 500, spinIntervalMs = 55, className, style,
}: {
  text: string;
  loading?: boolean;
  duration?: number;
  spinIntervalMs?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [display, setDisplay] = useState(text);
  const shapeRef = useRef(text);
  const frameRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasLoadingRef = useRef(loading);
  const prevTextRef = useRef(text);

  // Continuous spin for as long as loading stays true.
  useEffect(() => {
    if (!loading) return;
    intervalRef.current = setInterval(() => {
      setDisplay(scramble(shapeRef.current));
    }, spinIntervalMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loading, spinIntervalMs]);

  // Reveal into the real value once loading clears (or the value changes
  // outside of an explicit loading flag).
  useEffect(() => {
    const wasLoading = wasLoadingRef.current;
    const textChanged = prevTextRef.current !== text;
    wasLoadingRef.current = loading;
    prevTextRef.current = text;
    shapeRef.current = text;

    if (loading) return;
    if (!wasLoading && !textChanged) return;

    const digitCount = text.split('').filter(c => DIGIT_RE.test(c)).length;
    if (digitCount === 0) { setDisplay(text); return; }

    const start = performance.now();
    const tick = (now: number) => {
      const fraction = Math.min(1, (now - start) / duration);
      const lockedCount = Math.floor(fraction * digitCount);
      let seen = 0;
      setDisplay(text.split('').map(c => {
        if (!DIGIT_RE.test(c)) return c;
        seen++;
        return seen <= lockedCount ? c : randomDigit();
      }).join(''));
      if (fraction < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current != null) cancelAnimationFrame(frameRef.current); };
  }, [text, loading, duration]);

  return <span className={className} style={style}>{display}</span>;
}
