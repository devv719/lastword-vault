import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle } from 'lucide-react';
import { Input, PasswordInput } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isDirty },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
  });

  const onSubmit = async (_data: LoginFormData) => {
    setIsSubmitting(true);
    setAuthError(null);

    // Simulate network attempt
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsSubmitting(false);

    // Explicit requirement: Submitting must NOT fake a successful login.
    setAuthError(
      "Authentication isn't connected yet. Use the preview link below to explore the console interface."
    );
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-navy tracking-tight">Access Your Vault</h1>
        <p className="text-xs text-muted-text mt-1">
          Authenticate using your master passphrase to manage directives and check in.
        </p>
      </div>

      {/* Error Banner */}
      {authError && (
        <div
          role="alert"
          aria-live="polite"
          className="p-4 rounded-2xl bg-warning-soft border border-warning/30 flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-warning">Backend Unlinked</p>
            <p className="text-xs text-navy/80 leading-relaxed">{authError}</p>
          </div>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label="Email Address"
          type="email"
          placeholder="e.g. alex@havenfield.org"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <PasswordInput
          label="Master Password"
          placeholder="••••••••••••"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="pt-2">
          <PillButton
            type="submit"
            disabled={!isValid || !isDirty || isSubmitting}
            className="w-full justify-center"
          >
            {isSubmitting ? 'Verifying Enclave...' : 'Unlock Vault'}
          </PillButton>
        </div>
      </form>

      {/* Bottom Switcher */}
      <div className="text-center pt-4 border-t border-border">
        <p className="text-xs text-muted-text">
          Don’t have a vault yet?{' '}
          <Link to="/register" className="font-semibold text-navy hover:text-accent">
            Create one now
          </Link>
        </p>
      </div>
    </div>
  );
};
