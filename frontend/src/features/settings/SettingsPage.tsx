import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Zap,
  Bell,
  Shield,
  Save,
} from 'lucide-react';
import { vaultService } from '../../services/vaultService';
import { useAsync } from '../../hooks/useAsync';
import type { CheckInSettings } from '../../types';
import { Switch } from '../../components/ui/Switch';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import toast from 'react-hot-toast';

export const SettingsPage: React.FC = () => {
  const {
    data: initialSettings,
    isLoading,
    isError,
    retry,
  } = useAsync(() => vaultService.getSettings(), []);

  const [settings, setSettings] = useState<CheckInSettings | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
      setIsDirty(false);
    }
  }, [initialSettings]);

  if (isLoading || !settings) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState onRetry={retry} />;
  }

  const handleIntervalChange = (mode: CheckInSettings['intervalMode'], customDays = settings.customDays) => {
    setSettings((prev) => (prev ? { ...prev, intervalMode: mode, customDays } : prev));
    setIsDirty(true);
  };

  const handleGraceChange = (days: number) => {
    setSettings((prev) => (prev ? { ...prev, gracePeriodDays: days } : prev));
    setIsDirty(true);
  };

  const handleDemoToggle = (demoMode: boolean) => {
    setSettings((prev) => (prev ? { ...prev, demoMode } : prev));
    setIsDirty(true);
  };

  const handleNotificationToggle = (
    channel: 'notifyEmail' | 'notifySms' | 'notifyPush',
    val: boolean
  ) => {
    setSettings((prev) => (prev ? { ...prev, [channel]: val } : prev));
    setIsDirty(true);
  };

  const handleDiscard = () => {
    if (initialSettings) {
      setSettings(initialSettings);
      setIsDirty(false);
      toast('Changes discarded.');
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await vaultService.updateSettings(settings);
      setIsDirty(false);
      toast.success('Heartbeat cadence and security policies saved.');
    } catch {
      toast.error('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* ── 1. HEADER ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
          Check-in Settings
        </h1>
        <p className="text-xs text-muted-text mt-0.5">
          Configure pulse cadence, grace period buffer, and demo mode evaluation rules.
        </p>
      </div>

      {/* ── 2. DEMO MODE TOGGLE CARD ──────────────────────────────── */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-[24px] p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
            <Zap className="w-4 h-4 fill-amber-500 text-amber-600" />
            <span>Interactive Demo Mode</span>
          </div>
          <p className="text-xs text-navy/80 max-w-lg leading-relaxed">
            Compresses the check-in interval to <strong>120 seconds</strong> and the grace period to <strong>60 seconds</strong>. Perfect for live presentations, grading, and testing fail-safe release transitions.
          </p>
        </div>
        <Switch
          checked={settings.demoMode}
          onChange={handleDemoToggle}
          id="demo-mode-switch"
        />
      </div>

      {/* ── 3. HEARTBEAT INTERVAL CADENCE ─────────────────────────── */}
      <div className="bg-white border border-border rounded-[24px] p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-semibold text-navy tracking-tight flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent" />
            Heartbeat Cadence
          </h2>
          <p className="text-xs text-muted-text mt-1">
            How often you are required to authenticate presence before the switch escalates.
          </p>
        </div>

        {/* Segmented Selector */}
        <div className="grid grid-cols-3 gap-2.5 max-w-md">
          {[
            { id: 'daily', label: 'Daily (24h)', days: 1 },
            { id: 'weekly', label: 'Weekly (7d)', days: 7 },
            { id: 'custom', label: 'Custom (14d)', days: 14 },
          ].map((item) => {
            const isSelected = settings.intervalMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleIntervalChange(item.id as CheckInSettings['intervalMode'], item.days)}
                className={`py-2.5 px-3 rounded-2xl text-xs font-medium border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-navy text-white border-navy shadow-xs'
                    : 'bg-surface text-navy border-border hover:bg-surface-2'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Custom Days Input if custom mode selected */}
        {settings.intervalMode === 'custom' && (
          <div className="p-4 bg-surface rounded-2xl border border-border max-w-md space-y-2">
            <label className="text-xs font-medium text-navy block">
              Custom Interval Window (Days)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={3}
                max={90}
                value={settings.customDays}
                onChange={(e) => handleIntervalChange('custom', parseInt(e.target.value, 10))}
                className="w-full accent-accent cursor-pointer"
              />
              <span className="text-xs font-mono font-bold text-navy w-12 text-right">
                {settings.customDays} days
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── 4. GRACE PERIOD SLIDER ────────────────────────────────── */}
      <div className="bg-white border border-border rounded-[24px] p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-semibold text-navy tracking-tight flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent" />
            Grace Period Safeguard
          </h2>
          <p className="text-xs text-muted-text mt-1">
            Extra buffer window after a missed deadline before keys are released to verified contacts.
          </p>
        </div>

        <div className="space-y-4 max-w-lg">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={60}
              value={settings.gracePeriodDays}
              onChange={(e) => handleGraceChange(parseInt(e.target.value, 10))}
              className="w-full accent-accent cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-navy w-16 text-right">
              {settings.gracePeriodDays} days
            </span>
          </div>

          {/* Plain language summary */}
          <div className="p-4 rounded-2xl bg-surface border border-border text-xs text-navy leading-relaxed">
            <span className="font-semibold">Fail-Safe Policy:</span> If you miss your check-in deadline, multi-channel warnings will fire immediately. Unsealing and transmission of authorized documents begins only after an additional{' '}
            <strong>{settings.gracePeriodDays} days</strong> elapse with no owner authentication.
          </div>
        </div>
      </div>

      {/* ── 5. NOTIFICATION PREFERENCES ───────────────────────────── */}
      <div className="bg-white border border-border rounded-[24px] p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-semibold text-navy tracking-tight flex items-center gap-2">
            <Bell className="w-4 h-4 text-accent" />
            Reminder Channels
          </h2>
          <p className="text-xs text-muted-text mt-1">
            Where to dispatch quiet check-in warnings before the window expires.
          </p>
        </div>

        <div className="space-y-4 max-w-lg divide-y divide-border/60">
          <div className="pt-2">
            <Switch
              checked={settings.notifyEmail}
              onChange={(v) => handleNotificationToggle('notifyEmail', v)}
              label="Encrypted Email Reminders"
              description="Deliver notifications to your primary email address 72h, 24h, and 6h prior to deadline."
            />
          </div>

          <div className="pt-4">
            <Switch
              checked={settings.notifySms}
              onChange={(v) => handleNotificationToggle('notifySms', v)}
              label="SMS Text Alerts"
              description="High-priority SMS alerts if an unacknowledged deadline approaches within 24 hours."
            />
          </div>

          <div className="pt-4">
            <Switch
              checked={settings.notifyPush}
              onChange={(v) => handleNotificationToggle('notifyPush', v)}
              label="Device Web Push Notifications"
              description="Discreet browser notifications on authorized laptops and mobile devices."
            />
          </div>
        </div>
      </div>

      {/* ── 6. STICKY SAVE BAR WHEN FORM IS DIRTY ─────────────────── */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
          >
            <div className="pointer-events-auto bg-navy text-white rounded-full px-5 py-3 shadow-lg border border-white/10 flex items-center gap-4">
              <span className="text-xs font-medium tracking-tight">
                You have unsaved policy adjustments
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={isSaving}
                  className="px-3 py-1 rounded-full text-xs text-white/70 hover:text-white transition-colors cursor-pointer"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-navy font-semibold text-xs hover:bg-surface transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
