import { useState, useEffect, useRef } from 'react';

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function useCountUp(target: number, duration = 850): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);
  const startTsRef = useRef<number | null>(null);
  const startValueRef = useRef(0);
  const prevTargetRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevTargetRef.current === target) return;
    startValueRef.current = prevTargetRef.current ?? 0;
    prevTargetRef.current = target;
    startTsRef.current = null;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const animate = (ts: number) => {
      if (startTsRef.current === null) startTsRef.current = ts;
      const elapsed = ts - startTsRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(progress);
      const current = startValueRef.current + (target - startValueRef.current) * eased;
      setValue(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setValue(target);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}
