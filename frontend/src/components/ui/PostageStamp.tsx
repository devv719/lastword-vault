import React from 'react';

export interface PostageStampProps {
  color: 'emerald' | 'pink' | 'orange' | 'sky' | 'indigo' | 'amber';
  number: string;
  tag?: string;
  title: string;
  description?: string;
  rotation?: number;
  icon?: React.ReactNode;
  className?: string;
}

const COLOR_MAP = {
  emerald: {
    bg: 'bg-[#EBF7F0]',
    border: 'border-[#A3D9B8]',
    artBg: 'bg-[#2F7D5B]',
    artLight: 'bg-[#74C39B]',
    text: 'text-[#205E44]',
    numberText: 'text-[#2F7D5B]',
    pattern: '#2F7D5B',
  },
  pink: {
    bg: 'bg-[#FDF0F4]',
    border: 'border-[#F8B4C8]',
    artBg: 'bg-[#DB2777]',
    artLight: 'bg-[#F472B6]',
    text: 'text-[#9D174D]',
    numberText: 'text-[#DB2777]',
    pattern: '#DB2777',
  },
  orange: {
    bg: 'bg-[#FEF5EA]',
    border: 'border-[#FCD39D]',
    artBg: 'bg-[#D97706]',
    artLight: 'bg-[#FBBF24]',
    text: 'text-[#92400E]',
    numberText: 'text-[#D97706]',
    pattern: '#D97706',
  },
  sky: {
    bg: 'bg-[#EFF8FF]',
    border: 'border-[#BAE0FD]',
    artBg: 'bg-[#00A8FF]',
    artLight: 'bg-[#7BCBFF]',
    text: 'text-[#0369A1]',
    numberText: 'text-[#00A8FF]',
    pattern: '#00A8FF',
  },
  indigo: {
    bg: 'bg-[#EEF2FF]',
    border: 'border-[#C7D2FE]',
    artBg: 'bg-[#4F46E5]',
    artLight: 'bg-[#818CF8]',
    text: 'text-[#3730A3]',
    numberText: 'text-[#4F46E5]',
    pattern: '#4F46E5',
  },
  amber: {
    bg: 'bg-[#FFFBEB]',
    border: 'border-[#FDE68A]',
    artBg: 'bg-[#B45309]',
    artLight: 'bg-[#F59E0B]',
    text: 'text-[#78350F]',
    numberText: 'text-[#B45309]',
    pattern: '#B45309',
  },
};

export const PostageStamp: React.FC<PostageStampProps> = ({
  color,
  number,
  tag = '2026-11',
  title,
  description,
  rotation = 0,
  icon,
  className = '',
}) => {
  const c = COLOR_MAP[color];

  return (
    <div
      style={{
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
      }}
      className={`group relative bg-white rounded-2xl p-4 sm:p-5 border border-black/10 shadow-[0_4px_20px_rgba(11,27,51,0.06)] hover:shadow-[0_8px_30px_rgba(11,27,51,0.1)] transition-all duration-300 hover:rotate-0 flex flex-col justify-between ${className}`}
    >
      {/* Postage perforated teeth top & bottom using subtle decorative dots */}
      <div
        className="absolute -top-1.5 inset-x-4 flex justify-between pointer-events-none select-none opacity-40"
        aria-hidden="true"
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-border" />
        ))}
      </div>
      <div
        className="absolute -bottom-1.5 inset-x-4 flex justify-between pointer-events-none select-none opacity-40"
        aria-hidden="true"
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-border" />
        ))}
      </div>

      {/* Stamp Art Window */}
      <div
        className={`relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-black/5 ${c.bg} flex items-center justify-center p-4`}
      >
        {/* Halftone / dither pixel texture background */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(${c.pattern} 1px, transparent 1px)`,
            backgroundSize: '6px 6px',
          }}
          aria-hidden="true"
        />

        {/* Pixel landscape / icon silhouette */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center">
          <div
            className={`w-12 h-12 rounded-xl ${c.artBg} text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-300`}
          >
            {icon}
          </div>
        </div>
      </div>

      {/* Stamp Footer: Tag, Title in Italic Serif, and Stamp Number */}
      <div className="mt-4 pt-2">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <span className="block text-[10px] font-mono tracking-widest text-muted-text/80 uppercase">
              {tag}
            </span>
            <h4 className="font-serif italic text-xl font-normal text-navy tracking-tight truncate mt-0.5">
              {title}
            </h4>
          </div>
          <span className={`font-serif italic text-2xl font-bold ${c.numberText} select-none shrink-0`}>
            {number}
          </span>
        </div>

        {description && (
          <p className="text-xs text-muted-text mt-2 leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </div>
  );
};

