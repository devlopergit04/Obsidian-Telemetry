import React, { useState } from 'react';
import { CheckCircle2, Sliders } from 'lucide-react';
import {
  ClusterData,
  IncidentSeverity,
  InspectorSelection,
} from '../types/telemetry';
import { StatusBadge } from './StatusBadge';

interface IncidentsScreenProps {
  cluster: ClusterData;
  selectedInspector: InspectorSelection | null;
  onInspect: (selection: InspectorSelection) => void;
  onAcknowledgeIncident: (incidentId: string) => void;
  onResolveIncident: (incidentId: string) => void;
  onToggleRule: (ruleId: string) => void;
  onUpdateRuleThreshold: (ruleId: string, threshold: number) => void;
}

export const IncidentsScreen: React.FC<IncidentsScreenProps> = ({
  cluster,
  selectedInspector,
  onInspect,
  onAcknowledgeIncident,
  onResolveIncident,
  onToggleRule,
  onUpdateRuleThreshold,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | IncidentSeverity>('ALL');

  const filteredIncidents = cluster.incidents.filter(
    (inc) => severityFilter === 'ALL' || inc.severity === severityFilter
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
            Incidents &amp; Alert Rules
          </h1>
          <p className="font-mono text-xs text-slate-400 mt-0.5">
            Active incident queue &amp; Prometheus evaluation thresholds for {cluster.name}
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#0a0e16] border border-slate-800 rounded p-0.5">
          {(
            [
              { id: 'ALL', label: 'All' },
              { id: IncidentSeverity.CRITICAL, label: 'Critical' },
              { id: IncidentSeverity.WARNING, label: 'Warning' },
              { id: IncidentSeverity.RESOLVED, label: 'Resolved' },
            ] as { id: 'ALL' | IncidentSeverity; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSeverityFilter(tab.id)}
              className={`px-2.5 py-1 rounded-xs font-mono text-[11px] transition-colors ${
                severityFilter === tab.id
                  ? 'bg-[#1E293B] text-[#4cd7f6] font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Incident Queue */}
      <section className="space-y-3">
        {filteredIncidents.length === 0 ? (
          <div className="glass-panel rounded p-8 text-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
            <div className="font-display text-sm font-medium text-[#dfe2ee]">
              No matching incidents in {cluster.name}
            </div>
            <p className="font-mono text-xs text-slate-400 mt-1">
              All monitored SLO probes are within nominal bounds.
            </p>
          </div>
        ) : (
          filteredIncidents.map((inc) => {
            const isSelected =
              selectedInspector?.kind === 'incident' &&
              selectedInspector.id === inc.id;
            const isCritical = inc.severity === IncidentSeverity.CRITICAL;

            return (
              <div
                key={inc.id}
                onClick={() => onInspect({ kind: 'incident', id: inc.id })}
                className={`glass-panel rounded p-4 cursor-pointer transition-all ${
                  isSelected
                    ? isCritical
                      ? 'glow-critical'
                      : 'glow-cyan-focus'
                    : 'hover:border-slate-700'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs font-semibold text-[#4cd7f6]">
                        {inc.id}
                      </span>
                      <StatusBadge status={inc.severity} compact />
                      {inc.acknowledged && inc.severity !== IncidentSeverity.RESOLVED && (
                        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-amber-300">
                          Acknowledged
                        </span>
                      )}
                    </div>
                    <h2 className="font-display text-sm font-semibold text-[#dfe2ee]">
                      {inc.title}
                    </h2>
                    <div className="font-mono text-[11px] text-slate-400">
                      {inc.targetResource} · {inc.nodeIp} · Opened {inc.openedAt} · Duration{' '}
                      {inc.duration}
                    </div>
                  </div>

                  {inc.severity !== IncidentSeverity.RESOLVED && (
                    <div
                      className="flex items-center gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onAcknowledgeIncident(inc.id)}
                        disabled={inc.acknowledged}
                        className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                          inc.acknowledged
                            ? 'bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-slate-900/70 border-slate-700 text-slate-200 hover:border-amber-400/50'
                        }`}
                      >
                        {inc.acknowledged ? 'Acked' : 'Acknowledge'}
                      </button>
                      <button
                        onClick={() => onResolveIncident(inc.id)}
                        className="px-3 py-1.5 rounded text-xs font-mono bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Alert Threshold Rules Table */}
      <section className="glass-panel rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#4cd7f6]" />
          <div>
            <h2 className="font-display text-sm font-semibold text-[#dfe2ee]">
              Alert Threshold Policies
            </h2>
            <p className="font-mono text-[11px] text-slate-400">
              Tune PromQL trigger thresholds and active state per cluster
            </p>
          </div>
        </div>

        <div className="overflow-x-auto micro-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#111827]/90 border-b border-slate-800/90 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                <th className="py-2.5 px-4 font-semibold">Rule Name</th>
                <th className="py-2.5 px-3 font-semibold">PromQL Metric</th>
                <th className="py-2.5 px-3 font-semibold">Live Eval</th>
                <th className="py-2.5 px-3 font-semibold text-right">Threshold</th>
                <th className="py-2.5 px-3 font-semibold text-right">Severity</th>
                <th className="py-2.5 px-4 font-semibold text-right">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {cluster.alertRules.map((rule) => {
                let breachingCount = 0;
                if (rule.enabled) {
                  if (rule.metric.includes('cpu')) {
                    breachingCount = cluster.nodes.filter((n) => n.cpuPercent > rule.threshold).length;
                  } else if (rule.metric.includes('memory')) {
                    breachingCount = cluster.nodes.filter((n) => n.memoryPercent > rule.threshold).length;
                  } else if (rule.metric.includes('p99') || rule.metric.includes('latency')) {
                    breachingCount = cluster.services.filter((s) => s.p99Ms > rule.threshold).length;
                  } else if (rule.metric.includes('restarts')) {
                    breachingCount = cluster.pods.filter((p) => p.restarts > rule.threshold).length;
                  } else {
                    breachingCount = cluster.nodes.filter((n) => n.cpuPercent > rule.threshold).length;
                  }
                }

                return (
                  <tr key={rule.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-2.5 px-4 text-[#dfe2ee] font-medium whitespace-nowrap">
                      {rule.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {rule.metric} {rule.condition} ({rule.evaluationWindow})
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {!rule.enabled ? (
                        <span className="text-slate-500">MUTED</span>
                      ) : breachingCount > 0 ? (
                        <span className="text-red-400 font-semibold tabular-nums">
                          FIRING ({breachingCount})
                        </span>
                      ) : (
                        <span className="text-emerald-400">OK (0)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <input
                          type="number"
                          value={rule.threshold}
                          min={1}
                          max={1000}
                          onChange={(e) =>
                            onUpdateRuleThreshold(rule.id, Math.max(1, Number(e.target.value)))
                          }
                          aria-label={`Threshold for ${rule.name}`}
                          className="w-16 text-right rounded bg-slate-950/80 border border-slate-800 px-2 py-1 text-xs text-[#4cd7f6] tabular-nums focus:outline-none focus:border-[#06B6D4]"
                        />
                        <span className="text-slate-400 text-[11px]">{rule.unit}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <StatusBadge status={rule.severity} compact />
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => onToggleRule(rule.id)}
                        className={`px-2.5 py-1 rounded border text-[11px] transition-colors ${
                          rule.enabled
                            ? 'bg-[#06B6D4]/15 border-[#06B6D4]/40 text-[#4cd7f6]'
                            : 'bg-slate-900/70 border-slate-800 text-slate-500'
                        }`}
                      >
                        {rule.enabled ? 'ENABLED' : 'MUTED'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
