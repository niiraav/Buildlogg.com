import React from 'react';

export interface HomeTabSwitcherProps {
  activeTab: 'today' | 'tasks';
  todayBadgeCount?: number;
  tasksBadgeCount?: number;
  onChange: (tab: 'today' | 'tasks') => void;
}

export const HomeTabSwitcher: React.FC<HomeTabSwitcherProps> = ({
  activeTab,
  todayBadgeCount,
  tasksBadgeCount,
  onChange,
}) => {
  return (
    <div className="flex border-b border-brand-borderLight mx-4 mt-2 shrink-0">
      <button
        onClick={() => onChange('today')}
        className={`flex-1 h-11 flex items-center justify-center text-xs font-medium cursor-pointer transition-all gap-1.5 border-b-2 ${
          activeTab === 'today'
            ? 'text-brand-black font-bold border-brand-black'
            : 'text-brand-muted border-transparent'
        }`}
      >
        Today
        {todayBadgeCount !== undefined && todayBadgeCount > 0 && (
          <span className="min-w-[16px] h-4 bg-status-error text-white rounded-lg text-micro font-bold flex items-center justify-center px-1">
            {todayBadgeCount}
          </span>
        )}
      </button>
      <button
        onClick={() => onChange('tasks')}
        className={`flex-1 h-11 flex items-center justify-center text-xs font-medium cursor-pointer transition-all gap-1.5 border-b-2 ${
          activeTab === 'tasks'
            ? 'text-brand-black font-bold border-brand-black'
            : 'text-brand-muted border-transparent'
        }`}
      >
        Tasks
        {tasksBadgeCount !== undefined && tasksBadgeCount > 0 && (
          <span className="min-w-[16px] h-4 bg-status-error text-white rounded-lg text-micro font-bold flex items-center justify-center px-1">
            {tasksBadgeCount}
          </span>
        )}
      </button>
    </div>
  );
};
