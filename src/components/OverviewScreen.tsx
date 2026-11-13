import React, { useState } from 'react';
import { AlertTriangle, ArrowUpRight, ServerCrash } from 'lucide-react';
import type { ClusterSnapshot, InspectorSelection, ScreenId, TimeWindow } from '../shared/types.ts';
import { MicroSparkline, TelemetryAreaChart, type TelemetryMetricKey } from './Sparkline.tsx';
import { StatusBadge } from './StatusBadge.tsx';

interface OverviewScreenProps {
  snapshot: ClusterSnapshot;
  timeWindow: TimeWindow;
  onChangeTimeWindow: (tw: TimeWindow) => void;
  selectedInspector: InspectorSelection | null;
  onInspect: (selection: InspectorSelection) => void;
  onNavigateScreen: (screen: ScreenId) => void;
  onEnableDemoMode: () => void;
  demoModeEnabled: boolean;
}

export const OverviewScreen: React.FC<OverviewScreenProps> = ({
  snapshot,
  timeWindow,
  onChangeTimeWindow,
  selectedInspector,
  onInspect,
  onNavigateScreen,
  onEnableDemoMode,
  demoModeEnabled,
}) => {
  const [activeMetrics, setActiveMetrics] = useState<TelemetryMetricKey[]>(['cpu', 'memory']);

  const { cluster, nodes, pods, telemetry } = snapshot;
  const series = telemetry.series;
  const timestamps = series.map((s) => s.timestamp);
  const healthyNodesCount = nodes.filter((n) => n.status === 'HEALTHY').length;
  const crashedPodsCount = pods.filter((p) => p.status === 'CRASHED').length;

  const toggleMetric = (metric: TelemetryMetricKey) => {
    setActiveMetrics((prev) => {
      if (prev.includes(metric)) {
        return prev.length > 1 ? prev.filter((m) => m !== metric) : prev;
      }
      return [...prev, metric];
    });
  };

  if (snapshot.sourceMode === 'disconnected' && nodes.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
            Cluster Infrastructure Disconnected
          </h1>
          <p className="font-mono text-xs text-slate-400 mt-1">
            No active Kubernetes API or Prometheus data source is connected.
          </p>
        </div>

        <div className="glass-panel rounded p-6 space-y-4">
          <div className="flex items-start gap-3">
            <ServerCrash className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-2 text-xs font-mono">
              <div className="text-[#dfe2ee] font-semibold">
                {cluster.kubernetesError || 'Kubernetes connection not configured.'}
              </div>
              {cluster.prometheusError && (
                <div className="text-slate-400">Prometheus: {cluster.prometheusError}</div>
              )}
              <div className="text-slate-400 leading-relaxed pt-1">
                Configure <code className="text-[#4cd7f6]">KUBECONFIG_PATH</code> or{' '}
                <code className="text-[#4cd7f6]">K8S_API_SERVER</code> +{' '}
                <code className="text-[#4cd7f6]">K8S_BEARER_TOKEN</code> and{' '}
                <code className="text-[#4cd7f6]">PROMETHEUS_URL</code> in your environment to view
                real infrastructure telemetry.
              </div>
            </div>
          </div>

          {demoModeEnabled && (
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-4">
              <span className="font-mono text-[11px] text-slate-400">
                Want to explore the interface with clearly labeled synthetic data?
              </span>
              <button
                onClick={onEnableDemoMode}
                className="px-3.5 py-2 rounded bg-[#06B6D4] text-[#0B0F17] text-xs font-medium hover:bg-[#22D3EE] whitespace-nowrap"
              >
                Load Demo Sandbox
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const fmt = (val: number | null, suffix: string) =>
    val !== null ? `${val}${suffix}` : 'Unavailable';

  const kpiCards = [
    {
      label: 'Cluster CPU Load',
      value: fmt(telemetry.current.cpuPercent, '%'),
      meta: `${nodes.length} nodes · ${healthyNodesCount} healthy`,
      data: series.map((s) => s.cpu),
      color:
        telemetry.current.cpuPercent !== null && telemetry.current.cpuPercent > 80
          ? '#F59E0B'
          : '#06B6D4',
      unit: '%',
    },
    {
      label: 'Memory Allocation',
      value: fmt(telemetry.current.memoryPercent, '%'),
      meta: `${pods.length} pods · ${crashedPodsCount} crashed`,
      data: series.map((s) => s.memory),
      color: '#10B981',
      unit: '%',
    },
    {
      label: 'Network Throughput',
      value:
        telemetry.current.networkMbps !== null
          ? `${telemetry.current.networkMbps.toLocaleString()} Mbps`
          : 'Unavailable',
      meta: `${snapshot.services.length} services · ${snapshot.ingresses.length} ingresses`,
      data: series.map((s) => s.networkMbps),
      color: '#4cd7f6',
      unit: ' Mbps',
    },
    {
      label: 'P99 HTTP Latency',
      value: fmt(telemetry.current.p99LatencyMs, ' ms'),
      meta:
        telemetry.status === 'connected'
          ? 'Source: Prometheus'
          : telemetry.status === 'demo'
            ? 'Source: Demo Sandbox'
            : 'Prometheus disconnected',
      data: series.map((s) => s.p99LatencyMs),
      color:
        telemetry.current.p99LatencyMs !== null && telemetry.current.p99LatencyMs > 50
          ? '#F59E0B'
          : '#10B981',
      unit: ' ms',
    },
  ];

  const clusterOverallStatus = nodes.some((n) => n.status === 'CRASHED')
    ? 'CRASHED'
    : nodes.some((n) => n.status === 'DEGRADED')
      ? 'DEGRADED'
      : nodes.length > 0
        ? 'HEALTHY'
        : 'UNKNOWN';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
              {cluster.name}
            </h1>
            <StatusBadge status={clusterOverallStatus} />
          </div>
          <p className="font-mono text-xs text-slate-400 mt-1">
            {cluster.serverDisplay} · {cluster.k8sVersion} · {snapshot.deployments.length}{' '}
            deployments · {snapshot.statefulSets.length} statefulsets · {snapshot.daemonSets.length}{' '}
            daemonsets
          </p>
        </div>

        <div className="inline-flex items-center rounded bg-[#0a0e16] border border-slate-800/90 p-0.5">
          {(['15m', '1h', '6h', '24h'] as TimeWindow[]).map((tw) => (
            <button
              key={tw}
              onClick={() => onChangeTimeWindow(tw)}
              className={`px-2.5 py-1 rounded-xs font-mono text-[11px] transition-colors ${
                timeWindow === tw
                  ? 'bg-[#1E293B] text-[#4cd7f6] font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tw}
            </button>
          ))}
        </div>
      </div>

      {/* 4-Column Telemetry KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="glass-panel rounded p-4 flex flex-col justify-between gap-3"
          >
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                {card.label}
              </span>
              <div className="font-mono text-2xl font-bold text-[#dfe2ee] tabular-nums mt-1.5">
                {card.value}
              </div>
              <div className="font-mono text-[11px] text-slate-400 mt-0.5 truncate">
                {card.meta}
              </div>
            </div>
            <MicroSparkline
              data={card.data}
              timestamps={timestamps}
              color={card.color}
              unit={card.unit}
              height={40}
            />
          </div>
        ))}
      </div>

      {/* Prometheus Telemetry Area Chart */}
      <section className="glass-panel rounded p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#dfe2ee]">
              Prometheus Time-Series Telemetry
            </h2>
            <p className="font-mono text-[11px] text-slate-400">
              Window: {timeWindow} · Status: {telemetry.status.toUpperCase()}
              {telemetry.error ? ` — ${telemetry.error}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: 'cpu', label: 'CPU %', dot: '#06B6D4' },
                { key: 'memory', label: 'Memory %', dot: '#10B981' },
                { key: 'networkMbps', label: 'Network Mbps', dot: '#4cd7f6' },
                { key: 'p99LatencyMs', label: 'P99 Latency', dot: '#F59E0B' },
              ] as { key: TelemetryMetricKey; label: string; dot: string }[]
            ).map((m) => {
              const active = activeMetrics.includes(m.key);
              return (
                <button
                  key={m.key}
                  onClick={() => toggleMetric(m.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[11px] border transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#1E293B] border-[#06B6D4]/50 text-[#dfe2ee]'
                      : 'bg-[#0a0e16]/70 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: m.dot, opacity: active ? 1 : 0.35 }}
                  />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {telemetry.status === 'disconnected' || telemetry.status === 'error' ? (
          <div className="h-[200px] rounded border border-slate-800/80 bg-[#0a0e16]/70 flex flex-col items-center justify-center p-6 text-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <div className="font-mono text-xs text-[#dfe2ee]">Prometheus Telemetry Unavailable</div>
            <p className="font-mono text-[11px] text-slate-400 max-w-lg">
              {telemetry.error ||
                'Configure PROMETHEUS_URL in your server environment to query historical and live PromQL metrics.'}
            </p>
          </div>
        ) : (
          <TelemetryAreaChart series={series} activeMetrics={activeMetrics} />
        )}
      </section>

      {/* Active Node Matrix */}
      <section className="glass-panel rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#dfe2ee]">
              Cluster Node Inventory ({nodes.length})
            </h2>
            <p className="font-mono text-[11px] text-slate-400">
              Select any node to inspect conditions, pods, and Kubernetes YAML
            </p>
          </div>
          <button
            onClick={() => onNavigateScreen('nodes')}
            className="flex items-center gap-1 font-mono text-xs text-[#4cd7f6] hover:underline whitespace-nowrap shrink-0"
          >
            <span>Manage Workloads</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto micro-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#111827]/90 border-b border-slate-800/90 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                <th className="py-2.5 px-4 font-semibold">Hostname</th>
                <th className="py-2.5 px-3 font-semibold">IP / Pod CIDR</th>
                <th className="py-2.5 px-3 font-semibold">Zone</th>
                <th className="py-2.5 px-3 font-semibold text-right">CPU</th>
                <th className="py-2.5 px-3 font-semibold text-right">Memory</th>
                <th className="py-2.5 px-3 font-semibold text-right">Pods</th>
                <th className="py-2.5 px-4 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {nodes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No Kubernetes nodes discovered in this context.
                  </td>
                </tr>
              ) : (
                nodes.map((node) => {
                  const isSelected =
                    selectedInspector?.kind === 'node' && selectedInspector.id === node.id;

                  return (
                    <tr
                      key={node.id}
                      onClick={() => onInspect({ kind: 'node', id: node.id })}
                      className={`cursor-pointer transition-colors h-11 ${
                        isSelected ? 'bg-[#1E293B]/90' : 'hover:bg-slate-900/60'
                      }`}
                    >
                      <td className="py-2 px-4 text-[#dfe2ee] font-medium whitespace-nowrap">
                        {node.hostname}
                      </td>
                      <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                        <div>{node.ip}</div>
                        <div className="text-[10px] text-slate-500">{node.podCidr}</div>
                      </td>
                      <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{node.zone}</td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap text-slate-200">
                        {node.cpuPercent !== null ? `${node.cpuPercent.toFixed(1)}%` : 'n/a'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap text-slate-200">
                        {node.memoryPercent !== null ? `${node.memoryPercent.toFixed(1)}%` : 'n/a'}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300 tabular-nums whitespace-nowrap">
                        {node.podCount}/{node.podCapacity}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <StatusBadge status={node.status} compact />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
