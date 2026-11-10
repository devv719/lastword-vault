import React, { useState } from 'react';
import {
  History,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { vaultService } from '../../services/vaultService';
import { useAsync } from '../../hooks/useAsync';
import type { ActivityEvent, ActivityEventType } from '../../types';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';

export const ActivityPage: React.FC = () => {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data: activities,
    isLoading,
    isError,
    retry,
  } = useAsync(() => vaultService.getActivityEvents(), []);

  // Filter activities
  const filtered = (activities ?? []).filter((act) => {
    const matchesType = selectedType === 'all' || act.type === selectedType;
    const matchesQuery =
      act.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      act.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      act.device.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesQuery;
  });

  // Group events by formatted day
  const groupedByDay: { [day: string]: ActivityEvent[] } = {};
  filtered.forEach((act) => {
    const day = new Date(act.timestamp).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (!groupedByDay[day]) groupedByDay[day] = [];
    groupedByDay[day].push(act);
  });

  const getEventBadge = (type: ActivityEventType) => {
    switch (type) {
      case 'checkin':
        return <Badge variant="success" size="sm">Heartbeat Check-in</Badge>;
      case 'warning':
        return <Badge variant="warning" size="sm">Warning Dispatch</Badge>;
      case 'transition':
        return <Badge variant="accent" size="sm">State Guard</Badge>;
      case 'release':
        return <Badge variant="danger" size="sm">Release Executed</Badge>;
      case 'contact_verification':
        return <Badge variant="default" size="sm">Contact Verification</Badge>;
      case 'item_update':
        return <Badge variant="neutral" size="sm">Vault Modification</Badge>;
      default:
        return <Badge variant="default" size="sm">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* ── 1. HEADER ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
            Activity & Audit Logs
          </h1>
          <p className="text-xs text-muted-text mt-0.5">
            Immutable cryptographic ledger recording every pulse, state evaluation, and release challenge.
          </p>
        </div>
      </div>

      {/* ── 2. FILTER & SEARCH STRIP ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-border rounded-2xl p-3 shadow-xs">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-muted-text absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search audit trail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-border rounded-full pl-9 pr-3.5 py-1.5 text-xs text-navy placeholder:text-muted-text focus:outline-none focus:bg-white focus:border-accent"
          />
        </div>

        {/* Filter select */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Filter className="w-3.5 h-3.5 text-muted-text" />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-surface border border-border rounded-full px-3 py-1.5 text-xs text-navy focus:outline-none cursor-pointer"
          >
            <option value="all">All event types</option>
            <option value="checkin">Check-ins</option>
            <option value="warning">Warnings</option>
            <option value="transition">State Transitions</option>
            <option value="contact_verification">Contact Verification</option>
            <option value="item_update">Vault Modifications</option>
            <option value="release">Releases</option>
          </select>
        </div>
      </div>

      {/* ── 3. TIMELINE GROUPED BY DAY ────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={retry} />
      ) : Object.keys(groupedByDay).length === 0 ? (
        <EmptyState
          title="No audit events found"
          description="Try adjusting your filter or search terms."
          icon={<History className="w-6 h-6" />}
          badge="LEDGER: 0"
        />
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedByDay).map(([day, events]) => (
            <div key={day} className="space-y-3">
              {/* Day Header Pill */}
              <div className="sticky top-16 sm:top-20 z-10">
                <span className="inline-block text-[11px] font-mono uppercase tracking-wider text-muted-text bg-surface-2 px-3 py-1 rounded-full border border-border/80">
                  {day}
                </span>
              </div>

              {/* Event Cards */}
              <div className="bg-white border border-border rounded-[24px] divide-y divide-border/60 shadow-xs overflow-hidden">
                {events.map((act) => {
                  const isExpanded = expandedId === act.id;

                  return (
                    <div key={act.id} className="p-4 sm:p-5 hover:bg-surface/40 transition-colors">
                      <div
                        onClick={() => setExpandedId(isExpanded ? null : act.id)}
                        className="flex items-start justify-between gap-4 cursor-pointer select-none"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {getEventBadge(act.type)}
                            {act.fromState && act.toState && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-navy">
                                {act.fromState.toUpperCase()} → {act.toState.toUpperCase()}
                              </span>
                            )}
                            <span className="text-[11px] font-mono text-muted-text">
                              {new Date(act.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          </div>

                          <h4 className="text-sm font-semibold text-navy tracking-tight pt-1">
                            {act.title}
                          </h4>
                          <p className="text-xs text-muted-text leading-relaxed">
                            {act.description}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="p-1 rounded-full text-muted-text hover:text-navy shrink-0 cursor-pointer"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Expandable Technical Metadata */}
                      {isExpanded && (
                        <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-text bg-surface/70 rounded-xl p-3 font-mono text-[11px]">
                          <div>
                            <span className="text-muted-text/70 block text-[9px] uppercase">
                              Origin Device
                            </span>
                            <span className="text-navy font-sans text-xs">{act.device}</span>
                          </div>
                          <div>
                            <span className="text-muted-text/70 block text-[9px] uppercase">
                              Authentication Method
                            </span>
                            <span className="text-navy">{act.method}</span>
                          </div>
                          <div>
                            <span className="text-muted-text/70 block text-[9px] uppercase">
                              Masked IP Signature
                            </span>
                            <span className="text-navy">{act.ipAddress}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
