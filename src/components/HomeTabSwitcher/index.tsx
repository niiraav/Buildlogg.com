import React from 'react';

export interface HomeTabSwitcherProps {
  activeTab: 'today' | 'tasks';
  tasksBadgeCount?: number;
  onChange: (tab: 'today' | 'tasks') => void;
}

export const HomeTabSwitcher: React.FC<HomeTabSwitcherProps> = ({
  activeTab,
  tasksBadgeCount,
  onChange,
}) => {
  return (
    <div className="flex border-b border-[#F3F4F6] mx-4 mt-2 shrink-0">
      <button
        onClick={() => onChange('today')}
        className={`flex-1 h-[44px] flex items-center justify-center text-[13px] font-medium cursor-pointer transition-all border-b-2 ${
          activeTab === 'today'
            ? 'text-[#111827] font-bold border-[#111827]'
            : 'text-[#9CA3AF] border-transparent'
        }`}
      >
        Today
      </button>
      <button
        onClick={() => onChange('tasks')}
        className={`flex-1 h-[44px] flex items-center justify-center text-[13px] font-medium cursor-pointer transition-all gap-1.5 border-b-2 ${
          activeTab === 'tasks'
            ? 'text-[#111827] font-bold border-[#111827]'
            : 'text-[#9CA3AF] border-transparent'
        }`}
      >
        Tasks
        {tasksBadgeCount !== undefined && tasksBadgeCount > 0 && (
          <span className="min-w-[16px] h-4 bg-[#EF4444] text-white rounded-[10px] text-[10px] font-bold flex items-center justify-center px-1">
            {tasksBadgeCount}
          </span>
        )}
      </button>
    </div>
  );
};
