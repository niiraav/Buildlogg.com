import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { haptic } from '../../lib/haptics';

export interface HomeTabSwitcherProps {
  activeTab: 'today' | 'drafts' | 'tasks';
  todayBadgeCount?: number;
  draftsBadgeCount?: number;
  tasksBadgeCount?: number;
  onChange: (tab: 'today' | 'drafts' | 'tasks') => void;
}

export const HomeTabSwitcher: React.FC<HomeTabSwitcherProps> = ({
  activeTab,
  todayBadgeCount,
  draftsBadgeCount,
  tasksBadgeCount,
  onChange,
}) => {
  const todayRef = useRef<HTMLButtonElement>(null);
  const draftsRef = useRef<HTMLButtonElement>(null);
  const tasksRef = useRef<HTMLButtonElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  // Measure active tab position for animated underline
  useEffect(() => {
    const ref = activeTab === 'today' ? todayRef.current
      : activeTab === 'drafts' ? draftsRef.current
      : tasksRef.current;
    if (ref) {
      setUnderline({
        left: ref.offsetLeft,
        width: ref.offsetWidth,
      });
    }
  }, [activeTab]);

  return (
    <div className="flex border-b border-brand-borderLight mx-4 mt-2 shrink-0 relative">
      <button
        ref={todayRef}
        onClick={() => { haptic('light'); onChange('today'); }}
        className={`flex items-center h-11 text-xs font-medium cursor-pointer transition-all duration-150 gap-1.5 pr-4 active:opacity-70 ${
          activeTab === 'today'
            ? 'text-brand-black font-bold'
            : 'text-brand-muted'
        }`}
      >
        Today
        {todayBadgeCount !== undefined && todayBadgeCount > 0 && (
          <span className="min-w-[16px] h-4 bg-status-error text-brand-surface rounded-lg text-micro font-bold flex items-center justify-center px-1">
            {todayBadgeCount}
          </span>
        )}
      </button>
      <button
        ref={draftsRef}
        onClick={() => { haptic('light'); onChange('drafts'); }}
        className={`flex items-center h-11 text-xs font-medium cursor-pointer transition-all duration-150 gap-1.5 px-4 active:opacity-70 ${
          activeTab === 'drafts'
            ? 'text-brand-black font-bold'
            : 'text-brand-muted'
        }`}
      >
        Drafts
        {draftsBadgeCount !== undefined && draftsBadgeCount > 0 && (
          <span className="min-w-[16px] h-4 bg-status-error text-brand-surface rounded-lg text-micro font-bold flex items-center justify-center px-1">
            {draftsBadgeCount}
          </span>
        )}
      </button>
      <button
        ref={tasksRef}
        onClick={() => { haptic('light'); onChange('tasks'); }}
        className={`flex items-center h-11 text-xs font-medium cursor-pointer transition-all duration-150 gap-1.5 pl-4 active:opacity-70 ${
          activeTab === 'tasks'
            ? 'text-brand-black font-bold'
            : 'text-brand-muted'
        }`}
      >
        Tasks
        {tasksBadgeCount !== undefined && tasksBadgeCount > 0 && (
          <span className="min-w-[16px] h-4 bg-status-error text-brand-surface rounded-lg text-micro font-bold flex items-center justify-center px-1">
            {tasksBadgeCount}
          </span>
        )}
      </button>

      {/* Animated underline */}
      <motion.div
        className="absolute bottom-0 h-0.5 bg-brand-black rounded-full"
        animate={{
          left: underline.left,
          width: underline.width,
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 35, duration: 0.2 }}
      />
    </div>
  );
};
