import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export interface PillButtonProps {
  children: React.ReactNode;
  to?: string;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  showArrow?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

export const PillButton: React.FC<PillButtonProps> = ({
  children,
  to,
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  showArrow = true,
  disabled = false,
  type = 'button',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'text-xs pl-3.5 pr-1.5 py-1 gap-2',
    md: 'text-sm pl-4 pr-1.5 py-1.5 gap-2.5',
    lg: 'text-base pl-5 pr-2 py-2 gap-3',
  };

  const arrowCircleSize = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-7 h-7',
  };

  const arrowIconSize = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  };

  const variantClasses = {
    primary:
      'bg-navy text-white hover:bg-navy/90 shadow-sm border border-navy/10',
    secondary:
      'bg-surface-2 text-navy hover:bg-surface border border-border',
    ghost:
      'bg-transparent text-navy hover:bg-surface-2 border border-transparent',
    danger:
      'bg-danger text-white hover:bg-danger/90 border border-danger/10',
  };

  const arrowBgClasses = {
    primary: 'bg-white/15 text-white',
    secondary: 'bg-navy/10 text-navy',
    ghost: 'bg-navy/10 text-navy',
    danger: 'bg-white/20 text-white',
  };

  const content = (
    <>
      <span className="font-medium tracking-tight whitespace-nowrap">{children}</span>
      {showArrow && (
        <span
          className={`relative shrink-0 rounded-full flex items-center justify-center overflow-hidden transition-colors ${arrowCircleSize[size]} ${arrowBgClasses[variant]}`}
          aria-hidden="true"
        >
          {/* Main arrow - slides right on hover */}
          <ArrowRight
            className={`${arrowIconSize[size]} transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[160%]`}
            strokeWidth={2}
          />
          {/* Incoming arrow - slides in from left on hover */}
          <ArrowRight
            className={`${arrowIconSize[size]} absolute -translate-x-[160%] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0`}
            strokeWidth={2}
          />
        </span>
      )}
    </>
  );

  const baseClasses = `group inline-flex items-center rounded-full transition-all duration-200 select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${className}`;

  if (to && !disabled) {
    return (
      <Link to={to} className={baseClasses} onClick={onClick}>
        {content}
      </Link>
    );
  }

  if (href && !disabled) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={baseClasses} onClick={onClick}>
        {content}
      </a>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={baseClasses}
    >
      {content}
    </button>
  );
};

