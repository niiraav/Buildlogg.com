import { useState, useEffect } from 'react';

/**
 * Native scroll-to-hide hook (no dependencies).
 * Listens to window scroll. Returns `visible` boolean.
 * When scrolling down past threshold + not at top → visible = false.
 * When scrolling up or at top → visible = true.
 */
export function useScrollHide(threshold = 5): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          const delta = currentScrollY - lastScrollY;

          if (currentScrollY <= 0) {
            setVisible(true);
          } else if (delta > threshold) {
            setVisible(false);
          } else if (delta < -threshold) {
            setVisible(true);
          }

          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  return visible;
}
