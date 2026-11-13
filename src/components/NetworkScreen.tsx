import React from 'react';
import { Globe, Lock, Network } from 'lucide-react';
import type { ClusterSnapshot, InspectorSelection } from '../shared/types.ts';

interface NetworkScreenProps {
  snapshot: ClusterSnapshot;
  selectedInspector: InspectorSelection | null;
  onInspect: (selection: InspectorSelection) => void;
}

export const NetworkScreen: React.FC<NetworkScreenProps> = ({
  snapshot,
  selectedInspector,
  onInspect,
}) => {
  const { services, ingresses, cluster } = snapshot;

  if (snapshot.sourceMode === 'disconnected' && services.length === 0 && ingresses.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
            Services &amp; Ingress Topology
          </h1>
          <p className="font-mono text-xs text-slate-400 mt-0.5">
            No Kubernetes cluster is connected.
          </p>
        </div>
        <div className="glass-panel rounded p-8 text-center font-mono text-xs text-slate-400">
          Connect a Kubernetes cluster to inspect real Services, ClusterIP bindings, and Ingress
          routing rules.
        </div>
      </div>
    );
  }

  const displayedIngresses = ingresses.slice(0, 6);
  const displayedServices = services.slice(0, 8);
  const svgHeight = Math.max(
    220,
    Math.max(displayedIngresses.length, displayedServices.length, 1) * 62 + 48
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
          Services &amp; Ingress Topology
        </h1>
        <p className="font-mono text-xs text-slate-400 mt-0.5">
          {cluster.name} · {ingresses.length} ingress{ingresses.length === 1 ? '' : 'es'} ·{' '}
          {services.length} service{services.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Live Ingress -> Service Topology Graph */}
      <section className="glass-panel rounded p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-slate-300">
            <Network className="w-3.5 h-3.5 text-[#4cd7f6]" />
            <span>Ingress to Service Routing Map</span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">
            Click any Service node to inspect ports &amp; YAML
          </span>
        </div>

        {services.length === 0 && ingresses.length === 0 ? (
          <div className="rounded border border-slate-800/80 bg-[#070A0F]/80 p-8 text-center font-mono text-xs text-slate-400">
            Zero Services or Ingresses discovered in this Kubernetes cluster.
          </div>
        ) : (
          <div className="overflow-x-auto micro-scroll rounded border border-slate-800/80 bg-[#070A0F]/90 p-2">
            <svg
              viewBox={`0 0 860 ${svgHeight}`}
              className="w-full min-w-[640px]"
              style={{ height: svgHeight }}
            >
              <defs>
                <marker
                  id="route-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#06B6D4" />
                </marker>
              </defs>

              <text
                x={140}
                y={22}
                textAnchor="middle"
                className="fill-slate-500 font-mono text-[10px] tracking-[0.1em]"
              >
                INGRESS RULES
              </text>
              <text
                x={520}
                y={22}
                textAnchor="middle"
                className="fill-slate-500 font-mono text-[10px] tracking-[0.1em]"
              >
                KUBERNETES SERVICES
              </text>

              {/* Edges from Ingress backends to matching Service */}
              {displayedIngresses.map((ing, iIdx) => {
                const y1 = 56 + iIdx * 62;
                return ing.paths.map((p, pIdx) => {
                  const sIdx = displayedServices.findIndex(
                    (s) =>
                      s.name === p.serviceName &&
                      (s.namespace === ing.namespace ||
                        displayedServices.filter((x) => x.name === p.serviceName).length === 1)
                  );
                  if (sIdx < 0) return null;
                  const y2 = 56 + sIdx * 62;
                  const x1 = 260;
                  const x2 = 408;
                  const midX = (x1 + x2) / 2;
                  return (
                    <path
                      key={`${ing.id}-${pIdx}`}
                      d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="#06B6D4"
                      strokeOpacity={0.55}
                      strokeWidth={1.6}
                      markerEnd="url(#route-arrow)"
                    />
                  );
                });
              })}

              {/* Ingress Boxes */}
              {displayedIngresses.map((ing, idx) => {
                const y = 34 + idx * 62;
                return (
                  <g key={ing.id}>
                    <rect
                      x={24}
                      y={y}
                      width={236}
                      height={44}
                      rx={4}
                      fill="#0F172A"
                      stroke={ing.tlsEnabled ? '#10B981' : '#06B6D4'}
                      strokeOpacity={0.65}
                    />
                    <text
                      x={34}
                      y={y + 18}
                      className="fill-[#dfe2ee] font-mono text-[11px] font-semibold"
                    >
                      {ing.name}
                    </text>
                    <text x={34} y={y + 33} className="fill-slate-400 font-mono text-[9.5px]">
                      {(ing.hosts[0] || '*').slice(0, 28)} · {ing.tlsEnabled ? 'TLS' : 'HTTP'}
                    </text>
                  </g>
                );
              })}

              {/* Service Boxes */}
              {displayedServices.map((svc, idx) => {
                const y = 34 + idx * 62;
                const isSelected =
                  selectedInspector?.kind === 'service' && selectedInspector.id === svc.id;
                return (
                  <g
                    key={svc.id}
                    onClick={() => onInspect({ kind: 'service', id: svc.id })}
                    className="cursor-pointer"
                  >
                    <rect
                      x={412}
                      y={y}
                      width={260}
                      height={44}
                      rx={4}
                      fill={isSelected ? '#1E293B' : '#0F172A'}
                      stroke={isSelected ? '#22D3EE' : '#06B6D4'}
                      strokeWidth={isSelected ? 2 : 1.2}
                    />
                    <text
                      x={424}
                      y={y + 18}
                      className="fill-[#dfe2ee] font-mono text-[11px] font-semibold"
                    >
                      {svc.namespace}/{svc.name}
                    </text>
                    <text x={424} y={y + 33} className="fill-slate-400 font-mono text-[9.5px]">
                      {svc.type} · {svc.clusterIp} · {svc.ports[0] || 'headless'}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </section>

      {/* Services Table */}
      <section className="glass-panel rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/80">
          <h2 className="font-display text-sm font-semibold text-[#dfe2ee]">
            Kubernetes Services ({services.length})
          </h2>
        </div>
        <div className="overflow-x-auto micro-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#111827]/90 border-b border-slate-800/90 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                <th className="py-2.5 px-4 font-semibold">Service</th>
                <th className="py-2.5 px-3 font-semibold">Namespace</th>
                <th className="py-2.5 px-3 font-semibold">Type</th>
                <th className="py-2.5 px-3 font-semibold">ClusterIP</th>
                <th className="py-2.5 px-3 font-semibold">Ports</th>
                <th className="py-2.5 px-4 font-semibold">Selectors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {services.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No Services found.
                  </td>
                </tr>
              ) : (
                services.map((svc) => (
                  <tr
                    key={svc.id}
                    onClick={() => onInspect({ kind: 'service', id: svc.id })}
                    className="cursor-pointer hover:bg-slate-900/50 transition-colors"
                  >
                    <td className="py-2.5 px-4 text-[#dfe2ee] font-medium whitespace-nowrap">
                      {svc.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {svc.namespace}
                    </td>
                    <td className="py-2.5 px-3 text-[#4cd7f6] whitespace-nowrap">{svc.type}</td>
                    <td className="py-2.5 px-3 text-slate-300 tabular-nums whitespace-nowrap">
                      {svc.clusterIp}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                      {svc.ports.join(', ') || 'none'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 truncate max-w-[260px]">
                      {Object.entries(svc.selectorLabels)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(', ') || 'none'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ingress Rules Table */}
      <section className="glass-panel rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center gap-2">
          <Globe className="w-4 h-4 text-[#4cd7f6]" />
          <h2 className="font-display text-sm font-semibold text-[#dfe2ee]">
            Ingress Definitions ({ingresses.length})
          </h2>
        </div>
        <div className="overflow-x-auto micro-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#111827]/90 border-b border-slate-800/90 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                <th className="py-2.5 px-4 font-semibold">Ingress</th>
                <th className="py-2.5 px-3 font-semibold">Class</th>
                <th className="py-2.5 px-3 font-semibold">Hosts</th>
                <th className="py-2.5 px-3 font-semibold">Routes</th>
                <th className="py-2.5 px-4 font-semibold text-right">TLS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {ingresses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No Ingress objects found.
                  </td>
                </tr>
              ) : (
                ingresses.map((ing) => (
                  <tr key={ing.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="text-[#dfe2ee] font-medium">{ing.name}</div>
                      <div className="text-[10px] text-slate-500">ns/{ing.namespace}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                      {ing.ingressClassName}
                    </td>
                    <td className="py-2.5 px-3 text-[#4cd7f6] whitespace-nowrap">
                      {ing.hosts.join(', ') || '*'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {ing.paths
                        .map((p) => `${p.path} -> ${p.serviceName}:${p.servicePort}`)
                        .join(' | ')}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      {ing.tlsEnabled ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Lock className="w-3 h-3" />
                          <span>TLS</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">HTTP</span>
                      )}
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
