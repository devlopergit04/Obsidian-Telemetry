import React from 'react';
import { Lock, ShieldCheck, ShieldOff } from 'lucide-react';
import {
  ClusterData,
  HealthStatus,
  InspectorSelection,
} from '../types/telemetry';
import { StatusBadge } from './StatusBadge';

interface NetworkScreenProps {
  cluster: ClusterData;
  selectedInspector: InspectorSelection | null;
  onInspect: (selection: InspectorSelection) => void;
  onToggleCircuitBreaker: (routeId: string) => void;
  onUpdateRateLimit: (routeId: string, rateLimitRpm: number) => void;
}

export const NetworkScreen: React.FC<NetworkScreenProps> = ({
  cluster,
  selectedInspector,
  onInspect,
  onToggleCircuitBreaker,
  onUpdateRateLimit,
}) => {
  const statusStroke = (status: HealthStatus) => {
    switch (status) {
      case HealthStatus.CRASHED:
        return '#EF4444';
      case HealthStatus.DEGRADED:
        return '#F59E0B';
      case HealthStatus.CORDONED:
        return '#64748B';
      default:
        return '#06B6D4';
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
          Network &amp; Ingress Topology
        </h1>
        <p className="font-mono text-xs text-slate-400 mt-0.5">
          SPIFFE mTLS service mesh · VPC CIDR {cluster.vpcCidr} · Click any service node to inspect
        </p>
      </div>

      {/* Interactive Service Mesh SVG Graph */}
      <section className="glass-panel rounded p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-slate-300">
            Live Service Mesh Graph
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-[#06B6D4]" />
              <span>Nominal mTLS</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-amber-400" />
              <span>Elevated Latency</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-red-400" />
              <span>Circuit Open</span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto micro-scroll rounded border border-slate-800/80 bg-[#070A0F]/90 p-2">
          <svg viewBox="0 0 880 315" className="w-full min-w-[680px] h-[300px]">
            <defs>
              <marker
                id="arrow-cyan"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#06B6D4" />
              </marker>
              <marker
                id="arrow-amber"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#F59E0B" />
              </marker>
            </defs>

            {/* Tier Column Labels */}
            {[
              { x: 95, label: 'EDGE POP' },
              { x: 295, label: 'INGRESS' },
              { x: 525, label: 'MICROSERVICES' },
              { x: 755, label: 'DATA STORES' },
            ].map((col) => (
              <text
                key={col.label}
                x={col.x}
                y={22}
                textAnchor="middle"
                className="fill-slate-500 font-mono text-[10px] tracking-[0.1em]"
              >
                {col.label}
              </text>
            ))}

            {/* Directed Edges */}
            {cluster.services.map((source) =>
              source.upstreamIds.map((targetId) => {
                const target = cluster.services.find((s) => s.id === targetId);
                if (!target) return null;
                const x1 = source.x + 76;
                const y1 = source.y;
                const x2 = target.x - 78;
                const y2 = target.y;
                const midX = (x1 + x2) / 2;
                const isDegraded =
                  target.status === HealthStatus.DEGRADED ||
                  source.status === HealthStatus.DEGRADED;

                return (
                  <g key={`${source.id}-${target.id}`}>
                    <path
                      d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={isDegraded ? '#F59E0B' : '#06B6D4'}
                      strokeOpacity={isDegraded ? 0.8 : 0.45}
                      strokeWidth={isDegraded ? 2 : 1.5}
                      strokeDasharray={isDegraded ? '4 3' : undefined}
                      markerEnd={isDegraded ? 'url(#arrow-amber)' : 'url(#arrow-cyan)'}
                    />
                  </g>
                );
              })
            )}

            {/* Service Nodes */}
            {cluster.services.map((svc) => {
              const isSelected =
                selectedInspector?.kind === 'service' &&
                selectedInspector.id === svc.id;
              const stroke = statusStroke(svc.status);

              return (
                <g
                  key={svc.id}
                  onClick={() => onInspect({ kind: 'service', id: svc.id })}
                  className="cursor-pointer group"
                >
                  <rect
                    x={svc.x - 76}
                    y={svc.y - 30}
                    width={152}
                    height={60}
                    rx={4}
                    fill={isSelected ? '#1E293B' : '#0F172A'}
                    stroke={isSelected ? '#22D3EE' : stroke}
                    strokeWidth={isSelected ? 2 : 1.2}
                    strokeOpacity={isSelected ? 1 : 0.7}
                  />
                  <text
                    x={svc.x - 66}
                    y={svc.y - 9}
                    className="fill-[#dfe2ee] font-mono text-[11px] font-semibold"
                  >
                    {svc.name.length > 18 ? `${svc.name.slice(0, 17)}…` : svc.name}
                  </text>
                  <text
                    x={svc.x - 66}
                    y={svc.y + 8}
                    className="fill-slate-400 font-mono text-[9.5px] tabular-nums"
                  >
                    {svc.rps.toLocaleString()} rps · {svc.p99Ms}ms
                  </text>
                  <text
                    x={svc.x - 66}
                    y={svc.y + 22}
                    className={`font-mono text-[9px] ${
                      svc.errorRate > 1 ? 'fill-amber-400' : 'fill-emerald-400'
                    }`}
                  >
                    {svc.mtls ? 'mTLS' : 'PLAIN'} · err {svc.errorRate}%
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      {/* Ingress & CIDR Routing Table */}
      <section className="glass-panel rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#dfe2ee]">
              Ingress Routes &amp; Circuit Breakers
            </h2>
            <p className="font-mono text-[11px] text-slate-400">
              Adjust rate-limit quotas or trip edge circuit breakers in real time
            </p>
          </div>
        </div>

        <div className="overflow-x-auto micro-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#111827]/90 border-b border-slate-800/90 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                <th className="py-2.5 px-4 font-semibold">Host / Path</th>
                <th className="py-2.5 px-3 font-semibold">Upstream Service</th>
                <th className="py-2.5 px-3 font-semibold">CIDR Allowlist</th>
                <th className="py-2.5 px-3 font-semibold text-right">RPS / P95</th>
                <th className="py-2.5 px-3 font-semibold text-right">TLS Cert</th>
                <th className="py-2.5 px-3 font-semibold text-right">Rate Limit (RPM)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Status</th>
                <th className="py-2.5 px-4 font-semibold text-right">Breaker</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {cluster.ingressRoutes.map((route) => (
                <tr key={route.id} className="hover:bg-slate-900/50 transition-colors">
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <div className="text-[#dfe2ee] font-medium">{route.host}</div>
                    <div className="text-[10px] text-[#4cd7f6]">{route.path}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                    {route.service}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                    {route.cidrAllowlist}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                    <div className="text-slate-200">{route.rps.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-400">{route.p95Ms} ms</div>
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-emerald-400 tabular-nums">
                      <Lock className="w-3 h-3" />
                      <span>{route.tlsExpiryDays}d</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <input
                      type="number"
                      min={1000}
                      max={100000}
                      step={1000}
                      value={route.rateLimitRpm}
                      onChange={(e) =>
                        onUpdateRateLimit(route.id, Math.max(1000, Number(e.target.value)))
                      }
                      aria-label={`Rate limit for ${route.host}`}
                      className="w-24 text-right rounded bg-slate-950/80 border border-slate-800 px-2 py-1 text-xs text-slate-100 tabular-nums focus:outline-none focus:border-[#06B6D4]"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <StatusBadge status={route.status} compact />
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => onToggleCircuitBreaker(route.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] transition-colors ${
                        route.circuitBreakerOpen
                          ? 'bg-red-500/15 border-red-500/40 text-red-400 hover:bg-red-500/25'
                          : 'bg-slate-900/70 border-slate-800 text-emerald-400 hover:border-[#06B6D4]/50'
                      }`}
                    >
                      {route.circuitBreakerOpen ? (
                        <>
                          <ShieldOff className="w-3 h-3" />
                          <span>OPEN</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3 h-3" />
                          <span>CLOSED</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
