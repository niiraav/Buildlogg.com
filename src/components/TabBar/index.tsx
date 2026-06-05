import React from 'react';
import { Home, Briefcase, Settings } from 'lucide-react';

export interface TabBarProps {
  activeTab: 'home' | 'jobs' | 'settings';
  onNavigate: (tab: 'home' | 'jobs' | 'settings') => void;
}

export const TabBar: React.FC<TabBarProps> = ({ activeTab, onNavigate }) => {
  const tabs = [
    { key: 'home' as const, label: 'Home', icon: Home },
    { key: 'jobs' as const, label: 'Jobs', icon: Briefcase },
    { key: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="h-[56px] bg-white border-t border-[#E5E7EB] flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="h-[56px] flex w-full">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onNavigate(tab.key)}
              className="flex-1 min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            >
              <Icon size={22} color={isActive ? '#111827' : '#9CA3AF'} />
              <span
                className="text-[10px] font-medium"
                style={{ color: isActive ? '#111827' : '#9CA3AF' }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
