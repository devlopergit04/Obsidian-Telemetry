import React, { useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import {
  ClusterData,
  HealthStatus,
  InspectorSelection,
  ScreenId,
  TimeWindow,
} from '../types/telemetry';
import {
  MicroSparkline,
  TelemetryAreaChart,
  TelemetryMetricKey,
} from './Sparkline';
import { StatusBadge } from './StatusBadge';

interface OverviewScreenProps {
  cluster: ClusterData;
  timeWindow: TimeWindow;
  onChangeTimeWindow: (tw: TimeWindow) => void;
  selectedInspector: InspectorSelection | null;
  onInspect: (selection: InspectorSelection) => void;
  onNavigateScreen: (screen: ScreenId) => void;
  onRefreshMetrics: () => void;
}

export const OverviewScreen: React.FC<OverviewScreenProps> = ({
  cluster,
  timeWindow,
  onChangeTimeWindow,
  selectedInspector,
  onInspect,
  onNavigateScreen,
  onRefreshMetrics,
}) => {
  const [activeMetrics, setActiveMetrics] = useState<TelemetryMetricKey[]>([
    'cpu',
    'memory',
  ]);

  const series = cluster.telemetrySeries;
  const latest = series[series.length - 1] || {
    timestamp: '04:28:00',
    cpu: 0,
    memory: 0,
    networkMbps: 0,
    p99LatencyMs: 0,
  };
  const timestamps = series.map((s) => s.timestamp);

  const healthyNodesCount = cluster.nodes.filter(
    (n) => n.status === HealthStatus.HEALTHY
  ).length;
  const totalPods = cluster.pods.length;
  const crashedPods = cluster.pods.filter(
    (p) => p.status === HealthStatus.CRASHED
  ).length;

  const toggleMetric = (metric: TelemetryMetricKey) => {
    setActiveMetrics((prev) => {
      if (prev.includes(metric)) {
        return prev.length > 1 ? prev.filter((m) => m !== metric) : prev;
      }
      return [...prev, metric];
    });
  };

  const kpiCards = [
    {
      label: 'Cluster CPU Load',
      value: `${latest.cpu.toFixed(1)}%`,
      meta: `${cluster.nodes.length} nodes · ${healthyNodesCount} healthy`,
      data: series.map((s) => s.cpu),
      color: latest.cpu > 80 ? '#F59E0B' : '#06B6D4',
      unit: '%',
    },
    {
      label: 'Memory Allocation',
      value: `${latest.memory.toFixed(1)}%`,
      meta: `${totalPods} active pods · ${crashedPods} crashed`,
      data: series.map((s) => s.memory),
      color: '#10B981',
      unit: '%',
    },
    {
      label: 'Ingress Throughput',
      value: `${latest.networkMbps.toLocaleString()} Mbps`,
      meta: `${cluster.ingressRoutes.length} active routes`,
      data: series.map((s) => s.networkMbps),
      color: '#4cd7f6',
      unit: ' Mbps',
    },
    {
      label: 'P99 Gateway Latency',
      value: `${latest.p99LatencyMs.toFixed(1)} ms`,
      meta: `${cluster.region}`,
      data: series.map((s) => s.p99LatencyMs),
      color: latest.p99LatencyMs > 25 ? '#F59E0B' : '#10B981',
      unit: ' ms',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Cluster Identity Summary Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
              {cluster.name}
            </h1>
            <StatusBadge status={cluster.status} />
          </div>
          <p className="font-mono text-xs text-slate-400 mt-1">
            {cluster.provider} · {cluster.region} · VPC {cluster.vpcCidr}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Time Window Segmented Switch */}
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

          <button
            onClick={onRefreshMetrics}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900/70 border border-slate-800 text-xs font-mono text-slate-200 hover:border-[#06B6D4]/50 hover:bg-slate-800/80 transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#4cd7f6]" />
            <span>Sample</span>
          </button>
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
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                  {card.label}
                </span>
              </div>
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

      {/* Main Multi-Metric Telemetry Chart */}
      <section className="glass-panel rounded p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#dfe2ee]">
              Cluster Telemetry Stream
            </h2>
            <p className="font-mono text-[11px] text-slate-400">
              Window: {timeWindow} · Hover chart to snap coordinates across UTC grid
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

        <TelemetryAreaChart series={series} activeMetrics={activeMetrics} />
      </section>

      {/* Active Node Matrix Table */}
      <section className="glass-panel rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#dfe2ee]">
              Active Node Matrix
            </h2>
            <p className="font-mono text-[11px] text-slate-400">
              Select any node row to inspect kernel metrics, pods, and exec console
            </p>
          </div>
          <button
            onClick={() => onNavigateScreen(ScreenId.NODES)}
            className="flex items-center gap-1 font-mono text-xs text-[#4cd7f6] hover:underline whitespace-nowrap shrink-0"
          >
            <span>Manage Fleet</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto micro-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#111827]/90 border-b border-slate-800/90 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                <th className="py-2.5 px-4 font-semibold">Hostname</th>
                <th className="py-2.5 px-3 font-semibold">IP / CIDR</th>
                <th className="py-2.5 px-3 font-semibold">Zone</th>
                <th className="py-2.5 px-3 font-semibold text-right">CPU</th>
                <th className="py-2.5 px-3 font-semibold text-right">Memory</th>
                <th className="py-2.5 px-3 font-semibold text-right">Pods</th>
                <th className="py-2.5 px-4 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {cluster.nodes.map((node) => {
                const isSelected =
                  selectedInspector?.kind === 'node' &&
                  selectedInspector.id === node.id;

                return (
                  <tr
                    key={node.id}
                    onClick={() => onInspect({ kind: 'node', id: node.id })}
                    className={`cursor-pointer transition-colors h-11 ${
                      isSelected
                        ? 'bg-[#1E293B]/90'
                        : 'hover:bg-slate-900/60'
                    }`}
                  >
                    <td className="py-2 px-4 text-[#dfe2ee] font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE]" />
                        )}
                        <span>{node.hostname}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                      <div>{node.ip}</div>
                      <div className="text-[10px] text-slate-500">{node.podCidr}</div>
                    </td>
                    <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{node.zone}</td>
                    <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-14 h-1.5 rounded-xs bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full ${
                              node.cpuPercent > 85
                                ? 'bg-red-400'
                                : node.cpuPercent > 70
                                ? 'bg-amber-400'
                                : 'bg-[#06B6D4]'
                            }`}
                            style={{ width: `${node.cpuPercent}%` }}
                          />
                        </div>
                        <span className="w-11 text-right text-slate-200">
                          {node.cpuPercent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-14 h-1.5 rounded-xs bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full ${
                              node.memoryPercent > 88
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                            }`}
                            style={{ width: `${node.memoryPercent}%` }}
                          />
                        </div>
                        <span className="w-11 text-right text-slate-200">
                          {node.memoryPercent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300 tabular-nums whitespace-nowrap">
                      {node.podCount}/{node.podCapacity}
                    </td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">
                      <StatusBadge status={node.status} compact />
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
