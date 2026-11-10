import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LastWordMark } from '../ui/LastWordMark';
import { PillButton } from '../ui/PillButton';

interface NodeClock {
  region: string;
  location: string;
  timeZone: string;
  status: 'nominal' | 'pulse';
}

const NODES: NodeClock[] = [
  { region: 'us-east-1', location: 'N. Virginia', timeZone: 'America/New_York', status: 'nominal' },
  { region: 'eu-central-1', location: 'Frankfurt', timeZone: 'Europe/Berlin', status: 'nominal' },
  { region: 'ap-south-1', location: 'Mumbai', timeZone: 'Asia/Kolkata', status: 'nominal' },
  { region: 'ap-northeast-1', location: 'Tokyo', timeZone: 'Asia/Tokyo', status: 'nominal' },
];

export const MarketingFooter: React.FC = () => {
  const [time, setTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatNodeTime = (tz: string) => {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(time);
  };

  return (
    <footer className="bg-surface border-t border-border mt-20 pt-16 pb-12 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        {/* Top Callout */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-12 border-b border-border">
          <div>
            <div className="flex items-center gap-2 text-navy">
              <LastWordMark size={20} />
              <span className="font-semibold tracking-tight text-base">LastWord</span>
            </div>
            <p className="text-sm text-muted-text mt-1 max-w-sm leading-relaxed">
              Fail-safe cryptographic release for your most sensitive documents and personal directives.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/app"
              className="text-xs font-mono text-muted-text hover:text-navy px-3 py-1.5 rounded-full border border-border bg-white transition-colors"
            >
              Console UI preview →
            </Link>
            <PillButton to="/register" size="sm">
              Create your vault
            </PillButton>
          </div>
        </div>

        {/* Global Node Status Clocks */}
        <div className="py-8 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-mono uppercase tracking-widest text-muted-text">
              Fail-Safe Heartbeat Mesh • All Nodes Nominal
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-success font-medium">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              99.998% Uptime
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {NODES.map((node) => (
              <div
                key={node.region}
                className="bg-white border border-border/80 rounded-2xl p-3.5 shadow-xs"
              >
                <div className="flex items-center justify-between text-[11px] text-muted-text">
                  <span className="font-mono">{node.region}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                </div>
                <div className="text-sm font-semibold text-navy mt-1">
                  {node.location}
                </div>
                <div className="text-xs font-mono text-accent mt-0.5">
                  {formatNodeTime(node.timeZone)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Large Signature Wordmark */}
        <div className="pt-12 pb-8 flex flex-col md:flex-row items-baseline justify-between gap-6">
          <div className="text-4xl sm:text-6xl md:text-7xl font-serif italic tracking-tighter text-navy/20 select-none hover:text-navy/30 transition-colors">
            LastWord.
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-muted-text">
            <a href="#how-it-works" className="hover:text-navy transition-colors">
              Protocol
            </a>
            <a href="#security" className="hover:text-navy transition-colors">
              Security
            </a>
            <a href="#faq" className="hover:text-navy transition-colors">
              FAQ
            </a>
            <Link to="/login" className="hover:text-navy transition-colors">
              Access Vault
            </Link>
            <span className="text-border">|</span>
            <span className="font-mono text-[11px]">v1.0.0-rc</span>
          </div>
        </div>

        {/* Pixel sky accent edge */}
        <div
          className="h-1.5 w-full rounded-full opacity-60 mb-4"
          style={{
            backgroundImage:
              'radial-gradient(#00A8FF 1px, transparent 1px), radial-gradient(#7BCBFF 1px, transparent 1px)',
            backgroundSize: '8px 8px',
            backgroundPosition: '0 0, 4px 4px',
          }}
          aria-hidden="true"
        />

        {/* Bottom copyright & attribution */}
        <div className="text-xs text-muted-text flex flex-col sm:flex-row justify-between items-center gap-2 pt-4 border-t border-border/60">
          <p>© {new Date().getFullYear()} LastWord Vault. Zero-knowledge cryptographic preservation.</p>
          <p className="font-mono text-[11px]">Strictly light-mode • Built with precision</p>
        </div>
      </div>
    </footer>
  );
};

