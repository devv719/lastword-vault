import React, { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Lock,
  Users,
  Settings,
  History,
  Menu,
  X,
  Zap,
  CheckCircle2,
  LogOut,
} from 'lucide-react';
import { LastWordMark } from '../ui/LastWordMark';
import { VaultStatusChip } from '../ui/Badge';
import { vaultService } from '../../services/vaultService';
import type { CheckInSettings, VaultSummary } from '../../types';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/app', icon: LayoutDashboard },
  { label: 'My Vault', to: '/app/vault', icon: Lock },
  { label: 'Trusted Contacts', to: '/app/contacts', icon: Users },
  { label: 'Check-in Settings', to: '/app/settings', icon: Settings },
  { label: 'Activity Logs', to: '/app/activity', icon: History },
];

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [summary, setSummary] = useState<VaultSummary | null>(null);
  const [settings, setSettings] = useState<CheckInSettings | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Signed out successfully');
    } catch {
      toast.error('Sign out error');
    }
  };

  const loadData = async () => {
    try {
      const [sum, sett] = await Promise.all([
        vaultService.getSummary(),
        vaultService.getSettings(),
      ]);
      setSummary(sum);
      setSettings(sett);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleQuickCheckin = async () => {
    setIsCheckingIn(true);
    try {
      const updated = await vaultService.checkInNow();
      setSummary(updated);
      toast.success('Heartbeat check-in recorded. Countdown reset.');
    } catch {
      toast.error('Check-in failed. Try again.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-navy flex flex-col md:flex-row">
      {/* Persistent Demo Mode Banner */}
      {settings?.demoMode && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-medium text-center flex items-center justify-center gap-2 shadow-sm">
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span>
            <strong>DEMO MODE ACTIVE:</strong> Interval is accelerated to 2 minutes for testing.
          </span>
          <Link
            to="/app/settings"
            className="underline underline-offset-2 hover:text-white transition-colors ml-1"
          >
            Adjust in Settings
          </Link>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col w-64 bg-surface border-r border-border shrink-0 fixed inset-y-0 left-0 z-30 ${
          settings?.demoMode ? 'top-8' : 'top-0'
        }`}
      >
        {/* Brand */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2.5 group">
            <LastWordMark size={24} className="text-navy group-hover:text-accent transition-colors" />
            <div>
              <span className="font-semibold text-sm tracking-tight text-navy block leading-none">
                LastWord
              </span>
              <span className="text-[10px] font-mono text-muted-text mt-0.5 block">
                Vault Console
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="App Sidebar">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.to === '/app'
                ? location.pathname === '/app'
                : location.pathname.startsWith(item.to);

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative flex items-center gap-3 px-3.5 py-2.5 rounded-full text-xs font-medium transition-colors select-none ${
                  isActive ? 'text-navy font-semibold' : 'text-muted-text hover:text-navy hover:bg-surface-2'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeSidebarIndicator"
                    className="absolute inset-0 bg-white rounded-full shadow-xs border border-border"
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  />
                )}
                <item.icon
                  className={`w-4 h-4 relative z-10 shrink-0 ${
                    isActive ? 'text-accent' : 'text-muted-text'
                  }`}
                  strokeWidth={isActive ? 2 : 1.75}
                />
                <span className="relative z-10 tracking-tight">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Status & User profile */}
        <div className="p-4 border-t border-border space-y-3 bg-surface">
          {/* Status Chip */}
          <div className="px-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-text mb-1.5">
              Switch Status
            </div>
            {summary ? (
              <VaultStatusChip status={summary.status} className="w-full justify-center" />
            ) : (
              <div className="h-6 bg-surface-2 animate-pulse rounded-full" />
            )}
          </div>

          {/* User badge */}
          <div className="pt-3 border-t border-border flex items-center justify-between px-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-accent-soft text-accent border border-accent/20 flex items-center justify-center font-medium text-xs shrink-0 uppercase">
                {user?.display_name ? user.display_name.slice(0, 2) : 'LW'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-navy truncate tracking-tight">
                  {user?.display_name || 'Enclave Owner'}
                </p>
                <p className="text-[10px] text-muted-text truncate font-mono">
                  {user?.email || 'Authenticated'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out & revoke session"
              className="p-1.5 rounded-lg text-muted-text hover:text-navy hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <div
        className={`md:hidden sticky z-40 bg-white/90 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between ${
          settings?.demoMode ? 'top-7' : 'top-0'
        }`}
      >
        <Link to="/" className="inline-flex items-center gap-2">
          <LastWordMark size={22} />
          <span className="font-semibold text-sm text-navy tracking-tight">LastWord</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleQuickCheckin}
            disabled={isCheckingIn}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-navy text-white hover:bg-navy/90 transition-colors shadow-xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Check In</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation drawer"
            className="p-2 rounded-full text-muted-text hover:text-navy hover:bg-surface-2"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-navy/30 backdrop-blur-xs"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-72 max-w-[80vw] bg-surface h-full flex flex-col justify-between p-6 shadow-xl border-r border-border"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <LastWordMark size={22} />
                    <span className="font-semibold text-sm text-navy">LastWord</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1 rounded-full text-muted-text hover:text-navy"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="space-y-1">
                  {NAV_ITEMS.map((item) => {
                    const isActive =
                      item.to === '/app'
                        ? location.pathname === '/app'
                        : location.pathname.startsWith(item.to);

                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-full text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-white text-navy font-semibold shadow-xs border border-border'
                            : 'text-muted-text hover:text-navy'
                        }`}
                      >
                        <item.icon className="w-4 h-4 text-accent" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>

              {/* Drawer Bottom */}
              <div className="pt-6 border-t border-border space-y-4">
                {summary && <VaultStatusChip status={summary.status} className="w-full justify-center" />}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2 text-center text-xs text-danger hover:underline pt-2 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out & lock vault</span>
                </button>
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-center text-xs text-muted-text hover:text-navy"
                >
                  Exit to Landing Overview
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div
        className={`flex-1 md:ml-64 flex flex-col min-h-screen ${
          settings?.demoMode ? 'md:pt-8' : ''
        }`}
      >
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
