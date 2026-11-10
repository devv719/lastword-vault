import React from 'react';
import type { VaultState, RecipientVerificationStatus, ContactStatus } from '../../types';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'outline';
  size?: 'sm' | 'md';
  pulseDot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  pulseDot = false,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'text-xs px-2.5 py-0.5 gap-1.5',
    md: 'text-xs px-3 py-1 gap-2',
  };

  const variantClasses = {
    default: 'bg-surface-2 text-navy border border-border',
    neutral: 'bg-surface text-muted-text border border-border',
    success: 'bg-success-soft text-success border border-success/20',
    warning: 'bg-warning-soft text-warning border border-warning/20',
    danger: 'bg-danger-soft text-danger border border-danger/20',
    accent: 'bg-accent-soft text-accent border border-accent/20',
    outline: 'bg-transparent text-muted-text border border-border',
  };

  const dotClasses = {
    default: 'bg-navy',
    neutral: 'bg-muted-text',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    accent: 'bg-accent',
    outline: 'bg-muted-text',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full select-none tracking-tight ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {pulseDot && (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotClasses[variant]}`}
          />
          <span
            className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotClasses[variant]}`}
          />
        </span>
      )}
      {children}
    </span>
  );
};

export const VaultStatusChip: React.FC<{ status: VaultState; className?: string }> = ({
  status,
  className = '',
}) => {
  const configs: Record<VaultState, { label: string; variant: BadgeProps['variant'] }> = {
    active: { label: 'Active • Nominal', variant: 'success' },
    warning: { label: 'Warning • Check-in Needed', variant: 'warning' },
    grace: { label: 'Grace Period Running', variant: 'danger' },
    releasing: { label: 'Release in Progress', variant: 'danger' },
    released: { label: 'Vault Released', variant: 'danger' },
  };

  const { label, variant } = configs[status] || configs.active;

  return (
    <Badge variant={variant} pulseDot size="md" className={className}>
      {label}
    </Badge>
  );
};

export const VerificationBadge: React.FC<{
  status: RecipientVerificationStatus | ContactStatus;
  className?: string;
}> = ({ status, className = '' }) => {
  const configs: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    verified: { label: 'Verified', variant: 'success' },
    pending: { label: 'Pending Verification', variant: 'warning' },
    unassigned: { label: 'Unassigned', variant: 'outline' },
    failed: { label: 'Failed', variant: 'danger' },
    expired: { label: 'Expired', variant: 'danger' },
  };

  const { label, variant } = configs[status] || configs.unassigned;

  return (
    <Badge variant={variant} size="sm" className={className}>
      {label}
    </Badge>
  );
};
