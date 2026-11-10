import React from 'react';

interface LastWordMarkProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

export const LastWordMark: React.FC<LastWordMarkProps> = ({
  className = '',
  size = 24,
  animated = false,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      {/* Outer Vault Ring with 4 cardinal micro-notches */}
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="1.5"
        className={animated ? 'animate-[spin_12s_linear_infinite] origin-center' : ''}
        strokeDasharray="2 1"
      />
      
      {/* Inner Precision Wax/Vault Core */}
      <circle
        cx="12"
        cy="12"
        r="7"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.2"
      />

      {/* Keyhole / Switch Glyph */}
      <path
        d="M12 8.5C10.8954 8.5 10 9.39543 10 10.5C10 11.2393 10.4018 11.8845 11 12.2248V14.5C11 15.0523 11.4477 15.5 12 15.5C12.5523 15.5 13 15.0523 13 14.5V12.2248C13.5982 11.8845 14 11.2393 14 10.5C14 9.39543 13.1046 8.5 12 8.5Z"
        fill="currentColor"
      />

      {/* Center micro-core dot */}
      <circle cx="12" cy="10.5" r="0.85" fill="var(--bg, #FFFFFF)" />
    </svg>
  );
};

