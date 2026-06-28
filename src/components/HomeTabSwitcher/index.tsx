import React, { useRef, useEffect, useState } from 'react';
import { haptic } from '../../lib/haptics';

export interface HomeTabSwitcherProps {
  tabs: Array<'today' | 'tasks' | 'drafts'>;
  activeTab: 'today' | 'tasks' | 'drafts';
  todayBadgeCount?: number;
  tasksBadgeCount?: number;
  draftsBadgeCount?: number;
  onChange: (tab: 'today' | 'tasks' | 'drafts') => void;
}

export const HomeTabSwitcher: React.FC<HomeTabSwitcherProps> = ({
  tabs,
  activeTab,
  todayBadgeCount,
  tasksBadgeCount,
  draftsBadgeCount,
  onChange,
}) => {
  const todayRef = useRef<HTMLButtonElement>(null);
  const tasksRef = useRef<HTMLButtonElement>(null);
  const draftsRef = useRef<HTMLButtonElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  // Measure active tab position for animated underline — full button width
  useEffect(() => {
    const ref = activeTab === 'today' ? todayRef.current
              : activeTab === 'tasks' ? tasksRef.current
              : draftsRef.current;
    if (!ref) return;

    // Use the full button width including badge
    setUnderline({
      left: ref.offsetLeft,
      width: ref.offsetWidth,
    });
  }, [activeTab, tabs]);

  const tabConfig = [
    { key: 'today' as const, label: 'Today', badge: todayBadgeCount, ref: todayRef },
    { key: 'tasks' as const, label: 'Tasks', badge: tasksBadgeCount, ref: tasksRef },
    { key: 'drafts' as const, label: 'Drafts', badge: draftsBadgeCount, ref: draftsRef },
  ];

  return (
    <div className="flex gap-4 border-b border-brand-borderLight mx-4 mt-2 shrink-0 relative">
      {tabConfig
        .filter((t) => tabs.includes(t.key))
        .map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              ref={tab.ref}
              onClick={() => { haptic('light'); onChange(tab.key); }}
              className={`flex items-center h-11 text-base cursor-pointer transition-colors duration-150 gap-1.5 active:opacity-70 ${
                isActive
                  ? 'text-brand-black font-bold'
                  : 'text-brand-muted font-medium'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={`min-w-[18px] h-[18px] rounded-lg text-xs font-bold flex items-center justify-center px-1 ${
                  isActive ? 'bg-status-error text-white' : 'bg-brand-borderLight text-brand-mid'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}

      {/* Animated underline — full width of active tab text */}
      <div
        className="absolute bottom-0 h-0.5 bg-brand-black rounded-full transition-all duration-200 ease-out"
        style={{
          left: `${underline.left}px`,
          width: `${underline.width}px`,
        }}
      />
    </div>
  );
};
