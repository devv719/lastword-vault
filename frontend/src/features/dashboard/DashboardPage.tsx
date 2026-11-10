import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  Lock,
  Users,
  Shield,
  RefreshCw,
  FileText,
  Key,
  ChevronRight,
} from 'lucide-react';
import { vaultService } from '../../services/vaultService';
import { useAsync } from '../../hooks/useAsync';
import { useCountdown } from '../../hooks/useCountdown';
import { VaultStatusChip } from '../../components/ui/Badge';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { Sparkline } from '../../components/ui/Sparkline';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const {
    data: summary,
    isLoading,
    isError,
    retry,
    setData: setSummary,
  } = useAsync(() => vaultService.getSummary(), []);

  const {
    data: contacts,
  } = useAsync(() => vaultService.getContacts(), []);

  const {
    data: activities,
  } = useAsync(() => vaultService.getActivityEvents(), []);

  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // Countdown timer hook ticking every second
  const countdown = useCountdown(
    summary?.secondsRemaining ?? 0,
    summary?.totalSecondsInInterval ?? 1209600
  );

  const handleCheckInNow = async () => {
    setIsCheckingIn(true);
    try {
      const updated = await vaultService.checkInNow();
      setSummary(updated);
      toast.success('Heartbeat check-in authenticated. Fail-safe timer reset.');
    } catch {
      toast.error('Check-in failed. Please retry.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError || !summary) {
    return <ErrorState onRetry={retry} />;
  }

  // Formatting date for last check-in
  const formatTimeAgo = (isoString: string) => {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="space-y-8">
      {/* ── 1. GREETING ROW & LIVE STATUS ─────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-muted-text">
            Owner Enclave • Nominal
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight mt-0.5">
            Welcome back, {user?.display_name || 'Enclave Owner'}.
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Tiny static low-res pixel sky status art */}
          <div
            className="w-10 h-7 rounded-lg overflow-hidden border border-[#BAE0FD] relative flex items-center justify-center select-none shadow-xs"
            title="Heartbeat Mesh Active"
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'radial-gradient(#00A8FF 1.5px, transparent 1.5px), radial-gradient(#7BCBFF 1.5px, #FFFFFF 1.5px)',
                backgroundSize: '4px 4px',
                backgroundPosition: '0 0, 2px 2px',
              }}
              aria-hidden="true"
            />
            <span className="relative z-10 w-2 h-2 rounded-full bg-success animate-pulse" />
          </div>
          <VaultStatusChip status={countdown.state} />
        </div>
      </div>

      {/* ── 2. DENSE KPI STRIP (Schneider EMS Style) ──────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Last Check-in */}
        <div className="bg-white border border-border rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-text">
            <span>Last Verified Pulse</span>
            <Sparkline data={[12, 14, 13, 15, 14, 18, 17, 20]} width={50} height={16} color="#2F7D5B" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold text-navy tracking-tight">
              {formatTimeAgo(summary.lastCheckinAt)}
            </span>
            <span className="text-[10px] text-success font-medium flex items-center gap-0.5">
              +100% verified
            </span>
          </div>
        </div>

        {/* KPI 2: Next Deadline */}
        <div className="bg-white border border-border rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-text">
            <span>Check-in Deadline</span>
            <Sparkline data={[20, 18, 16, 14, 12, 10, 8, 6]} width={50} height={16} color="#3D5A8A" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold text-navy tracking-tight font-mono">
              {countdown.days}d {countdown.hours}h
            </span>
            <span className="text-[10px] text-accent font-medium">
              {countdown.percentage}% window
            </span>
          </div>
        </div>

        {/* KPI 3: Vault Inventory */}
        <div className="bg-white border border-border rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-text">
            <span>Protected Items</span>
            <Lock className="w-3.5 h-3.5 text-accent" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold text-navy tracking-tight">
              {summary.totalItems} <small className="text-xs font-normal text-muted-text">items</small>
            </span>
            <span className="text-[10px] text-muted-text">
              {summary.authorizedItems} authorized
            </span>
          </div>
        </div>

        {/* KPI 4: Trusted Contacts */}
        <div className="bg-white border border-border rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-text">
            <span>Trusted Contacts</span>
            <Users className="w-3.5 h-3.5 text-accent" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold text-navy tracking-tight">
              {summary.contactsCount} <small className="text-xs font-normal text-muted-text">assigned</small>
            </span>
            <span className="text-[10px] text-success font-medium">
              {summary.verifiedContactsCount} verified
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. LARGE COUNTDOWN CARD & GIANT CHECK-IN BUTTON ───────── */}
      <div className="bg-white border border-border rounded-[28px] p-6 sm:p-10 shadow-sm relative overflow-hidden flex flex-col lg:flex-row items-center justify-between gap-8">
        {/* Subtle background glow changing with countdown state */}
        <div
          className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-1000"
          style={{ backgroundColor: countdown.stateColor }}
        />

        {/* Left: Timer readout & Ring */}
        <div className="flex items-center gap-6 sm:gap-8 w-full lg:w-auto">
          <ProgressRing
            percentage={countdown.percentage}
            size={96}
            strokeWidth={7}
            color={countdown.stateColor}
            trackColor="#EEF0F4"
            showText
            label="REMAINING"
          />

          <div className="space-y-1">
            <span className="text-xs font-mono uppercase tracking-widest text-muted-text flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Fail-Safe Countdown
            </span>
            <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-navy tracking-tight font-mono">
              {countdown.formatted}
            </div>
            <p className="text-xs text-muted-text">
              Target deadline:{' '}
              <span className="font-medium text-navy">
                {new Date(summary.nextDeadline).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </p>
          </div>
        </div>

        {/* Right: Giant Check In Button with press spring */}
        <div className="w-full lg:w-auto flex flex-col sm:flex-row items-center gap-4">
          <motion.button
            whileTap={{ scale: 0.94 }}
            whileHover={{ scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            onClick={handleCheckInNow}
            disabled={isCheckingIn}
            className="w-full sm:w-auto px-8 py-5 rounded-full bg-navy text-white text-base sm:text-lg font-semibold tracking-tight shadow-md hover:bg-navy/90 active:bg-navy transition-all flex items-center justify-center gap-3 cursor-pointer select-none disabled:opacity-60"
          >
            {isCheckingIn ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Signing Heartbeat...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Check In Now</span>
              </>
            )}
          </motion.button>
        </div>
      </div>

      {/* ── 4. VAULT SUMMARY & TRUSTED CONTACTS & RECENT ACTIVITY ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Module A: Vault Summary */}
        <div className="bg-white border border-border rounded-[24px] p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-navy tracking-tight">Vault Allocation</h3>
              <Link to="/app/vault" className="text-xs text-accent font-medium hover:underline">
                Manage →
              </Link>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-text flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-accent" /> Encrypted Files
                </span>
                <span className="font-semibold text-navy">{summary.filesCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-text flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-accent" /> Secure Notes & Keys
                </span>
                <span className="font-semibold text-navy">{summary.notesCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-text flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-success" /> Release-Authorized
                </span>
                <span className="font-semibold text-success">{summary.authorizedItems} of {summary.totalItems}</span>
              </div>
            </div>

            {/* Allocation percentage bar */}
            <div className="mt-6 pt-4 border-t border-border">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted-text">Assigned to Recipients</span>
                <span className="font-medium text-navy">{summary.assignedPercentage}%</span>
              </div>
              <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-500"
                  style={{ width: `${summary.assignedPercentage}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-border/80">
            <Link
              to="/app/vault"
              className="text-xs text-muted-text hover:text-navy flex items-center justify-between"
            >
              <span>Add new document or note</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Module B: Trusted Contacts Summary */}
        <div className="bg-white border border-border rounded-[24px] p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-navy tracking-tight">Designated Recipients</h3>
              <Link to="/app/contacts" className="text-xs text-accent font-medium hover:underline">
                Directory →
              </Link>
            </div>

            <div className="space-y-3">
              {(contacts ?? []).slice(0, 3).map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-border/60"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-accent-soft text-accent text-xs font-semibold flex items-center justify-center shrink-0">
                      {contact.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-navy truncate">{contact.name}</p>
                      <p className="text-[10px] text-muted-text truncate">{contact.relationship}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono uppercase text-muted-text">
                    {contact.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-border/80">
            <Link
              to="/app/contacts"
              className="text-xs text-muted-text hover:text-navy flex items-center justify-between"
            >
              <span>Verify remaining contacts</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Module C: Recent Activity Feed */}
        <div className="bg-white border border-border rounded-[24px] p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-navy tracking-tight">Audit Trail</h3>
              <Link to="/app/activity" className="text-xs text-accent font-medium hover:underline">
                Full Log →
              </Link>
            </div>

            <div className="space-y-3">
              {(activities ?? []).slice(0, 4).map((act) => (
                <div key={act.id} className="text-xs flex items-start gap-2.5 pb-2.5 border-b border-border/40 last:border-0 last:pb-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-navy truncate">{act.title}</p>
                    <p className="text-[11px] text-muted-text font-mono mt-0.5">
                      {new Date(act.timestamp).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-border/80">
            <Link
              to="/app/activity"
              className="text-xs text-muted-text hover:text-navy flex items-center justify-between"
            >
              <span>View full cryptographically logged ledger</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
