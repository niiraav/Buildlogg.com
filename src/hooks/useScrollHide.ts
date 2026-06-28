import { useState, useEffect, useRef } from 'react';

/**
 * Native scroll-to-hide hook (no dependencies).
 * Listens to the #app-shell scroll container (not window — the app shell
 * has overflow-y-auto so window.scrollY never changes on PWA).
 * Returns `visible` boolean.
 * When scrolling down past threshold + not at top → visible = false.
 * When scrolling up or at top → visible = true.
 */
export function useScrollHide(threshold = 5): boolean {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    // Find the scroll container — #app-shell has overflow-y-auto
    const container = document.getElementById('app-shell');
    if (!container) {
      // Fallback to window if app-shell not found (e.g. desktop split)
      const handleWindowScroll = () => {
        const currentScrollY = window.scrollY;
        const delta = currentScrollY - lastScrollY.current;
        if (currentScrollY <= 0) setVisible(true);
        else if (delta > threshold) setVisible(false);
        else if (delta < -threshold) setVisible(true);
        lastScrollY.current = currentScrollY;
      };
      window.addEventListener('scroll', handleWindowScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleWindowScroll);
    }

    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = container.scrollTop;
          const delta = currentScrollY - lastScrollY.current;

          if (currentScrollY <= 0) {
            setVisible(true);
          } else if (delta > threshold) {
            setVisible(false);
          } else if (delta < -threshold) {
            setVisible(true);
          }

          lastScrollY.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  return visible;
}
