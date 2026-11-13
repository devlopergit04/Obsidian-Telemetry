import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  PauseCircle,
  PlayCircle,
  RotateCw,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type {
  AuthSession,
  ClusterSnapshot,
  HealthStatus,
  InspectorSelection,
} from '../shared/types.ts';
import { StatusBadge } from './StatusBadge.tsx';

interface NodesScreenProps {
  snapshot: ClusterSnapshot;
  session: AuthSession;
  selectedInspector: InspectorSelection | null;
  onInspect: (selection: InspectorSelection) => void;
  onCordonNode: (nodeName: string, unschedulable: boolean) => void;
  onDrainNode: (nodeName: string) => void;
  onDeletePod: (namespace: string, podName: string) => void;
  onRestartDeployment: (namespace: string, name: string) => void;
  onScaleDeployment: (namespace: string, name: string, replicas: number) => void;
}

export const NodesScreen: React.FC<NodesScreenProps> = ({
  snapshot,
  session,
  selectedInspector,
  onInspect,
  onCordonNode,
  onDrainNode,
  onDeletePod,
  onRestartDeployment,
  onScaleDeployment,
}) => {
  const [search, setSearch] = useState('');
  const [namespaceFilter, setNamespaceFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | HealthStatus>('ALL');
  const [activeTab, setActiveTab] = useState<'nodes' | 'deployments' | 'controllers'>('nodes');
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>([]);
  const [scaleDrafts, setScaleDrafts] = useState<Record<string, number>>({});

  const canMutate = snapshot.sourceMode === 'live' && session.role !== 'viewer';

  const toggleExpand = (id: string) => {
    setExpandedNodeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const q = search.toLowerCase().trim();

  const filteredNodes = snapshot.nodes.filter((n) => {
    const matchesStatus = statusFilter === 'ALL' || n.status === statusFilter;
    const matchesSearch =
      !q ||
      n.hostname.toLowerCase().includes(q) ||
      n.ip.includes(q) ||
      n.zone.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const filteredDeployments = snapshot.deployments.filter((d) => {
    const matchesNs = namespaceFilter === 'ALL' || d.namespace === namespaceFilter;
    const matchesSearch =
      !q || d.name.toLowerCase().includes(q) || d.namespace.toLowerCase().includes(q);
    return matchesNs && matchesSearch;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
            Nodes &amp; Workloads
          </h1>
          <p className="font-mono text-xs text-slate-400 mt-0.5">
            {snapshot.nodes.length} nodes · {snapshot.pods.length} pods ·{' '}
            {snapshot.deployments.length} deployments · {snapshot.statefulSets.length} statefulsets
            · {snapshot.daemonSets.length} daemonsets
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#0a0e16] border border-slate-800 rounded p-0.5">
          {[
            { id: 'nodes' as const, label: 'Nodes & Pods' },
            { id: 'deployments' as const, label: 'Deployments' },
            { id: 'controllers' as const, label: 'StatefulSets / DaemonSets' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 rounded-xs font-mono text-[11px] transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#1E293B] text-[#4cd7f6] font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-panel rounded p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter nodes, pods, deployments, or namespaces..."
            className="w-full rounded bg-slate-950/80 border border-slate-800 pl-8 pr-3 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#06B6D4]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={namespaceFilter}
            onChange={(e) => setNamespaceFilter(e.target.value)}
            aria-label="Filter by namespace"
            className="rounded bg-slate-950/80 border border-slate-800 px-3 py-1.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-[#06B6D4]"
          >
            <option value="ALL">All Namespaces</option>
            {snapshot.namespaces.map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>

          {activeTab === 'nodes' && (
            <div className="flex flex-wrap items-center gap-1 bg-[#0a0e16] border border-slate-800 rounded p-0.5">
              {(
                [
                  { id: 'ALL', label: 'All' },
                  { id: 'HEALTHY', label: 'Healthy' },
                  { id: 'DEGRADED', label: 'Degraded' },
                  { id: 'CRASHED', label: 'Crashed' },
                  { id: 'CORDONED', label: 'Cordoned' },
                ] as { id: 'ALL' | HealthStatus; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-xs font-mono text-[11px] transition-colors ${
                    statusFilter === tab.id
                      ? 'bg-[#1E293B] text-[#4cd7f6] font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeTab === 'nodes' && (
        <div className="glass-panel rounded overflow-hidden">
          <div className="overflow-x-auto micro-scroll">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#111827]/90 border-b border-slate-800/90 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                  <th className="py-2.5 px-2 w-8" />
                  <th className="py-2.5 px-3 font-semibold">Node / Instance</th>
                  <th className="py-2.5 px-3 font-semibold">IP / CIDR</th>
                  <th className="py-2.5 px-3 font-semibold">Kubelet / OS</th>
                  <th className="py-2.5 px-3 font-semibold text-right">CPU</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Mem</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Operations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {filteredNodes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      No nodes available for the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredNodes.map((node) => {
                    const isExpanded = expandedNodeIds.includes(node.id);
                    const nodePods = snapshot.pods.filter(
                      (p) =>
                        p.nodeName === node.hostname &&
                        (namespaceFilter === 'ALL' || p.namespace === namespaceFilter)
                    );
                    const isSelected =
                      selectedInspector?.kind === 'node' && selectedInspector.id === node.id;

                    return (
                      <React.Fragment key={node.id}>
                        <tr className={isSelected ? 'bg-[#1E293B]/80' : 'hover:bg-slate-900/50'}>
                          <td className="py-2.5 px-2">
                            <button
                              onClick={() => toggleExpand(node.id)}
                              aria-label={isExpanded ? 'Collapse pods' : 'Expand pods'}
                              className="p-1 rounded text-slate-400 hover:text-[#4cd7f6]"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                          <td
                            onClick={() => onInspect({ kind: 'node', id: node.id })}
                            className="py-2.5 px-3 cursor-pointer"
                          >
                            <div className="text-[#dfe2ee] font-medium">{node.hostname}</div>
                            <div className="text-[10px] text-slate-400">
                              {node.zone} · {node.instanceType} · {node.role}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="text-slate-200">{node.ip}</div>
                            <div className="text-[10px] text-slate-500">{node.podCidr}</div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="text-slate-200">{node.kubeletVersion}</div>
                            <div className="text-[10px] text-slate-500">{node.osImage}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {node.cpuPercent !== null ? `${node.cpuPercent.toFixed(1)}%` : 'n/a'}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {node.memoryPercent !== null
                              ? `${node.memoryPercent.toFixed(1)}%`
                              : 'n/a'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <StatusBadge status={node.status} compact />
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => onCordonNode(node.hostname, !node.unschedulable)}
                                disabled={!canMutate || !snapshot.rbac.canPatchNodes}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300 hover:border-[#06B6D4]/50 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {node.unschedulable ? (
                                  <PlayCircle className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <PauseCircle className="w-3 h-3 text-amber-400" />
                                )}
                                <span>{node.unschedulable ? 'Uncordon' : 'Cordon'}</span>
                              </button>
                              <button
                                onClick={() => onDrainNode(node.hostname)}
                                disabled={!canMutate || !snapshot.rbac.canEvictPods}
                                title="Drain node (PDB & capacity checked)"
                                className="p-1.5 rounded border border-red-500/40 text-red-400 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <ShieldAlert className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-[#0a0e16]/90">
                            <td colSpan={8} className="px-8 py-3 border-b border-slate-800/80">
                              <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400 mb-2">
                                Scheduled Pods ({nodePods.length})
                              </div>
                              {nodePods.length === 0 ? (
                                <div className="text-xs text-slate-500 py-1">
                                  Zero pods matching namespace filter on this node.
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {nodePods.map((pod) => (
                                    <div
                                      key={pod.id}
                                      onClick={() => onInspect({ kind: 'pod', id: pod.id })}
                                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800/80 bg-[#0F172A]/60 px-3 py-2 cursor-pointer hover:border-[#06B6D4]/40"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-[#dfe2ee] font-medium truncate">
                                            {pod.name}
                                          </span>
                                          <span className="text-[10px] text-slate-400">
                                            ns/{pod.namespace}
                                          </span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 mt-0.5">
                                          {pod.ip} · {pod.containers.map((c) => c.image).join(', ')}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-4 text-[11px] tabular-nums shrink-0">
                                        <span className="text-slate-300">
                                          CPU:{' '}
                                          {pod.cpuMillicores !== null
                                            ? `${pod.cpuMillicores}m`
                                            : 'n/a'}
                                        </span>
                                        <span className="text-slate-300">
                                          Mem:{' '}
                                          {pod.memoryMiB !== null ? `${pod.memoryMiB}Mi` : 'n/a'}
                                        </span>
                                        <span
                                          className={
                                            pod.restarts > 2 ? 'text-red-400' : 'text-slate-400'
                                          }
                                        >
                                          {pod.restarts} restarts
                                        </span>
                                        <StatusBadge status={pod.status} compact />
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onDeletePod(pod.namespace, pod.name);
                                          }}
                                          disabled={!canMutate || !snapshot.rbac.canDeletePods}
                                          title="Delete Pod"
                                          className="p-1 rounded bg-slate-900 border border-slate-700 text-red-400 hover:border-red-400/50 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'deployments' && (
        <div className="glass-panel rounded overflow-hidden">
          <div className="overflow-x-auto micro-scroll">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#111827]/90 border-b border-slate-800/90 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                  <th className="py-2.5 px-4 font-semibold">Deployment</th>
                  <th className="py-2.5 px-3 font-semibold">Namespace</th>
                  <th className="py-2.5 px-3 font-semibold">Image</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Ready</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Scale</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Restart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {filteredDeployments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No deployments found.
                    </td>
                  </tr>
                ) : (
                  filteredDeployments.map((dep) => {
                    const draft = scaleDrafts[dep.id] ?? dep.replicas;
                    return (
                      <tr
                        key={dep.id}
                        onClick={() => onInspect({ kind: 'deployment', id: dep.id })}
                        className="cursor-pointer hover:bg-slate-900/50"
                      >
                        <td className="py-2.5 px-4 text-[#dfe2ee] font-medium">{dep.name}</td>
                        <td className="py-2.5 px-3 text-slate-400">{dep.namespace}</td>
                        <td className="py-2.5 px-3 text-slate-300 truncate max-w-[260px]">
                          {dep.image}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span
                            className={
                              dep.readyReplicas === dep.replicas
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                            }
                          >
                            {dep.readyReplicas}/{dep.replicas}
                          </span>
                        </td>
                        <td
                          className="py-2.5 px-3 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={200}
                              value={draft}
                              onChange={(e) =>
                                setScaleDrafts((prev) => ({
                                  ...prev,
                                  [dep.id]: Math.max(0, Number(e.target.value)),
                                }))
                              }
                              aria-label={`Replicas for ${dep.name}`}
                              className="w-14 text-right rounded bg-slate-950/80 border border-slate-800 px-2 py-1 text-xs text-slate-100 tabular-nums"
                            />
                            <button
                              onClick={() => onScaleDeployment(dep.namespace, dep.name, draft)}
                              disabled={!canMutate || !snapshot.rbac.canScaleDeployments}
                              className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-[#4cd7f6] disabled:opacity-40"
                            >
                              Apply
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onRestartDeployment(dep.namespace, dep.name)}
                            disabled={!canMutate || !snapshot.rbac.canRestartDeployments}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-200 hover:border-[#06B6D4]/50 disabled:opacity-40"
                          >
                            <RotateCw className="w-3 h-3 text-[#4cd7f6]" />
                            <span>Restart</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'controllers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-panel rounded overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/80 font-display text-sm font-semibold text-[#dfe2ee]">
              StatefulSets ({snapshot.statefulSets.length})
            </div>
            <div className="divide-y divide-slate-800/60 font-mono text-xs">
              {snapshot.statefulSets.length === 0 ? (
                <div className="p-6 text-center text-slate-400">No StatefulSets found.</div>
              ) : (
                snapshot.statefulSets.map((s) => (
                  <div key={s.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-[#dfe2ee]">{s.name}</div>
                      <div className="text-[10px] text-slate-400">
                        ns/{s.namespace} · svc/{s.serviceName}
                      </div>
                    </div>
                    <span className="tabular-nums text-emerald-400">
                      {s.readyReplicas}/{s.replicas}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-panel rounded overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/80 font-display text-sm font-semibold text-[#dfe2ee]">
              DaemonSets ({snapshot.daemonSets.length})
            </div>
            <div className="divide-y divide-slate-800/60 font-mono text-xs">
              {snapshot.daemonSets.length === 0 ? (
                <div className="p-6 text-center text-slate-400">No DaemonSets found.</div>
              ) : (
                snapshot.daemonSets.map((ds) => (
                  <div key={ds.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-[#dfe2ee]">{ds.name}</div>
                      <div className="text-[10px] text-slate-400">ns/{ds.namespace}</div>
                    </div>
                    <span className="tabular-nums text-emerald-400">
                      {ds.numberReady}/{ds.desiredNumberScheduled}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
