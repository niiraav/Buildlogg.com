import { useEffect, useRef, useState, useCallback } from 'react';

const THRESHOLD = 80; // px to trigger refresh
const MAX_PULL = 120; // max visual pull distance

/**
 * Pull-to-refresh hook for mobile/PWA.
 * Attaches touch listeners to the window (the scroll container).
 * When the user pulls down at scrollTop=0 past the threshold, calls onRefresh.
 *
 * Returns: { pullDistance, refreshing } for visual indicator rendering.
 * On desktop, touch events don't fire — the hook is naturally inactive.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const refreshCallback = useRef(onRefresh);

  // Keep the callback ref up-to-date without re-attaching listeners
  useEffect(() => {
    refreshCallback.current = onRefresh;
  }, [onRefresh]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (refreshing) return;
    // Only start tracking if at the top of the page
    if (window.scrollY <= 0) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    } else {
      pulling.current = false;
    }
  }, [refreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling.current || refreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    // Only pull if dragging downward and at the top
    if (diff > 0 && window.scrollY <= 0) {
      // Dampen the pull: rubber-band effect
      const dampened = Math.min(diff * 0.5, MAX_PULL);
      setPullDistance(dampened);

      // Prevent default scroll to avoid the browser's own overscroll
      if (diff > 5) {
        e.preventDefault();
      }
    } else {
      setPullDistance(0);
      pulling.current = false;
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullDistance >= THRESHOLD) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      try {
        await refreshCallback.current();
      } catch {
        // ignore refresh errors
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance]);

  useEffect(() => {
    // Only attach on touch devices
    if (!('ontouchstart' in window)) return;

    // passive: false so we can call preventDefault in touchmove
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullDistance, refreshing };
}
