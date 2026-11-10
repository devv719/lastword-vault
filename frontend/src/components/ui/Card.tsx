import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  onClick,
  hoverEffect = false,
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-border rounded-[24px] p-6 shadow-[0_1px_3px_rgba(11,27,51,0.03),0_8px_24px_rgba(11,27,51,0.04)] ${
        hoverEffect
          ? 'transition-all duration-200 hover:shadow-[0_4px_12px_rgba(11,27,51,0.06),0_12px_32px_rgba(11,27,51,0.06)] hover:border-border/80'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};

interface StampCardProps {
  children: React.ReactNode;
  className?: string;
  rotation?: number; // degrees, e.g. -2, 1.5, 2
  badge?: string;
}

export const StampCard: React.FC<StampCardProps> = ({
  children,
  className = '',
  rotation = 0,
  badge,
}) => {
  return (
    <div
      style={{
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
      }}
      className={`relative bg-surface rounded-[20px] p-6 border border-dashed border-border transition-transform duration-300 hover:rotate-0 overflow-hidden shadow-sm ${className}`}
    >
      {/* Halftone texture overlay */}
      <div className="absolute inset-0 stamp-texture pointer-events-none" aria-hidden="true" />

      {badge && (
        <div className="absolute top-3 right-3 select-none">
          <span className="text-[10px] font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-surface-2 text-muted-text border border-border">
            {badge}
          </span>
        </div>
      )}

      <div className="relative z-10">{children}</div>
    </div>
  );
};

export { PostageStamp } from './PostageStamp';
export type { PostageStampProps } from './PostageStamp';


