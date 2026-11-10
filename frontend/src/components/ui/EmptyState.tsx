import React from 'react';
import { PillButton } from './PillButton';
import { StampCard } from './Card';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  badge?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  badge = 'INVENTORY: 0',
}) => {
  return (
    <div className="py-12 flex justify-center">
      <StampCard rotation={-1.2} badge={badge} className="max-w-md w-full text-center py-10 px-8">
        {icon && (
          <div className="relative w-14 h-14 rounded-2xl bg-[#EFF8FF] border border-[#BAE0FD] flex items-center justify-center mx-auto text-[#00A8FF] mb-4 overflow-hidden">
            <div
              className="absolute inset-0 opacity-25 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(#00A8FF 1px, transparent 1px), radial-gradient(#7BCBFF 1px, transparent 1px)',
                backgroundSize: '6px 6px',
                backgroundPosition: '0 0, 3px 3px',
              }}
              aria-hidden="true"
            />
            <div className="relative z-10">{icon}</div>
          </div>
        )}
        <h4 className="text-base font-semibold text-navy tracking-tight">{title}</h4>
        <p className="text-sm text-muted-text mt-1.5 max-w-xs mx-auto leading-relaxed">
          {description}
        </p>
        {actionLabel && onAction && (
          <div className="mt-6">
            <PillButton onClick={onAction} size="sm">
              {actionLabel}
            </PillButton>
          </div>
        )}
      </StampCard>
    </div>
  );
};

