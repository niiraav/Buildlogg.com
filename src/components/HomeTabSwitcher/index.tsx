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

  // Measure active tab position for animated underline
  useEffect(() => {
    const ref = activeTab === 'today' ? todayRef.current : activeTab === 'tasks' ? tasksRef.current : draftsRef.current;
    if (ref) {
      setUnderline({
        left: ref.offsetLeft,
        width: ref.offsetWidth,
      });
    }
  }, [activeTab, tabs]);

  return (
    <div className="flex border-b border-brand-borderLight mx-4 mt-2 shrink-0 relative">
      {tabs.includes('today') && (
        <button
          ref={todayRef}
          onClick={() => { haptic('light'); onChange('today'); }}
          className={`flex items-center h-11 text-sm font-medium cursor-pointer transition-all duration-150 gap-1.5 pr-4 active:opacity-70 ${
            activeTab === 'today'
              ? 'text-brand-black font-bold'
              : 'text-brand-dark'
          }`}
        >
          Today
          {todayBadgeCount !== undefined && todayBadgeCount > 0 && (
            <span className="min-w-[16px] h-4 bg-status-error text-brand-surface rounded-lg text-micro font-bold flex items-center justify-center px-1">
              {todayBadgeCount}
            </span>
          )}
        </button>
      )}
      {tabs.includes('tasks') && (
        <button
          ref={tasksRef}
          onClick={() => { haptic('light'); onChange('tasks'); }}
          className={`flex items-center h-11 text-sm font-medium cursor-pointer transition-all duration-150 gap-1.5 pl-4 active:opacity-70 ${
            activeTab === 'tasks'
              ? 'text-brand-black font-bold'
              : 'text-brand-dark'
          }`}
        >
          Tasks
          {tasksBadgeCount !== undefined && tasksBadgeCount > 0 && (
            <span className="min-w-[16px] h-4 bg-status-error text-brand-surface rounded-lg text-micro font-bold flex items-center justify-center px-1">
              {tasksBadgeCount}
            </span>
          )}
        </button>
      )}
      {tabs.includes('drafts') && (
        <button
          ref={draftsRef}
          onClick={() => { haptic('light'); onChange('drafts'); }}
          className={`flex items-center h-11 text-sm font-medium cursor-pointer transition-all duration-150 gap-1.5 pl-4 active:opacity-70 ${
            activeTab === 'drafts'
              ? 'text-brand-black font-bold'
              : 'text-brand-dark'
          }`}
        >
          Drafts
          {draftsBadgeCount !== undefined && draftsBadgeCount > 0 && (
            <span className="min-w-[16px] h-4 bg-status-error text-brand-surface rounded-lg text-micro font-bold flex items-center justify-center px-1">
              {draftsBadgeCount}
            </span>
          )}
        </button>
      )}

      {/* Animated underline */}
      <div
        className="absolute bottom-0 h-0.5 bg-brand-black rounded-full transition-all duration-200 ease-out"
        style={{
          left: `${underline.left + 2}px`,
          width: `${Math.max(underline.width - 18, 32)}px`,
        }}
      />
    </div>
  );
};
