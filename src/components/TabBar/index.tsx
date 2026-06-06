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
    <div className="shrink-0 bg-white border-t border-brand-border pb-[env(safe-area-inset-bottom)]">
      <div className="h-14 flex w-full flex-shrink-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onNavigate(tab.key)}
              className={`flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${isActive ? 'text-brand-black' : 'text-brand-muted'}`}
            >
              <Icon size={22} className={isActive ? "text-brand-black" : "text-brand-muted"} />
              <span className={`text-micro font-medium ${isActive ? 'text-brand-black' : 'text-brand-muted'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
