import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id || props.name || Math.random().toString(36).substring(7);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-navy tracking-tight">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            className={`w-full bg-surface border rounded-[14px] px-3.5 py-2.5 text-sm text-navy placeholder:text-muted-text/60 focus:outline-none focus:bg-white focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all duration-150 ${
              error ? 'border-danger focus:border-danger focus:ring-danger-soft' : 'border-border'
            } ${className}`}
            {...props}
          />
        </div>
        {error ? (
          <p className="text-xs text-danger tracking-tight">{error}</p>
        ) : hint ? (
          <p className="text-xs text-muted-text tracking-tight">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-medium text-navy tracking-tight">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type={showPassword ? 'text' : 'password'}
            className={`w-full bg-surface border rounded-[14px] px-3.5 py-2.5 pr-10 text-sm text-navy placeholder:text-muted-text/60 focus:outline-none focus:bg-white focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all duration-150 ${
              error ? 'border-danger focus:border-danger focus:ring-danger-soft' : 'border-border'
            } ${className}`}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-text hover:text-navy transition-colors cursor-pointer p-0.5"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {error ? (
          <p className="text-xs text-danger tracking-tight">{error}</p>
        ) : hint ? (
          <p className="text-xs text-muted-text tracking-tight">{hint}</p>
        ) : null}
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

