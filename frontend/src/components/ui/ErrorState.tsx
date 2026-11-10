import React from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { PillButton } from './PillButton';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Data Feed Temporarily Paused',
  message = 'The secure enclave could not verify local credentials right now. Your vault remains locked and protected.',
  onRetry,
}) => {
  return (
    <div className="py-12 flex justify-center">
      <div className="max-w-md w-full bg-white border border-danger/20 rounded-[24px] p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-full bg-danger-soft text-danger flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h4 className="text-base font-semibold text-navy tracking-tight">{title}</h4>
        <p className="text-sm text-muted-text mt-2 leading-relaxed">{message}</p>
        {onRetry && (
          <div className="mt-6 flex justify-center">
            <PillButton onClick={onRetry} variant="secondary" size="sm">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                Retry connection
              </span>
            </PillButton>
          </div>
        )}
      </div>
    </div>
  );
};

