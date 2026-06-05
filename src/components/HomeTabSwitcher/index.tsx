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
    <div className="flex bg-[#F3F4F6] rounded-[10px] p-[3px] mx-4 mt-3">
      <button
        onClick={() => onChange('today')}
        className={`flex-1 h-9 flex items-center justify-center text-[13px] font-semibold rounded-md cursor-pointer transition-all ${
          activeTab === 'today'
            ? 'bg-white text-[#111827] shadow-active'
            : 'text-[#6B7280]'
        }`}
      >
        Today
      </button>
      <button
        onClick={() => onChange('tasks')}
        className={`flex-1 h-9 flex items-center justify-center text-[13px] font-semibold rounded-md cursor-pointer transition-all gap-1.5 ${
          activeTab === 'tasks'
            ? 'bg-white text-[#111827] shadow-active'
            : 'text-[#6B7280]'
        }`}
      >
        Tasks
        {tasksBadgeCount !== undefined && tasksBadgeCount > 0 && (
          <span className="min-w-[16px] h-4 bg-[#DC2626] text-white rounded-[8px] text-[10px] font-bold flex items-center justify-center px-1">
            {tasksBadgeCount}
          </span>
        )}
      </button>
    </div>
  );
};
