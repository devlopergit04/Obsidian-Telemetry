import React, { useState } from 'react';
import { CheckCircle2, Play, Search, Sliders } from 'lucide-react';
import { apiClient } from '../api/client.ts';
import type {
  AuthSession,
  ClusterSnapshot,
  IncidentSeverity,
  InspectorSelection,
  PromQLQueryResult,
} from '../shared/types.ts';
import { StatusBadge } from './StatusBadge.tsx';

interface IncidentsScreenProps {
  snapshot: ClusterSnapshot;
  session: AuthSession;
  selectedInspector: InspectorSelection | null;
  onInspect: (selection: InspectorSelection) => void;
  onAcknowledgeIncident: (incidentId: string) => void;
  onResolveIncident: (incidentId: string) => void;
}

export const IncidentsScreen: React.FC<IncidentsScreenProps> = ({
  snapshot,
  session,
  selectedInspector,
  onInspect,
  onAcknowledgeIncident,
  onResolveIncident,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | IncidentSeverity>('ALL');
  const [promQuery, setPromQuery] = useState<string>('up');
  const [promResult, setPromResult] = useState<PromQLQueryResult | null>(null);
  const [promLoading, setPromLoading] = useState<boolean>(false);

  const canTriage = snapshot.sourceMode === 'live' && session.role !== 'viewer';

  const filteredIncidents = snapshot.incidents.filter(
    (inc) => severityFilter === 'ALL' || inc.severity === severityFilter
  );

  const handleRunPromQL = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promQuery.trim()) return;
    setPromLoading(true);
    try {
      const res = await apiClient.queryPrometheus(promQuery.trim());
      setPromResult(res);
    } catch (err) {
      setPromResult({
        status: 'error',
        error: err instanceof Error ? err.message : 'PromQL query failed',
      });
    } finally {
      setPromLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
            Incidents &amp; PromQL Diagnostics
          </h1>
          <p className="font-mono text-xs text-slate-400 mt-0.5">
            Active alerts from Prometheus / Kubernetes Events &amp; live PromQL query explorer
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#0a0e16] border border-slate-800 rounded p-0.5">
          {(
            [
              { id: 'ALL', label: 'All' },
              { id: 'CRITICAL', label: 'Critical' },
              { id: 'WARNING', label: 'Warning' },
              { id: 'RESOLVED', label: 'Resolved' },
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
              No matching incidents in {snapshot.cluster.name}
            </div>
            <p className="font-mono text-xs text-slate-400 mt-1">
              {snapshot.sourceMode === 'disconnected'
                ? 'Connect Kubernetes or Prometheus to ingest real alerts and pod failure conditions.'
                : 'No firing alerts or unhealthy pod/node conditions matched this filter.'}
            </p>
          </div>
        ) : (
          filteredIncidents.map((inc) => {
            const isSelected =
              selectedInspector?.kind === 'incident' && selectedInspector.id === inc.id;
            const isCritical = inc.severity === 'CRITICAL';

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
                      <span className="font-mono text-[10px] text-slate-400 uppercase">
                        {inc.source}
                      </span>
                      {inc.acknowledged && inc.severity !== 'RESOLVED' && (
                        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-amber-300">
                          Acked by {inc.acknowledgedBy || 'operator'}
                        </span>
                      )}
                    </div>
                    <h2 className="font-display text-sm font-semibold text-[#dfe2ee]">
                      {inc.title}
                    </h2>
                    <div className="font-mono text-[11px] text-slate-400">
                      {inc.targetResource} · Opened {inc.openedAt}
                    </div>
                    <p className="text-xs text-slate-300">{inc.summary}</p>
                  </div>

                  {inc.severity !== 'RESOLVED' && (
                    <div
                      className="flex items-center gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onAcknowledgeIncident(inc.id)}
                        disabled={!canTriage || inc.acknowledged}
                        title={
                          !canTriage
                            ? 'Requires live cluster and operator/admin session'
                            : undefined
                        }
                        className="px-3 py-1.5 rounded text-xs font-mono border bg-slate-900/70 border-slate-700 text-slate-200 hover:border-amber-400/50 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        {inc.acknowledged ? 'Acked' : 'Acknowledge'}
                      </button>
                      <button
                        onClick={() => onResolveIncident(inc.id)}
                        disabled={!canTriage}
                        title={
                          !canTriage
                            ? 'Requires live cluster and operator/admin session'
                            : 'Marks triage resolved locally without modifying cluster state'
                        }
                        className="px-3 py-1.5 rounded text-xs font-mono bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        Mark Triaged
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Live PromQL Query Explorer */}
      <section className="glass-panel rounded p-4 space-y-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-[#dfe2ee]">
            PromQL Query Explorer
          </h2>
          <p className="font-mono text-[11px] text-slate-400">
            Executes instant queries directly against configured Prometheus{' '}
            <code>/api/v1/query</code>
          </p>
        </div>

        <form onSubmit={handleRunPromQL} className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={promQuery}
              onChange={(e) => setPromQuery(e.target.value)}
              placeholder="e.g. sum(rate(container_cpu_usage_seconds_total[5m])) by (namespace)"
              className="w-full rounded bg-slate-950/80 border border-slate-800 pl-8 pr-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
            />
          </div>
          <button
            type="submit"
            disabled={promLoading || !promQuery.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#06B6D4] text-[#0B0F17] text-xs font-medium hover:bg-[#22D3EE] disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{promLoading ? 'Querying...' : 'Execute'}</span>
          </button>
        </form>

        {promResult && (
          <div className="rounded border border-slate-800 bg-[#070A0F] p-3 font-mono text-xs">
            {promResult.status === 'error' ? (
              <div className="text-red-300">{promResult.error}</div>
            ) : !promResult.result || promResult.result.length === 0 ? (
              <div className="text-slate-400">Empty result set returned by Prometheus.</div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto micro-scroll">
                {promResult.result.slice(0, 50).map((sample, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-1"
                  >
                    <span className="text-slate-300 break-all">
                      {JSON.stringify(sample.metric)}
                    </span>
                    <span className="text-[#4cd7f6] font-semibold tabular-nums shrink-0">
                      {sample.value?.[1] ?? 'n/a'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Prometheus Alert Rules Table */}
      <section className="glass-panel rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#4cd7f6]" />
          <div>
            <h2 className="font-display text-sm font-semibold text-[#dfe2ee]">
              Prometheus Alerting Rules ({snapshot.alertRules.length})
            </h2>
            <p className="font-mono text-[11px] text-slate-400">
              Evaluated server-side from Prometheus <code>/api/v1/rules</code>
            </p>
          </div>
        </div>

        <div className="overflow-x-auto micro-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#111827]/90 border-b border-slate-800/90 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                <th className="py-2.5 px-4 font-semibold">Rule / Group</th>
                <th className="py-2.5 px-3 font-semibold">PromQL Expression</th>
                <th className="py-2.5 px-3 font-semibold">State</th>
                <th className="py-2.5 px-3 font-semibold">Health</th>
                <th className="py-2.5 px-4 font-semibold text-right">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {snapshot.alertRules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    {snapshot.telemetry.status === 'connected'
                      ? 'No alerting rules returned by Prometheus.'
                      : 'Prometheus is disconnected — alert rules unavailable.'}
                  </td>
                </tr>
              ) : (
                snapshot.alertRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="text-[#dfe2ee] font-medium">{rule.name}</div>
                      <div className="text-[10px] text-slate-500">{rule.group}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 max-w-md truncate">{rule.query}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={
                          rule.state === 'firing'
                            ? 'text-red-400 font-semibold uppercase'
                            : rule.state === 'pending'
                              ? 'text-amber-400 uppercase'
                              : 'text-emerald-400 uppercase'
                        }
                      >
                        {rule.state}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{rule.health}</td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <StatusBadge status={rule.severity} compact />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
