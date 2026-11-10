import React from 'react';
import { motion } from 'framer-motion';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
}) => {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center p-1 bg-surface-2 rounded-full border border-border select-none ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative px-4 py-1.5 text-xs font-medium rounded-full transition-colors cursor-pointer flex items-center gap-1.5 ${
              isActive ? 'text-navy' : 'text-muted-text hover:text-navy'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="activeTabPill"
                className="absolute inset-0 bg-white rounded-full shadow-sm border border-border/60"
                transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={`relative z-10 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  isActive ? 'bg-surface-2 text-navy' : 'bg-surface text-muted-text'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

