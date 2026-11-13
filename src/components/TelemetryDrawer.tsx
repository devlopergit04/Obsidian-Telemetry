import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  FileCode2,
  PauseCircle,
  PlayCircle,
  RotateCw,
  ShieldAlert,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type { AuthSession, ClusterSnapshot, InspectorSelection } from '../shared/types.ts';
import { StatusBadge } from './StatusBadge.tsx';

interface TelemetryDrawerProps {
  open: boolean;
  onClose: () => void;
  snapshot: ClusterSnapshot;
  session: AuthSession;
  selection: InspectorSelection | null;
  onCordonNode: (nodeName: string, unschedulable: boolean) => void;
  onDrainNode: (nodeName: string) => void;
  onDeletePod: (namespace: string, podName: string) => void;
  onRestartDeployment: (namespace: string, name: string) => void;
  onViewManifest: (
    kind: 'node' | 'pod' | 'deployment' | 'service',
    name: string,
    namespace?: string
  ) => void;
  onJumpToLogs: (namespace: string, podName: string) => void;
  onAcknowledgeIncident: (incidentId: string) => void;
  onResolveIncident: (incidentId: string) => void;
}

export const TelemetryDrawer: React.FC<TelemetryDrawerProps> = ({
  open,
  onClose,
  snapshot,
  session,
  selection,
  onCordonNode,
  onDrainNode,
  onDeletePod,
  onRestartDeployment,
  onViewManifest,
  onJumpToLogs,
  onAcknowledgeIncident,
  onResolveIncident,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [execOutput, setExecOutput] = useState<string[]>([]);
  const [execInput, setExecInput] = useState('');
  const [execConnected, setExecConnected] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, [selection]);

  if (!open) return null;

  const copyValue = (key: string, val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const canMutateLive = snapshot.sourceMode === 'live' && session.role !== 'viewer';
  const canPodExec =
    snapshot.sourceMode === 'live' &&
    session.podExecEnabled &&
    session.role === 'admin' &&
    snapshot.rbac.canExecPods;

  const connectPodExec = (namespace: string, podName: string, container?: string) => {
    wsRef.current?.close();
    setExecOutput([]);
    setExecError(null);
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const qs = new URLSearchParams({
      namespace,
      pod: podName,
      context: snapshot.cluster.contextName,
    });
    if (container) qs.set('container', container);
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/exec?${qs.toString()}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setExecConnected(true);
      setExecOutput([`Connected to ${namespace}/${podName} (/bin/sh)`]);
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data)) as {
          type: string;
          data?: string;
          message?: string;
        };
        if ((msg.type === 'stdout' || msg.type === 'stderr') && msg.data) {
          setExecOutput((prev) => [...prev.slice(-80), msg.data!]);
        } else if (msg.type === 'error' && msg.message) {
          setExecError(msg.message);
        }
      } catch {
        // Ignore malformed frame
      }
    };
    ws.onerror = () => {
      setExecError('WebSocket exec connection failed.');
    };
    ws.onclose = () => {
      setExecConnected(false);
    };
  };

  const sendExecCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !execInput.trim()) return;
    wsRef.current.send(JSON.stringify({ type: 'stdin', data: `${execInput}\n` }));
    setExecInput('');
  };

  const renderNodeInspector = (nodeId: string) => {
    const node = snapshot.nodes.find((n) => n.id === nodeId) || snapshot.nodes[0];
    if (!node) {
      return (
        <div className="font-mono text-xs text-slate-400">
          Select a connected cluster node to inspect conditions, resources, and workloads.
        </div>
      );
    }
    const nodePods = snapshot.pods.filter((p) => p.nodeName === node.hostname);
    const nodeEvents = snapshot.events.filter(
      (ev) => ev.involvedKind === 'Node' && ev.involvedName === node.hostname
    );

    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#4cd7f6]">
              Node Telemetry
            </span>
            <StatusBadge status={node.status} compact />
          </div>
          <h3 className="font-mono text-sm font-semibold text-[#dfe2ee] break-all">
            {node.hostname}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
            <span>{node.zone}</span>
            <span>·</span>
            <span>{node.instanceType}</span>
            <span>·</span>
            <span>age {node.uptime}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onCordonNode(node.hostname, !node.unschedulable)}
            disabled={!canMutateLive || !snapshot.rbac.canPatchNodes}
            title={
              !canMutateLive
                ? 'Requires live cluster and operator/admin session'
                : !snapshot.rbac.canPatchNodes
                  ? 'ServiceAccount lacks nodes/patch permission'
                  : undefined
            }
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-slate-900/70 border border-slate-800 text-xs font-medium text-slate-200 hover:border-[#06B6D4]/50 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {node.unschedulable ? (
              <>
                <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Uncordon</span>
              </>
            ) : (
              <>
                <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Cordon</span>
              </>
            )}
          </button>
          <button
            onClick={() => onDrainNode(node.hostname)}
            disabled={!canMutateLive || !snapshot.rbac.canEvictPods}
            title={
              !canMutateLive
                ? 'Requires live cluster and operator/admin session'
                : !snapshot.rbac.canEvictPods
                  ? 'ServiceAccount lacks pods/eviction permission'
                  : undefined
            }
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-red-500/50 text-xs font-medium text-red-400 hover:bg-red-500/15 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Drain Node</span>
          </button>
        </div>

        {snapshot.sourceMode === 'live' && (
          <button
            onClick={() => onViewManifest('node', node.hostname)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-slate-900/60 border border-slate-800 font-mono text-xs text-[#4cd7f6] hover:border-[#06B6D4]/50"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>Inspect Live YAML</span>
          </button>
        )}

        <div className="rounded border border-slate-800/80 bg-[#0a0e16]/70 divide-y divide-slate-800/70 text-xs font-mono">
          {[
            { label: 'Node IP', value: node.ip, copyable: true },
            { label: 'Pod CIDR', value: node.podCidr, copyable: true },
            { label: 'Kubelet', value: node.kubeletVersion },
            { label: 'Kernel', value: node.kernelVersion },
            { label: 'OS Image', value: node.osImage },
            {
              label: 'CPU Usage',
              value:
                node.cpuPercent !== null
                  ? `${node.cpuPercent}% (${node.cpuMillicores}m / ${node.allocatableCpuMillicores}m)`
                  : `Unavailable (${node.allocatableCpuMillicores}m alloc)`,
            },
            {
              label: 'Memory',
              value:
                node.memoryPercent !== null
                  ? `${node.memoryPercent}% (${node.memoryMiB}Mi / ${node.allocatableMemoryMiB}Mi)`
                  : `Unavailable (${node.allocatableMemoryMiB}Mi alloc)`,
            },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-3 py-2 gap-2">
              <span className="text-slate-400 text-[11px] shrink-0">{row.label}</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-200 truncate">{row.value}</span>
                {row.copyable && row.value !== 'n/a' && (
                  <button
                    onClick={() => copyValue(row.label, row.value)}
                    aria-label={`Copy ${row.label}`}
                    className="text-slate-500 hover:text-[#4cd7f6] shrink-0"
                  >
                    {copiedKey === row.label ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400 mb-2">
            Node Conditions ({node.conditions.length})
          </div>
          <div className="space-y-1">
            {node.conditions.map((cond) => (
              <div
                key={cond.type}
                className="flex items-center justify-between rounded border border-slate-800/70 bg-[#0a0e16]/60 px-2.5 py-1.5 font-mono text-[11px]"
              >
                <span className="text-slate-300">{cond.type}</span>
                <span
                  className={
                    (cond.type === 'Ready' && cond.status === 'True') ||
                    (cond.type !== 'Ready' && cond.status === 'False')
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }
                >
                  {cond.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400 mb-2">
            Scheduled Pods ({nodePods.length})
          </div>
          {nodePods.length === 0 ? (
            <div className="rounded border border-slate-800/80 bg-[#0a0e16]/60 p-2.5 text-xs font-mono text-slate-500">
              No pods scheduled on this node.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto micro-scroll">
              {nodePods.map((pod) => (
                <div
                  key={pod.id}
                  onClick={() => onJumpToLogs(pod.namespace, pod.name)}
                  className="flex items-center justify-between gap-2 rounded border border-slate-800/80 bg-[#0a0e16]/70 px-2.5 py-2 cursor-pointer hover:border-[#06B6D4]/40"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-slate-200 truncate">{pod.name}</div>
                    <div className="font-mono text-[10px] text-slate-400">
                      {pod.namespace} · {pod.restarts} restarts
                    </div>
                  </div>
                  <StatusBadge status={pod.status} compact />
                </div>
              ))}
            </div>
          )}
        </div>

        {nodeEvents.length > 0 && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400 mb-2">
              Kubernetes Events ({nodeEvents.length})
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto micro-scroll">
              {nodeEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded border border-slate-800/80 bg-[#0a0e16]/70 p-2 font-mono text-[10px]"
                >
                  <div className="text-[#4cd7f6] font-semibold">{ev.reason}</div>
                  <div className="text-slate-300 mt-0.5">{ev.message}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPodInspector = (podId: string) => {
    const pod = snapshot.pods.find((p) => p.id === podId);
    if (!pod) return null;

    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#4cd7f6]">
              Pod Diagnostic Inspector
            </span>
            <StatusBadge status={pod.status} compact />
          </div>
          <h3 className="font-mono text-sm font-semibold text-[#dfe2ee] break-all">{pod.name}</h3>
          <div className="font-mono text-xs text-slate-400">
            ns/{pod.namespace} · Phase {pod.phase} · Restarts {pod.restarts}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onJumpToLogs(pod.namespace, pod.name)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-[#06B6D4] text-[#0B0F17] text-xs font-medium hover:bg-[#22D3EE]"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Container Logs</span>
          </button>
          <button
            onClick={() => onDeletePod(pod.namespace, pod.name)}
            disabled={!canMutateLive || !snapshot.rbac.canDeletePods}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-red-500/50 text-xs font-medium text-red-400 hover:bg-red-500/15 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Pod</span>
          </button>
        </div>

        {snapshot.sourceMode === 'live' && (
          <button
            onClick={() => onViewManifest('pod', pod.name, pod.namespace)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-slate-900/60 border border-slate-800 font-mono text-xs text-[#4cd7f6] hover:border-[#06B6D4]/50"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>Inspect Live YAML</span>
          </button>
        )}

        <div className="rounded border border-slate-800/80 bg-[#0a0e16]/75 divide-y divide-slate-800/70 text-xs font-mono">
          {[
            { label: 'Pod IP', value: pod.ip, copyable: true },
            { label: 'Node', value: pod.nodeName },
            {
              label: 'Owner',
              value: pod.ownerKind ? `${pod.ownerKind}/${pod.ownerName}` : 'Standalone',
            },
            {
              label: 'CPU (Use/Req/Lim)',
              value: `${pod.cpuMillicores !== null ? `${pod.cpuMillicores}m` : 'n/a'} / ${
                pod.cpuRequestMillicores
              }m / ${pod.cpuLimitMillicores}m`,
            },
            {
              label: 'Mem (Use/Req/Lim)',
              value: `${pod.memoryMiB !== null ? `${pod.memoryMiB}Mi` : 'n/a'} / ${
                pod.memoryRequestMiB
              }Mi / ${pod.memoryLimitMiB}Mi`,
            },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-3 py-2 gap-2">
              <span className="text-slate-400 text-[11px] shrink-0">{row.label}</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-200 truncate">{row.value}</span>
                {row.copyable && row.value !== 'pending' && (
                  <button
                    onClick={() => copyValue(row.label, row.value)}
                    aria-label={`Copy ${row.label}`}
                    className="text-slate-500 hover:text-[#4cd7f6] shrink-0"
                  >
                    {copiedKey === row.label ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400 mb-2">
            Containers ({pod.containers.length})
          </div>
          <div className="space-y-2">
            {pod.containers.map((c) => (
              <div
                key={c.name}
                className="rounded border border-slate-800/80 bg-[#0a0e16]/75 p-2.5 font-mono text-[11px] space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[#dfe2ee] font-semibold">{c.name}</span>
                  <span className={c.ready ? 'text-emerald-400' : 'text-red-400'}>
                    {c.state}
                    {c.reason ? ` (${c.reason})` : ''}
                  </span>
                </div>
                <div className="text-slate-400 text-[10px] truncate">{c.image}</div>
                {c.lastTerminationReason && (
                  <div className="text-amber-300 text-[10px]">
                    Last exit: {c.lastTerminationReason} (code {c.exitCode ?? '?'})
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Gated Kubernetes Exec or Explicit Read-Only Diagnostic Notice */}
        <div className="rounded border border-slate-800/90 bg-[#070A0F] p-3 space-y-2">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3 h-3 text-[#4cd7f6]" />
              <span>Kubernetes Pod Exec</span>
            </span>
            <span className={canPodExec ? 'text-emerald-400' : 'text-slate-500'}>
              {canPodExec ? (execConnected ? 'CONNECTED' : 'READY') : 'DISABLED'}
            </span>
          </div>

          {!canPodExec ? (
            <p className="font-mono text-[11px] text-slate-400 leading-relaxed">
              Interactive shell exec is disabled (requires live cluster,{' '}
              <code className="text-slate-300">ENABLE_POD_EXEC=true</code>, authenticated{' '}
              <code className="text-slate-300">admin</code> role, and Kubernetes{' '}
              <code className="text-slate-300">pods/exec</code> RBAC). Use Container Logs above for
              diagnostics.
            </p>
          ) : (
            <div className="space-y-2">
              {!execConnected && (
                <button
                  onClick={() => connectPodExec(pod.namespace, pod.name, pod.containers[0]?.name)}
                  className="w-full py-1.5 rounded bg-[#1E293B] border border-[#06B6D4]/40 font-mono text-xs text-[#4cd7f6] hover:bg-slate-800"
                >
                  Attach /bin/sh Session
                </button>
              )}
              {execError && <div className="font-mono text-[11px] text-red-400">{execError}</div>}
              {execOutput.length > 0 && (
                <pre className="max-h-36 overflow-y-auto micro-scroll font-mono text-[11px] text-slate-200 whitespace-pre-wrap">
                  {execOutput.join('')}
                </pre>
              )}
              {execConnected && (
                <form
                  onSubmit={sendExecCommand}
                  className="flex items-center gap-1.5 border-t border-slate-800 pt-2 font-mono text-[11px]"
                >
                  <span className="text-emerald-400">$</span>
                  <input
                    type="text"
                    value={execInput}
                    onChange={(e) => setExecInput(e.target.value)}
                    placeholder="Enter command..."
                    className="flex-1 bg-transparent text-slate-100 focus:outline-none"
                  />
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDeploymentInspector = (id: string) => {
    const dep = snapshot.deployments.find((d) => d.id === id);
    if (!dep) return null;

    return (
      <div className="space-y-5">
        <div className="space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#4cd7f6]">
            Deployment Workload
          </span>
          <h3 className="font-mono text-sm font-semibold text-[#dfe2ee]">{dep.name}</h3>
          <div className="font-mono text-xs text-slate-400">
            ns/{dep.namespace} · Ready {dep.readyReplicas}/{dep.replicas}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onRestartDeployment(dep.namespace, dep.name)}
            disabled={!canMutateLive || !snapshot.rbac.canRestartDeployments}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-[#06B6D4] text-[#0B0F17] text-xs font-medium hover:bg-[#22D3EE] disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Rollout Restart</span>
          </button>
          {snapshot.sourceMode === 'live' && (
            <button
              onClick={() => onViewManifest('deployment', dep.name, dep.namespace)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-slate-900 border border-slate-800 text-xs font-medium text-[#4cd7f6]"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>YAML</span>
            </button>
          )}
        </div>

        <div className="rounded border border-slate-800/80 bg-[#0a0e16]/75 divide-y divide-slate-800/70 text-xs font-mono">
          <div className="flex justify-between px-3 py-2">
            <span className="text-slate-400">Strategy</span>
            <span className="text-slate-200">{dep.strategy}</span>
          </div>
          <div className="flex justify-between px-3 py-2">
            <span className="text-slate-400">Image</span>
            <span className="text-slate-200 truncate max-w-[200px]">{dep.image}</span>
          </div>
          <div className="flex justify-between px-3 py-2">
            <span className="text-slate-400">Age</span>
            <span className="text-slate-200">{dep.age}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderServiceInspector = (id: string) => {
    const svc = snapshot.services.find((s) => s.id === id);
    if (!svc) return null;

    return (
      <div className="space-y-5">
        <div className="space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#4cd7f6]">
            Kubernetes Service
          </span>
          <h3 className="font-mono text-sm font-semibold text-[#dfe2ee]">{svc.name}</h3>
          <div className="font-mono text-xs text-slate-400">
            ns/{svc.namespace} · {svc.type}
          </div>
        </div>

        {snapshot.sourceMode === 'live' && (
          <button
            onClick={() => onViewManifest('service', svc.name, svc.namespace)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-slate-900 border border-slate-800 font-mono text-xs text-[#4cd7f6]"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>Inspect Service YAML</span>
          </button>
        )}

        <div className="rounded border border-slate-800/80 bg-[#0a0e16]/75 divide-y divide-slate-800/70 text-xs font-mono">
          <div className="flex justify-between px-3 py-2">
            <span className="text-slate-400">ClusterIP</span>
            <span className="text-slate-200">{svc.clusterIp}</span>
          </div>
          <div className="flex justify-between px-3 py-2">
            <span className="text-slate-400">Ports</span>
            <span className="text-slate-200">{svc.ports.join(', ') || 'none'}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderIncidentInspector = (id: string) => {
    const inc = snapshot.incidents.find((i) => i.id === id);
    if (!inc) return null;

    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#4cd7f6]">
              {inc.source}
            </span>
            <StatusBadge status={inc.severity} compact />
          </div>
          <h3 className="font-display text-sm font-semibold text-[#dfe2ee]">{inc.title}</h3>
          <div className="font-mono text-xs text-slate-400">
            {inc.targetResource} · Opened {inc.openedAt}
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">{inc.summary}</p>

        {inc.severity !== 'RESOLVED' && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onAcknowledgeIncident(inc.id)}
              disabled={!canMutateLive || inc.acknowledged}
              className="px-3 py-2 rounded text-xs font-medium border bg-amber-500/10 border-amber-500/40 text-amber-300 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {inc.acknowledged ? 'Acknowledged' : 'Acknowledge'}
            </button>
            <button
              onClick={() => onResolveIncident(inc.id)}
              disabled={!canMutateLive}
              className="px-3 py-2 rounded text-xs font-medium border bg-emerald-500/15 border-emerald-500/40 text-emerald-300 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              Mark Triaged
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderBody = () => {
    if (!selection) {
      return renderNodeInspector(snapshot.nodes[0]?.id || '');
    }
    switch (selection.kind) {
      case 'node':
        return renderNodeInspector(selection.id);
      case 'pod':
        return renderPodInspector(selection.id);
      case 'deployment':
        return renderDeploymentInspector(selection.id);
      case 'service':
        return renderServiceInspector(selection.id);
      case 'incident':
        return renderIncidentInspector(selection.id);
    }
  };

  const drawerInner = (
    <div className="flex flex-col h-full bg-[#0f131c]/95 border-l border-slate-800/80">
      <div className="h-12 px-4 border-b border-slate-800/80 flex items-center justify-between shrink-0">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-slate-300 font-semibold">
          Contextual Inspector
        </span>
        <button
          onClick={onClose}
          aria-label="Close contextual inspector"
          className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto micro-scroll p-4">{renderBody()}</div>
    </div>
  );

  return (
    <>
      <aside className="hidden xl:block w-[360px] shrink-0 h-full">{drawerInner}</aside>
      <div className="fixed inset-0 z-40 xl:hidden flex justify-end">
        <div className="fixed inset-0 bg-black/65 backdrop-blur-xs" onClick={onClose} />
        <div className="relative w-full max-w-[360px] h-full z-10">{drawerInner}</div>
      </div>
    </>
  );
};
