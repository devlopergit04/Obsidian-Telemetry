import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, PauseCircle, XOctagon } from 'lucide-react';
import type { HealthStatus, IncidentSeverity } from '../shared/types.ts';

interface StatusBadgeProps {
  status: HealthStatus | IncidentSeverity;
  compact?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, compact = false }) => {
  const config: Record<
    HealthStatus | IncidentSeverity,
    { classes: string; icon: React.ReactNode; label: string }
  > = {
    HEALTHY: {
      classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      icon: <CheckCircle2 className="w-3 h-3 shrink-0" />,
      label: 'HEALTHY',
    },
    DEGRADED: {
      classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      icon: <AlertTriangle className="w-3 h-3 shrink-0" />,
      label: 'DEGRADED',
    },
    CRASHED: {
      classes: 'bg-red-500/10 text-red-400 border-red-500/30',
      icon: <XOctagon className="w-3 h-3 shrink-0" />,
      label: 'CRASHED',
    },
    CORDONED: {
      classes: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
      icon: <PauseCircle className="w-3 h-3 shrink-0" />,
      label: 'CORDONED',
    },
    UNKNOWN: {
      classes: 'bg-slate-600/15 text-slate-400 border-slate-600/40',
      icon: <HelpCircle className="w-3 h-3 shrink-0" />,
      label: 'UNKNOWN',
    },
    CRITICAL: {
      classes: 'bg-red-500/10 text-red-400 border-red-500/30',
      icon: <XOctagon className="w-3 h-3 shrink-0" />,
      label: 'CRITICAL',
    },
    WARNING: {
      classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      icon: <AlertTriangle className="w-3 h-3 shrink-0" />,
      label: 'WARNING',
    },
    RESOLVED: {
      classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      icon: <CheckCircle2 className="w-3 h-3 shrink-0" />,
      label: 'RESOLVED',
    },
  };

  const item = config[status] || config.UNKNOWN;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-mono uppercase tracking-[0.06em] whitespace-nowrap shrink-0 ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[10px] font-medium'
      } ${item.classes}`}
    >
      {item.icon}
      <span>{item.label}</span>
    </span>
  );
};
