import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from its previous value to the target value.
 * On first render, animates from 0 to the target.
 * Uses requestAnimationFrame with an ease-out cubic curve.
 * Respects prefers-reduced-motion — returns the target value immediately.
 *
 * @param target The number to animate to
 * @param duration Animation duration in ms (default 600)
 * @returns The current animated value
 */
export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0);
  const previousValue = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Respect reduced motion — skip animation
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      previousValue.current = target;
      return;
    }

    // If target hasn't changed, don't animate
    if (target === previousValue.current) return;

    const start = previousValue.current;
    const end = target;
    const startTime = performance.now();

    // Ease-out cubic: fast start, slow finish
    const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOut(progress);
      const current = start + (end - start) * eased;
      setValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setValue(end);
        previousValue.current = end;
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration]);

  return value;
}
