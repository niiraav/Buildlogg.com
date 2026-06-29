import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Wraps a list item and animates its removal when `removing` becomes true.
 * When `removing` flips to true, applies the `item-exit-active` class and
 * waits for the CSS transition to complete before calling `onRemoved`.
 *
 * Usage:
 *   <AnimatedRemove removing={isRemoving} onRemoved={() => deleteItem(id)}>
 *     <JobRow ... />
 *   </AnimatedRemove>
 *
 * The parent controls when removal starts by setting `removing=true`.
 * The parent should NOT remove the item from its list until `onRemoved` fires.
 *
 * Note: This component is designed for lists with manual state management
 * (useState/useMemo). It does NOT work with useLiveQuery — the live query
 * will remove the item from the list before the animation can complete.
 */
interface AnimatedRemoveProps {
  removing: boolean;
  onRemoved: () => void;
  children: ReactNode;
  /** Max height to animate from — should be >= the item's actual height. Default 200px. */
  maxHeight?: number;
}

export function AnimatedRemove({ removing, onRemoved, children, maxHeight = 200 }: AnimatedRemoveProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (removing && !exiting) {
      // Measure actual height for smooth collapse
      const el = ref.current;
      if (el) {
        el.style.maxHeight = `${el.scrollHeight}px`;
      }
      // Force reflow so the browser registers the initial height
      if (el) el.offsetHeight;

      setExiting(true);

      // Wait for transition to complete (200ms + small buffer)
      const timer = setTimeout(() => {
        onRemoved();
      }, 250);

      return () => clearTimeout(timer);
    }
  }, [removing, exiting, onRemoved]);

  return (
    <div
      ref={ref}
      className={`item-exit ${exiting ? 'item-exit-active' : ''}`}
      style={{ maxHeight: exiting ? undefined : `${maxHeight}px` }}
      aria-hidden={exiting}
    >
      {children}
    </div>
  );
}

export default AnimatedRemove;
