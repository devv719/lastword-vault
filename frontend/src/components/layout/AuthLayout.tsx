import React, { useRef } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { LastWordMark } from '../ui/LastWordMark';
import { Shield, KeyRound, Clock, ArrowRight } from 'lucide-react';
import { PixelSky } from '../hero/PixelSky';

export const AuthLayout: React.FC = () => {
  const brandHoleRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Bar with brand */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-2">
        <Link to="/" className="inline-flex items-center gap-2 group">
          <LastWordMark size={24} className="text-navy group-hover:text-accent transition-colors" />
          <span className="font-semibold text-navy text-base tracking-tight">LastWord</span>
        </Link>
        <Link
          to="/"
          className="text-xs font-medium text-muted-text hover:text-navy transition-colors inline-flex items-center gap-1"
        >
          Back to overview
        </Link>
      </header>

      {/* Main Split Grid */}
      <main className="max-w-5xl w-full mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Form Container (left/center) */}
        <div className="lg:col-span-7 flex justify-center">
          <div className="w-full max-w-md bg-white border border-border rounded-[28px] p-6 sm:p-8 shadow-[0_2px_8px_rgba(11,27,51,0.04),0_16px_40px_rgba(11,27,51,0.06)]">
            <Outlet />
          </div>
        </div>

        {/* Calm Brand Panel with Pixel Sky Accent (hidden on mobile, right side) */}
        <div className="hidden lg:flex lg:col-span-5 flex-col justify-center">
          <div className="relative rounded-[28px] overflow-hidden p-7 border border-black/5 min-h-[460px] flex flex-col justify-between shadow-sm">
            {/* Pixel sky background */}
            <PixelSky holeRef={brandHoleRef} cell={16} speed={0.00003} />

            {/* Inner White Cutout Card */}
            <div
              ref={brandHoleRef}
              className="relative z-10 bg-white/95 backdrop-blur-xs border border-border/70 rounded-2xl p-6 shadow-xs space-y-5"
            >
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft text-accent text-xs font-medium">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Zero-knowledge client keys</span>
                </div>
                <h2 className="text-2xl font-normal text-navy tracking-tight leading-snug">
                  Your secrets,{' '}
                  <span className="font-serif italic">unsealed</span> only when silence is permanent.
                </h2>
                <p className="text-xs text-muted-text leading-relaxed">
                  LastWord monitors periodic heartbeat check-ins. If you miss your window and the grace period expires, authorized files and directives are shared with your designated contacts.
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t border-border/80">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-surface-2 text-accent shrink-0">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-navy">Client-Side Keys</p>
                    <p className="text-[11px] text-muted-text mt-0.5">
                      Decryption keys never touch remote servers until the automated release protocol fires.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-surface-2 text-accent shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-navy">Configurable Grace Guard</p>
                    <p className="text-[11px] text-muted-text mt-0.5">
                      Multi-stage warnings prevent accidental triggers. Cancel anytime with a simple pulse.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom mini mark */}
            <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-navy/80 px-2 pt-2">
              <span>VAULT SECURE</span>
              <span className="text-navy font-semibold">AES-256</span>
            </div>
          </div>
        </div>
      </main>

      {/* Dev-only Footer */}
      <footer className="max-w-6xl w-full mx-auto py-4 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-2 border border-border text-xs text-muted-text">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span>Dev Preview:</span>
          <Link
            to="/app"
            className="font-medium text-navy hover:text-accent underline underline-offset-2 inline-flex items-center gap-1"
          >
            Preview the app UI without signing in <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </footer>
    </div>
  );
};
