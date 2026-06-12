import React from 'react';
import { Home, Briefcase, Settings, Bell } from 'lucide-react';
import { haptic } from '../../lib/haptics';

export interface TabBarProps {
  activeTab: 'home' | 'jobs' | 'settings' | 'activity';
  onNavigate: (tab: 'home' | 'jobs' | 'settings' | 'activity') => void;
}

export const TabBar: React.FC<TabBarProps> = ({ activeTab, onNavigate }) => {
  const tabs = [
    { key: 'home' as const, label: 'Home', icon: Home },
    { key: 'jobs' as const, label: 'Jobs', icon: Briefcase },
    { key: 'activity' as const, label: 'Activity', icon: Bell },
    { key: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--app-shell-bg)] border-t border-brand-border pb-[env(safe-area-inset-bottom)] max-w-[430px] mx-auto">
      <div className="h-14 flex w-full flex-shrink-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { haptic('light'); onNavigate(tab.key); }}
              className={`flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 transition-transform duration-100 ${isActive ? 'text-brand-black' : 'text-brand-muted'}`}
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
