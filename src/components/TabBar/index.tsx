import React from 'react';
import { Home, Briefcase, Settings, Bell, Users, BarChart3 } from 'lucide-react';
import { haptic } from '../../lib/haptics';

export interface TabBarProps {
  activeTab: 'home' | 'jobs' | 'customers' | 'dashboard' | 'settings' | 'activity';
  onNavigate: (tab: 'home' | 'jobs' | 'customers' | 'dashboard' | 'settings' | 'activity') => void;
}

export const TabBar: React.FC<TabBarProps> = ({ activeTab, onNavigate }) => {
  const tabs = [
    { key: 'home' as const, label: 'Home', icon: Home },
    { key: 'jobs' as const, label: 'Jobs', icon: Briefcase },
    { key: 'customers' as const, label: 'Clients', icon: Users },
    { key: 'dashboard' as const, label: 'Stats', icon: BarChart3 },
    { key: 'activity' as const, label: 'Activity', icon: Bell },
    { key: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="w-full bg-[var(--app-shell-bg)] border-t border-brand-border pb-[env(safe-area-inset-bottom)] flex-shrink-0">
      <div className="h-14 flex w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { haptic('light'); onNavigate(tab.key); }}
              className={`flex-1 min-w-[60px] min-h-11 flex flex-col items-center justify-center pt-2.5 pb-1.5 gap-1 cursor-pointer active:scale-95 transition-transform duration-100 ${isActive ? 'text-brand-black' : 'text-brand-dark'}`}
            >
              <Icon size={20} className={isActive ? "text-brand-black" : "text-brand-dark"} />
              <span className={`text-micro font-medium whitespace-nowrap ${isActive ? 'text-brand-black' : 'text-brand-dark'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
