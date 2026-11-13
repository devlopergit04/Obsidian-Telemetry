import React, { useState } from 'react';
import {
  Check,
  Copy,
  PauseCircle,
  PlayCircle,
  RotateCw,
  ShieldAlert,
  Terminal,
  X,
} from 'lucide-react';
import {
  ClusterData,
  HealthStatus,
  IncidentSeverity,
  InspectorSelection,
} from '../types/telemetry';
import { MicroSparkline } from './Sparkline';
import { StatusBadge } from './StatusBadge';

interface TelemetryDrawerProps {
  open: boolean;
  onClose: () => void;
  cluster: ClusterData;
  selection: InspectorSelection | null;
  onCordonToggle: (nodeId: string) => void;
  onDrainNode: (nodeId: string) => void;
  onRestartPod: (podId: string) => void;
  onAcknowledgeIncident: (incidentId: string) => void;
  onResolveIncident: (incidentId: string) => void;
  onJumpToLogs: (filterTerm: string) => void;
}

export const TelemetryDrawer: React.FC<TelemetryDrawerProps> = ({
  open,
  onClose,
  cluster,
  selection,
  onCordonToggle,
  onDrainNode,
  onRestartPod,
  onAcknowledgeIncident,
  onResolveIncident,
  onJumpToLogs,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [shellCmd, setShellCmd] = useState('');
  const [shellHistory, setShellHistory] = useState<string[]>([
    '$ kubectl get cs',
    'NAME                 STATUS    MESSAGE',
    'scheduler            Healthy   ok',
    'controller-manager   Healthy   ok',
    'etcd-0               Healthy   {"health":"true"}',
  ]);

  if (!open) return null;

  const copyValue = (key: string, val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const runShellCommand = (e: React.FormEvent, nodeId: string) => {
    e.preventDefault();
    const cmd = shellCmd.trim();
    if (!cmd) return;
    const targetNode = cluster.nodes.find((n) => n.id === nodeId) || cluster.nodes[0];
    const nodePods = cluster.pods.filter((p) => p.nodeId === targetNode.id);

    let lines: string[] = [];
    if (cmd === 'clear') {
      setShellHistory([]);
      setShellCmd('');
      return;
    } else if (cmd === 'help') {
      lines = [
        'Commands: help, kubectl get pods, free -m, ip addr, df -h, top, uname -a, uptime, clear',
      ];
    } else if (cmd.startsWith('kubectl get pods')) {
      lines =
        nodePods.length === 0
          ? ['No resources found on node.']
          : [
              'NAME                              STATUS    RESTARTS   IP',
              ...nodePods.map(
                (p) =>
                  `${p.name.slice(0, 32).padEnd(33)} ${p.status.padEnd(9)} ${String(
                    p.restarts
                  ).padEnd(10)} ${p.ip}`
              ),
            ];
    } else if (cmd.startsWith('free')) {
      const totalMb = 32768;
      const usedMb = Math.round((targetNode.memoryPercent / 100) * totalMb);
      const freeMb = totalMb - usedMb;
      lines = [
        '              total        used        free',
        `Mem:          ${totalMb}       ${String(usedMb).padEnd(11)} ${freeMb}`,
      ];
    } else if (cmd.startsWith('ip')) {
      lines = [
        `eth0: inet ${targetNode.ip}/16 scope global`,
        `cni0: inet ${targetNode.podCidr} scope link`,
      ];
    } else if (cmd.startsWith('uptime')) {
      lines = [`up ${targetNode.uptime}, load average: ${(targetNode.cpuPercent / 12).toFixed(2)}`];
    } else if (cmd.includes('top')) {
      lines = [
        `CPU: ${targetNode.cpuPercent.toFixed(1)}% | MEM: ${targetNode.memoryPercent.toFixed(
          1
        )}% | PODS: ${nodePods.length}/${targetNode.podCapacity}`,
      ];
    } else if (cmd.includes('df')) {
      lines = [
        `/dev/nvme0n1p1  100G  ${Math.round(targetNode.diskPercent)}G  ${
          100 - Math.round(targetNode.diskPercent)
        }G  ${Math.round(targetNode.diskPercent)}% /var/lib/kubelet`,
      ];
    } else if (cmd.includes('uname')) {
      lines = [
        `Linux ${targetNode.hostname} ${targetNode.kernelVersion} #1 SMP x86_64 ${targetNode.osImage}`,
      ];
    } else {
      lines = [`sh: ${cmd.split(' ')[0]}: executed on ${targetNode.ip} (try 'help')`];
    }

    setShellHistory((prev) => [...prev.slice(-10), `$ ${cmd}`, ...lines]);
    setShellCmd('');
  };

  const renderNodeInspector = (nodeId: string) => {
    const node = cluster.nodes.find((n) => n.id === nodeId) || cluster.nodes[0];
    if (!node) return null;
    const nodePods = cluster.pods.filter((p) => p.nodeId === node.id);
    const isCordoned = node.status === HealthStatus.CORDONED;

    return (
      <div className="space-y-5">
        {/* Header */}
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
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>{node.zone}</span>
            <span>·</span>
            <span>{node.instanceType}</span>
            <span>·</span>
            <span>{node.uptime}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onCordonToggle(node.id)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-slate-900/70 border border-slate-800 text-xs font-medium text-slate-200 hover:border-[#06B6D4]/50 hover:bg-slate-800/80 transition-colors whitespace-nowrap"
          >
            {isCordoned ? (
              <>
                <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Uncordon</span>
              </>
            ) : (
              <>
                <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Cordon Node</span>
              </>
            )}
          </button>
          <button
            onClick={() => onDrainNode(node.id)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-red-500/50 text-xs font-medium text-red-400 hover:bg-red-500/15 transition-colors whitespace-nowrap"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Drain Pods</span>
          </button>
        </div>

        {/* Live Resource Sparklines */}
        <div className="space-y-3 rounded border border-slate-800/80 bg-[#0a0e16]/80 p-3">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400">
                CPU Load
              </span>
              <span className="font-mono text-xs font-semibold text-[#4cd7f6] tabular-nums">
                {node.cpuPercent.toFixed(1)}%
              </span>
            </div>
            <MicroSparkline
              data={node.cpuHistory}
              color={node.cpuPercent > 85 ? '#EF4444' : '#06B6D4'}
              height={38}
            />
          </div>
          <div className="pt-2 border-t border-slate-800/70">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400">
                Memory Working Set
              </span>
              <span className="font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                {node.memoryPercent.toFixed(1)}%
              </span>
            </div>
            <MicroSparkline
              data={node.memHistory}
              color={node.memoryPercent > 88 ? '#F59E0B' : '#10B981'}
              height={38}
            />
          </div>
        </div>

        {/* Network & Kernel Specs */}
        <div className="rounded border border-slate-800/80 bg-[#0a0e16]/70 divide-y divide-slate-800/70 text-xs font-mono">
          {[
            { label: 'Node IP', value: node.ip, copyable: true },
            { label: 'Pod CIDR', value: node.podCidr, copyable: true },
            { label: 'Kubelet', value: node.kubeletVersion },
            { label: 'Kernel', value: node.kernelVersion },
            { label: 'OS Image', value: node.osImage },
            {
              label: 'Net Rx / Tx',
              value: `${node.networkRxMbps} / ${node.networkTxMbps} Mbps`,
            },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-3 py-2 gap-2">
              <span className="text-slate-400 text-[11px]">{row.label}</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-200 truncate">{row.value}</span>
                {row.copyable && (
                  <button
                    onClick={() => copyValue(row.label, row.value)}
                    aria-label={`Copy ${row.label}`}
                    className="text-slate-500 hover:text-[#4cd7f6] transition-colors shrink-0"
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

        {/* Hosted Pods */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
              Scheduled Workloads ({nodePods.length})
            </span>
            <button
              onClick={() => onJumpToLogs(node.hostname)}
              className="font-mono text-[11px] text-[#4cd7f6] hover:underline"
            >
              Tail Node Logs
            </button>
          </div>
          {nodePods.length === 0 ? (
            <div className="rounded border border-slate-800/80 bg-[#0a0e16]/60 p-3 text-xs text-slate-400 font-mono">
              No pods scheduled on this node.
            </div>
          ) : (
            <div className="space-y-1.5">
              {nodePods.map((pod) => (
                <div
                  key={pod.id}
                  className="flex items-center justify-between gap-2 rounded border border-slate-800/80 bg-[#0a0e16]/70 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-slate-200 truncate">{pod.name}</div>
                    <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                      {pod.namespace} · {pod.cpuMillicores}m · {pod.memoryMiB}MiB
                    </div>
                  </div>
                  <StatusBadge status={pod.status} compact />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Node Events */}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400 mb-2">
            Recent Node Events ({node.events.length})
          </div>
          {node.events.length === 0 ? (
            <div className="rounded border border-slate-800/80 bg-[#0a0e16]/60 p-2.5 text-[11px] font-mono text-slate-500">
              No recent warning or lifecycle events.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto micro-scroll">
              {node.events.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded border border-slate-800/80 bg-[#0a0e16]/70 px-2.5 py-1.5 font-mono text-[11px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={
                        ev.type === 'Critical'
                          ? 'text-red-400 font-semibold'
                          : ev.type === 'Warning'
                          ? 'text-amber-400 font-semibold'
                          : 'text-[#4cd7f6]'
                      }
                    >
                      {ev.reason}
                    </span>
                    <span className="text-[10px] text-slate-500">{ev.time}</span>
                  </div>
                  <div className="text-slate-300 text-[10px] mt-0.5 leading-snug">
                    {ev.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Embedded Mini-Terminal */}
        <div>
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3 h-3 text-[#4cd7f6]" />
              <span>Node Exec Console</span>
            </span>
            <span className="text-slate-500">type &lsquo;help&rsquo;</span>
          </div>
          <div className="rounded border border-slate-800/90 bg-[#070A0F] p-2.5 font-mono text-[11px]">
            <div className="max-h-32 overflow-y-auto micro-scroll space-y-1 text-slate-300 mb-2 whitespace-pre">
              {shellHistory.map((line, idx) => (
                <div
                  key={idx}
                  className={line.startsWith('$') ? 'text-[#4cd7f6]' : 'text-slate-300'}
                >
                  {line}
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => runShellCommand(e, node.id)}
              className="flex items-center gap-1.5 border-t border-slate-800/80 pt-2"
            >
              <span className="text-emerald-400">$</span>
              <input
                type="text"
                value={shellCmd}
                onChange={(e) => setShellCmd(e.target.value)}
                placeholder="kubectl get pods | free -m | help"
                className="flex-1 bg-transparent text-slate-100 placeholder:text-slate-600 focus:outline-none text-[11px]"
              />
            </form>
          </div>
        </div>
      </div>
    );
  };

  const renderPodInspector = (podId: string) => {
    const pod = cluster.pods.find((p) => p.id === podId);
    if (!pod) return null;
    const hostNode = cluster.nodes.find((n) => n.id === pod.nodeId);

    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#4cd7f6]">
              Pod Container Spec
            </span>
            <StatusBadge status={pod.status} compact />
          </div>
          <h3 className="font-mono text-sm font-semibold text-[#dfe2ee] break-all">{pod.name}</h3>
          <div className="font-mono text-xs text-slate-400">
            ns/{pod.namespace} · Age {pod.age} · Restarts {pod.restarts}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onRestartPod(pod.id)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-[#06B6D4] text-[#0B0F17] text-xs font-medium hover:bg-[#22D3EE] transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Restart Pod</span>
          </button>
          <button
            onClick={() => onJumpToLogs(pod.name)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-slate-900/70 border border-slate-800 text-xs font-medium text-slate-200 hover:border-[#06B6D4]/50 transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 text-[#4cd7f6]" />
            <span>Stream Logs</span>
          </button>
        </div>

        <div className="rounded border border-slate-800/80 bg-[#0a0e16]/75 divide-y divide-slate-800/70 text-xs font-mono">
          {[
            { label: 'Pod IP', value: pod.ip, copyable: true },
            { label: 'Node', value: hostNode?.ip || pod.nodeId },
            { label: 'Image', value: pod.image },
            { label: 'Digest', value: pod.sha256, copyable: true },
            {
              label: 'CPU Usage',
              value: `${pod.cpuMillicores}m / ${pod.cpuLimitMillicores}m`,
            },
            {
              label: 'Memory',
              value: `${pod.memoryMiB}MiB / ${pod.memoryLimitMiB}MiB`,
            },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-3 py-2 gap-3">
              <span className="text-slate-400 text-[11px] shrink-0">{row.label}</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-200 truncate">{row.value}</span>
                {row.copyable && (
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
      </div>
    );
  };

  const renderServiceInspector = (serviceId: string) => {
    const svc = cluster.services.find((s) => s.id === serviceId);
    if (!svc) return null;

    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#4cd7f6]">
              Mesh Service Endpoint
            </span>
            <StatusBadge status={svc.status} compact />
          </div>
          <h3 className="font-mono text-sm font-semibold text-[#dfe2ee]">{svc.name}</h3>
          <div className="font-mono text-xs text-slate-400">
            {svc.namespace} · {svc.tier.toUpperCase()} TIER · Replicas {svc.replicas}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded border border-slate-800/80 bg-[#0a0e16]/80 p-2.5">
            <div className="font-mono text-[10px] text-slate-400 uppercase">Throughput</div>
            <div className="font-mono text-sm font-semibold text-[#4cd7f6] tabular-nums mt-1">
              {svc.rps.toLocaleString()} rps
            </div>
          </div>
          <div className="rounded border border-slate-800/80 bg-[#0a0e16]/80 p-2.5">
            <div className="font-mono text-[10px] text-slate-400 uppercase">P99 Lat</div>
            <div className="font-mono text-sm font-semibold text-slate-100 tabular-nums mt-1">
              {svc.p99Ms} ms
            </div>
          </div>
          <div className="rounded border border-slate-800/80 bg-[#0a0e16]/80 p-2.5">
            <div className="font-mono text-[10px] text-slate-400 uppercase">5xx Err</div>
            <div
              className={`font-mono text-sm font-semibold tabular-nums mt-1 ${
                svc.errorRate > 1 ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {svc.errorRate}%
            </div>
          </div>
        </div>

        <div className="rounded border border-slate-800/80 bg-[#0a0e16]/75 divide-y divide-slate-800/70 text-xs font-mono">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-slate-400">mTLS Policy</span>
            <span className="text-emerald-400">{svc.mtls ? 'STRICT (SPIFFE)' : 'PERMISSIVE'}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-slate-400">Upstream Targets</span>
            <span className="text-slate-200">{svc.upstreamIds.length || 'Leaf Endpoint'}</span>
          </div>
        </div>

        <button
          onClick={() => onJumpToLogs(svc.name)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-slate-900/70 border border-slate-800 text-xs font-medium text-slate-200 hover:border-[#06B6D4]/50 transition-colors"
        >
          <Terminal className="w-3.5 h-3.5 text-[#4cd7f6]" />
          <span>Inspect Service Access Logs</span>
        </button>
      </div>
    );
  };

  const renderIncidentInspector = (incidentId: string) => {
    const inc = cluster.incidents.find((i) => i.id === incidentId);
    if (!inc) return null;

    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#4cd7f6]">
              {inc.id}
            </span>
            <StatusBadge status={inc.severity} compact />
          </div>
          <h3 className="font-display text-sm font-semibold text-[#dfe2ee] leading-snug">
            {inc.title}
          </h3>
          <div className="font-mono text-xs text-slate-400">
            Opened {inc.openedAt} · Duration {inc.duration}
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">{inc.summary}</p>

        {inc.severity !== IncidentSeverity.RESOLVED && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onAcknowledgeIncident(inc.id)}
              disabled={inc.acknowledged}
              className={`px-3 py-2 rounded text-xs font-medium border transition-colors ${
                inc.acknowledged
                  ? 'bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
              }`}
            >
              {inc.acknowledged ? 'Acknowledged' : 'Acknowledge'}
            </button>
            <button
              onClick={() => onResolveIncident(inc.id)}
              className="px-3 py-2 rounded text-xs font-medium bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
            >
              Mark Resolved
            </button>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
              Remediation Runbook
            </span>
            <button
              onClick={() => copyValue('runbook', inc.runbookCmd)}
              className="font-mono text-[10px] text-[#4cd7f6] hover:underline flex items-center gap-1"
            >
              {copiedKey === 'runbook' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedKey === 'runbook' ? 'Copied' : 'Copy Cmd'}</span>
            </button>
          </div>
          <pre className="rounded border border-slate-800 bg-[#070A0F] p-2.5 font-mono text-[11px] text-[#4cd7f6] overflow-x-auto micro-scroll">
            {inc.runbookCmd}
          </pre>
        </div>

        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400 mb-2">
            Incident Timeline
          </div>
          <div className="space-y-2 border-l border-slate-800 pl-3">
            {inc.timeline.map((item, i) => (
              <div key={i} className="text-xs">
                <div className="font-mono text-[10px] text-slate-400">
                  {item.time} · <span className="text-slate-300">{item.actor}</span>
                </div>
                <div className="text-slate-200 mt-0.5">{item.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderBody = () => {
    if (!selection) {
      return renderNodeInspector(cluster.nodes[0]?.id);
    }
    switch (selection.kind) {
      case 'node':
        return renderNodeInspector(selection.id);
      case 'pod':
        return renderPodInspector(selection.id);
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
      {/* Desktop Persistent 360px Drawer (>= 1280px) */}
      <aside className="hidden xl:block w-[360px] shrink-0 h-full">{drawerInner}</aside>

      {/* Tablet / Mobile Slide-over Sheet (< 1280px) */}
      <div className="fixed inset-0 z-40 xl:hidden flex justify-end">
        <div
          className="fixed inset-0 bg-black/65 backdrop-blur-xs"
          onClick={onClose}
        />
        <div className="relative w-full max-w-[360px] h-full z-10">{drawerInner}</div>
      </div>
    </>
  );
};
