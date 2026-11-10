import React from 'react';
import { LastWordMark } from '../components/ui/LastWordMark';
import { PillButton } from '../components/ui/PillButton';
import { Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white border border-border rounded-[28px] p-8 sm:p-12 shadow-sm space-y-6">
        <LastWordMark size={36} className="text-accent mx-auto" />

        <div className="space-y-2">
          <span className="text-xs font-mono uppercase tracking-widest text-muted-text">
            Error 404 • Enclave Unmapped
          </span>
          <h1 className="text-2xl font-bold text-navy tracking-tight">
            Record Not Found
          </h1>
          <p className="text-sm text-muted-text leading-relaxed">
            The cryptographic path or page you requested does not exist or has been permanently rotated.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <PillButton to="/" variant="secondary" size="sm" showArrow={false}>
            <span className="flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5" />
              Return home
            </span>
          </PillButton>
          <PillButton to="/app" size="sm">
            Open console
          </PillButton>
        </div>
      </div>
    </div>
  );
};
