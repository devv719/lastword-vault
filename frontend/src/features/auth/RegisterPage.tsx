import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ShieldAlert } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Input, PasswordInput } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';
import { useAuth } from '../../context/AuthContext';
import { isWebCryptoSupported } from '../../utils/crypto';

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export const RegisterPage: React.FC = () => {
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register: registerAccount } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid, isDirty },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  });

  const passwordValue = watch('password', '');

  // Calculate password strength
  const calculateStrength = (pwd: string) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score; // 0 to 5
  };

  const strength = calculateStrength(passwordValue);
  const strengthLabels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Unbreakable'];
  const strengthColors = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-accent', 'bg-success', 'bg-success'];

  const onSubmit = async (data: RegisterFormData) => {
    setIsSubmitting(true);
    setAuthError(null);

    try {
      await registerAccount({
        name: data.name,
        email: data.email,
        password: data.password,
      });

      toast.success('Vault created and encryption keys initialized!');
      navigate('/app', { replace: true });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        if (detail) {
          setAuthError(typeof detail === 'string' ? detail : JSON.stringify(detail));
        } else if (err.code === 'ERR_NETWORK') {
          setAuthError('Unable to connect to the backend server. Please verify the API is running.');
        } else {
          setAuthError(err.message || 'Registration failed. Please check your credentials.');
        }
      } else if (err instanceof Error) {
        setAuthError(err.message);
      } else {
        setAuthError('An unexpected error occurred during account registration.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-navy tracking-tight">Create Your Vault</h1>
        <p className="text-xs text-muted-text mt-1">
          Zero-knowledge client keys are generated on your local machine upon registration.
        </p>
      </div>

      {/* Insecure Context Warning */}
      {!isWebCryptoSupported() && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3"
        >
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-amber-700">HTTPS / Secure Context Required</p>
            <p className="text-xs text-navy/80 leading-relaxed">
              Your browser blocks the Web Cryptography API over unencrypted public HTTP (<code className="bg-amber-100/50 px-1 py-0.5 rounded font-mono text-[11px]">http://{typeof window !== 'undefined' ? window.location.host : 'ip'}</code>) to protect encryption keys from network interception.
            </p>
            <p className="text-xs text-navy/70 leading-relaxed mt-1">
              Please access this vault over <strong>HTTPS</strong> or through a local tunnel (e.g. <code className="bg-amber-100/50 px-1 py-0.5 rounded font-mono text-[11px]">http://localhost:8080</code>).
            </p>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {authError && (
        <div
          role="alert"
          aria-live="polite"
          className="p-4 rounded-2xl bg-danger-soft border border-danger/30 flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-danger">Registration Error</p>
            <p className="text-xs text-navy/80 leading-relaxed">{authError}</p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label="Full Legal Name"
          placeholder="e.g. Elena Rostova"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Email Address"
          type="email"
          placeholder="e.g. elena@crestview-capital.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <PasswordInput
            label="Master Password"
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />

          {/* Password Strength Meter */}
          {passwordValue && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-text">
                <span>Strength:</span>
                <span className="font-medium text-navy">{strengthLabels[strength]}</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 h-1.5">
                {[1, 2, 3, 4, 5].map((level) => (
                  <div
                    key={level}
                    className={`rounded-full transition-colors ${
                      level <= strength ? strengthColors[strength] : 'bg-surface-2'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <PasswordInput
          label="Confirm Master Password"
          placeholder="Repeat master password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <div className="pt-2">
          <PillButton
            type="submit"
            disabled={!isValid || !isDirty || isSubmitting}
            className="w-full justify-center"
          >
            {isSubmitting ? 'Generating Client Keys...' : 'Generate Vault & Continue'}
          </PillButton>
        </div>
      </form>

      {/* Bottom Switcher */}
      <div className="text-center pt-4 border-t border-border">
        <p className="text-xs text-muted-text">
          Already established a vault?{' '}
          <Link to="/login" className="font-semibold text-navy hover:text-accent">
            Access your keys
          </Link>
        </p>
      </div>
    </div>
  );
};
