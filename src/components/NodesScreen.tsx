import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  PauseCircle,
  PlayCircle,
  RotateCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import {
  ClusterData,
  HealthStatus,
  InspectorSelection,
} from '../types/telemetry';
import { StatusBadge } from './StatusBadge';

interface NodesScreenProps {
  cluster: ClusterData;
  selectedInspector: InspectorSelection | null;
  onInspect: (selection: InspectorSelection) => void;
  onBatchCordon: (nodeIds: string[], cordon: boolean) => void;
  onDrainNode: (nodeId: string) => void;
  onRestartPod: (podId: string) => void;
}

export const NodesScreen: React.FC<NodesScreenProps> = ({
  cluster,
  selectedInspector,
  onInspect,
  onBatchCordon,
  onDrainNode,
  onRestartPod,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | HealthStatus>('ALL');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>(
    cluster.nodes.slice(0, 2).map((n) => n.id)
  );

  const filteredNodes = cluster.nodes.filter((n) => {
    const matchesStatus = statusFilter === 'ALL' || n.status === statusFilter;
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      n.hostname.toLowerCase().includes(q) ||
      n.ip.includes(q) ||
      n.podCidr.includes(q) ||
      n.zone.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const toggleNodeSelect = (id: string) => {
    setSelectedNodeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedNodeIds.length === filteredNodes.length) {
      setSelectedNodeIds([]);
    } else {
      setSelectedNodeIds(filteredNodes.map((n) => n.id));
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedNodeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
            Nodes &amp; Workloads
          </h1>
          <p className="font-mono text-xs text-slate-400 mt-0.5">
            {cluster.nodes.length} provisioned compute nodes · {cluster.pods.length} active pods
          </p>
        </div>

        {/* Batch Selection Controls */}
        {selectedNodeIds.length > 0 && (
          <div className="flex items-center gap-2 rounded bg-[#1E293B] border border-[#06B6D4]/40 px-3 py-1.5">
            <span className="font-mono text-xs text-[#4cd7f6] tabular-nums">
              {selectedNodeIds.length} selected
            </span>
            <button
              onClick={() => {
                onBatchCordon(selectedNodeIds, true);
                setSelectedNodeIds([]);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-700 text-xs font-mono text-amber-300 hover:border-amber-400/50"
            >
              <PauseCircle className="w-3 h-3" />
              <span>Cordon</span>
            </button>
            <button
              onClick={() => {
                onBatchCordon(selectedNodeIds, false);
                setSelectedNodeIds([]);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-700 text-xs font-mono text-emerald-300 hover:border-emerald-400/50"
            >
              <PlayCircle className="w-3 h-3" />
              <span>Uncordon</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="glass-panel rounded p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by hostname, IP, CIDR, or zone..."
            className="w-full rounded bg-slate-950/80 border border-slate-800 pl-8 pr-3 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#06B6D4]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-[#0a0e16] border border-slate-800 rounded p-0.5">
          {(
            [
              { id: 'ALL', label: 'All' },
              { id: HealthStatus.HEALTHY, label: 'Healthy' },
              { id: HealthStatus.DEGRADED, label: 'Degraded' },
              { id: HealthStatus.CRASHED, label: 'Crashed' },
              { id: HealthStatus.CORDONED, label: 'Cordoned' },
            ] as { id: 'ALL' | HealthStatus; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-2.5 py-1 rounded-xs font-mono text-[11px] transition-colors whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-[#1E293B] text-[#4cd7f6] font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Node + Pod Hierarchical Matrix */}
      <div className="glass-panel rounded overflow-hidden">
        <div className="overflow-x-auto micro-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#111827]/90 border-b border-slate-800/90 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                <th className="py-2.5 px-3 w-9">
                  <button
                    onClick={toggleSelectAll}
                    aria-label="Select all nodes"
                    className={`w-3.5 h-3.5 rounded-[2px] border flex items-center justify-center transition-colors ${
                      filteredNodes.length > 0 &&
                      selectedNodeIds.length === filteredNodes.length
                        ? 'bg-[#06B6D4] border-[#06B6D4] text-[#0B0F17]'
                        : 'border-slate-600 bg-slate-950/60 hover:border-[#06B6D4]'
                    }`}
                  >
                    {filteredNodes.length > 0 &&
                      selectedNodeIds.length === filteredNodes.length && (
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      )}
                  </button>
                </th>
                <th className="py-2.5 px-2 w-8" />
                <th className="py-2.5 px-3 font-semibold">Node / Instance</th>
                <th className="py-2.5 px-3 font-semibold">Network</th>
                <th className="py-2.5 px-3 font-semibold">Kubelet / OS</th>
                <th className="py-2.5 px-3 font-semibold text-right">CPU</th>
                <th className="py-2.5 px-3 font-semibold text-right">Mem</th>
                <th className="py-2.5 px-3 font-semibold text-right">Status</th>
                <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {filteredNodes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    No nodes match current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredNodes.map((node) => {
                  const isChecked = selectedNodeIds.includes(node.id);
                  const isExpanded = expandedNodeIds.includes(node.id);
                  const nodePods = cluster.pods.filter((p) => p.nodeId === node.id);
                  const isSelected =
                    selectedInspector?.kind === 'node' &&
                    selectedInspector.id === node.id;

                  return (
                    <React.Fragment key={node.id}>
                      <tr
                        className={`transition-colors ${
                          isSelected ? 'bg-[#1E293B]/80' : 'hover:bg-slate-900/50'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => toggleNodeSelect(node.id)}
                            aria-label={`Select ${node.hostname}`}
                            className={`w-3.5 h-3.5 rounded-[2px] border flex items-center justify-center transition-colors ${
                              isChecked
                                ? 'bg-[#06B6D4] border-[#06B6D4] text-[#0B0F17]'
                                : 'border-slate-600 bg-slate-950/60 hover:border-[#06B6D4]'
                            }`}
                          >
                            {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </button>
                        </td>
                        <td className="py-2.5 px-2">
                          <button
                            onClick={() => toggleExpand(node.id)}
                            aria-label={isExpanded ? 'Collapse pods' : 'Expand pods'}
                            className="p-1 rounded text-slate-400 hover:text-[#4cd7f6] hover:bg-slate-800/70"
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
                        <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                          <span
                            className={
                              node.cpuPercent > 85 ? 'text-red-400 font-semibold' : 'text-slate-200'
                            }
                          >
                            {node.cpuPercent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                          <span
                            className={
                              node.memoryPercent > 88
                                ? 'text-amber-400 font-semibold'
                                : 'text-slate-200'
                            }
                          >
                            {node.memoryPercent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <StatusBadge status={node.status} compact />
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() =>
                                onBatchCordon([node.id], node.status !== HealthStatus.CORDONED)
                              }
                              className="px-2 py-1 rounded bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300 hover:border-[#06B6D4]/50"
                            >
                              {node.status === HealthStatus.CORDONED ? 'Uncordon' : 'Cordon'}
                            </button>
                            <button
                              onClick={() => onDrainNode(node.id)}
                              title="Drain node workloads"
                              className="p-1.5 rounded border border-red-500/40 text-red-400 hover:bg-red-500/15"
                            >
                              <ShieldAlert className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Nested Pod Workloads */}
                      {isExpanded && (
                        <tr className="bg-[#0a0e16]/90">
                          <td colSpan={9} className="px-8 py-3 border-b border-slate-800/80">
                            <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400 mb-2">
                              Scheduled Pods ({nodePods.length})
                            </div>
                            {nodePods.length === 0 ? (
                              <div className="text-xs text-slate-500 py-1">
                                Node drained — zero user workloads scheduled.
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {nodePods.map((pod) => {
                                  const podSelected =
                                    selectedInspector?.kind === 'pod' &&
                                    selectedInspector.id === pod.id;
                                  return (
                                    <div
                                      key={pod.id}
                                      onClick={() => onInspect({ kind: 'pod', id: pod.id })}
                                      className={`flex flex-wrap items-center justify-between gap-3 rounded border px-3 py-2 cursor-pointer transition-colors ${
                                        podSelected
                                          ? 'bg-[#1E293B] border-[#06B6D4]/50'
                                          : 'bg-[#0F172A]/60 border-slate-800/80 hover:border-slate-700'
                                      }`}
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
                                        <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                          {pod.ip} · {pod.image} · {pod.sha256.slice(0, 22)}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-4 text-[11px] tabular-nums shrink-0">
                                        <span className="text-slate-300">
                                          {pod.cpuMillicores}m / {pod.cpuLimitMillicores}m
                                        </span>
                                        <span className="text-slate-300">
                                          {pod.memoryMiB}Mi / {pod.memoryLimitMiB}Mi
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
                                            onRestartPod(pod.id);
                                          }}
                                          title="Restart pod"
                                          className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:text-[#4cd7f6] hover:border-[#06B6D4]/50"
                                        >
                                          <RotateCw className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
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
    </div>
  );
};
