/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { IncidentsScreen } from './components/IncidentsScreen';
import { LogsScreen } from './components/LogsScreen';
import { ManifestModal } from './components/ManifestModal';
import { NetworkScreen } from './components/NetworkScreen';
import { NodesScreen } from './components/NodesScreen';
import { OverviewScreen } from './components/OverviewScreen';
import { SidebarRail } from './components/SidebarRail';
import { TelemetryDrawer } from './components/TelemetryDrawer';
import { TopBar } from './components/TopBar';
import {
  INITIAL_CLUSTERS,
  createLiveLogEntry,
  generateWindowSeries,
} from './data/mockClusters';
import {
  ClusterData,
  HealthStatus,
  IncidentSeverity,
  InspectorSelection,
  LogLevel,
  ScreenId,
  TimeWindow,
} from './types/telemetry';

const STORAGE_KEY = 'obsidian_telemetry_clusters_v1';

function recomputeClusterStatus(cluster: ClusterData): HealthStatus {
  const hasCrashedNode = cluster.nodes.some((n) => n.status === HealthStatus.CRASHED);
  const hasCriticalIncident = cluster.incidents.some(
    (i) => i.severity === IncidentSeverity.CRITICAL
  );
  if (hasCrashedNode || hasCriticalIncident) return HealthStatus.DEGRADED;

  const hasDegraded =
    cluster.nodes.some((n) => n.status === HealthStatus.DEGRADED) ||
    cluster.incidents.some((i) => i.severity === IncidentSeverity.WARNING);
  return hasDegraded ? HealthStatus.DEGRADED : HealthStatus.HEALTHY;
}

export default function App() {
  const [clusters, setClusters] = useState<ClusterData[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ClusterData[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to initial seed data
    }
    return INITIAL_CLUSTERS;
  });

  const [activeClusterId, setActiveClusterId] = useState<string>(
    () => clusters[0]?.id || INITIAL_CLUSTERS[0].id
  );
  const [activeScreen, setActiveScreen] = useState<ScreenId>(ScreenId.OVERVIEW);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true);
  const [inspector, setInspector] = useState<InspectorSelection | null>(() => ({
    kind: 'node',
    id: clusters[0]?.nodes[1]?.id || INITIAL_CLUSTERS[0].nodes[0].id,
  }));
  const [isLive, setIsLive] = useState<boolean>(true);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('15m');
  const [commandOpen, setCommandOpen] = useState<boolean>(false);
  const [deployModalOpen, setDeployModalOpen] = useState<boolean>(false);
  const [logSearchPrefill, setLogSearchPrefill] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activeCluster =
    clusters.find((c) => c.id === activeClusterId) || clusters[0];

  const notify = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clusters));
    } catch {
      // Ignore storage quota errors
    }
  }, [clusters]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setCommandOpen(false);
        setDeployModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const sampleTelemetryTick = (targetClusterId?: string) => {
    const now = new Date();
    const ts = now.toISOString().slice(11, 19);

    setClusters((prev) =>
      prev.map((cluster) => {
        if (targetClusterId && cluster.id !== targetClusterId) return cluster;
        const last = cluster.telemetrySeries[cluster.telemetrySeries.length - 1];
        const nextCpu = Math.min(
          97,
          Math.max(18, Math.round((last.cpu + (Math.random() - 0.48) * 3.8) * 10) / 10)
        );
        const nextMem = Math.min(
          95,
          Math.max(25, Math.round((last.memory + (Math.random() - 0.49) * 1.8) * 10) / 10)
        );
        const nextNet = Math.max(
          200,
          Math.round(last.networkMbps + (Math.random() - 0.48) * 95)
        );
        const nextLat = Math.max(
          3.5,
          Math.round((last.p99LatencyMs + (Math.random() - 0.5) * 2.4) * 10) / 10
        );

        const nextSeries = [
          ...cluster.telemetrySeries.slice(1),
          {
            timestamp: ts,
            cpu: nextCpu,
            memory: nextMem,
            networkMbps: nextNet,
            p99LatencyMs: nextLat,
          },
        ];

        const nextNodes = cluster.nodes.map((node) => {
          if (node.status === HealthStatus.CORDONED) return node;
          const delta = (Math.random() - 0.49) * 2.2;
          const cpu = Math.min(
            98,
            Math.max(12, Math.round((node.cpuPercent + delta) * 10) / 10)
          );
          return {
            ...node,
            cpuPercent: cpu,
            cpuHistory: [...node.cpuHistory.slice(1), cpu],
          };
        });

        const newLog = createLiveLogEntry(cluster);

        return {
          ...cluster,
          telemetrySeries: nextSeries,
          nodes: nextNodes,
          logs: [newLog, ...cluster.logs].slice(0, 120),
        };
      })
    );
  };

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      sampleTelemetryTick(activeClusterId);
    }, 3200);
    return () => clearInterval(interval);
  }, [isLive, activeClusterId]);

  const updateActiveCluster = (updater: (cluster: ClusterData) => ClusterData) => {
    setClusters((prev) =>
      prev.map((c) => {
        if (c.id !== activeClusterId) return c;
        const updated = updater(c);
        return {
          ...updated,
          status: recomputeClusterStatus(updated),
        };
      })
    );
  };

  const handleSelectCluster = (clusterId: string) => {
    setActiveClusterId(clusterId);
    const target = clusters.find((c) => c.id === clusterId);
    if (target && target.nodes.length > 0) {
      setInspector({ kind: 'node', id: target.nodes[0].id });
    }
  };

  const handleInspect = (selection: InspectorSelection, targetScreen?: ScreenId) => {
    setInspector(selection);
    setDrawerOpen(true);
    if (targetScreen) {
      setActiveScreen(targetScreen);
    }
  };

  const handleChangeTimeWindow = (tw: TimeWindow) => {
    setTimeWindow(tw);
    updateActiveCluster((c) => ({
      ...c,
      telemetrySeries: generateWindowSeries(c.telemetrySeries, tw),
    }));
  };

  const handleCordonToggle = (nodeId: string) => {
    let newStatus = HealthStatus.CORDONED;
    const nowIso = new Date().toISOString();
    const shortTime = nowIso.slice(11, 19);

    updateActiveCluster((c) => {
      const targetNode = c.nodes.find((n) => n.id === nodeId);
      const nextNodes = c.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const next =
          n.status === HealthStatus.CORDONED
            ? HealthStatus.HEALTHY
            : HealthStatus.CORDONED;
        newStatus = next;
        return {
          ...n,
          status: next,
          events: [
            {
              id: `ev-${Date.now()}`,
              time: shortTime,
              type: next === HealthStatus.CORDONED ? ('Warning' as const) : ('Normal' as const),
              reason: next === HealthStatus.CORDONED ? 'NodeCordoned' : 'NodeSchedulable',
              message:
                next === HealthStatus.CORDONED
                  ? 'SchedulingDisabled taint applied by operator'
                  : 'Node marked schedulable by operator',
            },
            ...n.events,
          ].slice(0, 12),
        };
      });

      return {
        ...c,
        nodes: nextNodes,
        logs: [
          {
            id: `log-cordon-${Date.now()}`,
            timestamp: nowIso,
            level: newStatus === HealthStatus.CORDONED ? LogLevel.WARN : LogLevel.INFO,
            service: 'kube-scheduler',
            pod: 'kube-scheduler-control-plane',
            nodeHostname: targetNode?.hostname || nodeId,
            traceId: `tr-${Math.random().toString(16).slice(2, 10)}`,
            message: `node ${targetNode?.ip || nodeId} state changed to ${newStatus}`,
          },
          ...c.logs,
        ].slice(0, 120),
      };
    });

    notify(
      newStatus === HealthStatus.CORDONED
        ? 'Node cordoned — scheduling disabled'
        : 'Node uncordoned — scheduling resumed'
    );
  };

  const handleBatchCordon = (nodeIds: string[], cordon: boolean) => {
    const nowIso = new Date().toISOString();
    const shortTime = nowIso.slice(11, 19);

    updateActiveCluster((c) => ({
      ...c,
      nodes: c.nodes.map((n) =>
        nodeIds.includes(n.id)
          ? {
              ...n,
              status: cordon ? HealthStatus.CORDONED : HealthStatus.HEALTHY,
              events: [
                {
                  id: `ev-${Date.now()}-${n.id}`,
                  time: shortTime,
                  type: cordon ? ('Warning' as const) : ('Normal' as const),
                  reason: cordon ? 'NodeCordoned' : 'NodeSchedulable',
                  message: `Batch ${cordon ? 'cordon' : 'uncordon'} applied`,
                },
                ...n.events,
              ].slice(0, 12),
            }
          : n
      ),
    }));
    notify(
      `${cordon ? 'Cordoned' : 'Uncordoned'} ${nodeIds.length} node${
        nodeIds.length > 1 ? 's' : ''
      }`
    );
  };

  const handleDrainNode = (nodeId: string) => {
    const targetNode = activeCluster.nodes.find((n) => n.id === nodeId);
    const fallbackNode = activeCluster.nodes.find(
      (n) => n.id !== nodeId && n.status === HealthStatus.HEALTHY
    );
    const nowIso = new Date().toISOString();
    const shortTime = nowIso.slice(11, 19);

    updateActiveCluster((c) => {
      const evictedCount = c.pods.filter((p) => p.nodeId === nodeId).length;
      const nextPods = fallbackNode
        ? c.pods.map((p) =>
            p.nodeId === nodeId ? { ...p, nodeId: fallbackNode.id } : p
          )
        : c.pods.filter((p) => p.nodeId !== nodeId);

      return {
        ...c,
        nodes: c.nodes.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              status: HealthStatus.CORDONED,
              podCount: 0,
              events: [
                {
                  id: `ev-drain-${Date.now()}`,
                  time: shortTime,
                  type: 'Warning' as const,
                  reason: 'NodeDrained',
                  message: `Evicted ${evictedCount} workload(s) to healthy peers`,
                },
                ...n.events,
              ].slice(0, 12),
            };
          }
          if (fallbackNode && n.id === fallbackNode.id) {
            return { ...n, podCount: n.podCount + evictedCount };
          }
          return n;
        }),
        pods: nextPods,
        logs: [
          {
            id: `log-drain-${Date.now()}`,
            timestamp: nowIso,
            level: LogLevel.WARN,
            service: 'kube-controller-manager',
            pod: 'eviction-controller',
            nodeHostname: targetNode?.hostname || nodeId,
            traceId: `tr-${Math.random().toString(16).slice(2, 10)}`,
            message: `drained node ${targetNode?.ip || nodeId}; migrated ${evictedCount} pods`,
          },
          ...c.logs,
        ].slice(0, 120),
      };
    });

    notify(
      `Drained ${targetNode?.ip || nodeId}${
        fallbackNode ? ` — pods evicted to ${fallbackNode.ip}` : ''
      }`
    );
  };

  const handleRestartPod = (podId: string) => {
    const nowIso = new Date().toISOString();
    const shortTime = nowIso.slice(11, 19);

    updateActiveCluster((c) => {
      const targetPod = c.pods.find((p) => p.id === podId);
      const nextPods = c.pods.map((p) =>
        p.id === podId
          ? {
              ...p,
              status: HealthStatus.HEALTHY,
              restarts: p.restarts + 1,
              age: '4s',
            }
          : p
      );

      const nextNodes = c.nodes.map((n) => {
        if (!targetPod || n.id !== targetPod.nodeId) return n;
        const stillHasCrashed = nextPods.some(
          (p) => p.nodeId === n.id && p.status === HealthStatus.CRASHED
        );
        return {
          ...n,
          status:
            !stillHasCrashed && n.status === HealthStatus.CRASHED
              ? HealthStatus.HEALTHY
              : n.status,
          cpuPercent:
            !stillHasCrashed && n.status === HealthStatus.CRASHED
              ? 48.5
              : n.cpuPercent,
          events: [
            {
              id: `ev-restart-${Date.now()}`,
              time: shortTime,
              type: 'Normal' as const,
              reason: 'Started',
              message: `Restarted container in pod ${targetPod.name}`,
            },
            ...n.events,
          ].slice(0, 12),
        };
      });

      return {
        ...c,
        pods: nextPods,
        nodes: nextNodes,
        logs: [
          {
            id: `log-restart-${Date.now()}`,
            timestamp: nowIso,
            level: LogLevel.INFO,
            service: targetPod?.name.split('-').slice(0, 2).join('-') || 'kubelet',
            pod: targetPod?.name || podId,
            nodeHostname:
              c.nodes.find((n) => n.id === targetPod?.nodeId)?.hostname || 'worker',
            traceId: `tr-${Math.random().toString(16).slice(2, 10)}`,
            message: `pod ${targetPod?.name} container restarted cleanly -> status=HEALTHY`,
          },
          ...c.logs,
        ].slice(0, 120),
      };
    });
    notify('Pod rolling restart triggered — container status HEALTHY');
  };

  const handleDeployPod = (spec: {
    name: string;
    namespace: string;
    image: string;
    nodeId: string;
    cpuLimitMillicores: number;
    memoryLimitMiB: number;
  }) => {
    const newPodId = `pod-${Date.now()}`;
    const randomOctet = Math.floor(20 + Math.random() * 200);
    const nowIso = new Date().toISOString();
    const shortTime = nowIso.slice(11, 19);

    updateActiveCluster((c) => {
      const targetNode = c.nodes.find((n) => n.id === spec.nodeId);
      return {
        ...c,
        pods: [
          {
            id: newPodId,
            name: spec.name,
            namespace: spec.namespace,
            nodeId: spec.nodeId,
            status: HealthStatus.HEALTHY,
            restarts: 0,
            cpuMillicores: Math.round(spec.cpuLimitMillicores * 0.25),
            cpuLimitMillicores: spec.cpuLimitMillicores,
            memoryMiB: Math.round(spec.memoryLimitMiB * 0.3),
            memoryLimitMiB: spec.memoryLimitMiB,
            ip: `10.244.1.${randomOctet}`,
            image: spec.image,
            sha256: `sha256:${Math.random().toString(16).slice(2, 18)}`,
            age: '4s',
          },
          ...c.pods,
        ],
        nodes: c.nodes.map((n) =>
          n.id === spec.nodeId
            ? {
                ...n,
                podCount: n.podCount + 1,
                events: [
                  {
                    id: `ev-deploy-${Date.now()}`,
                    time: shortTime,
                    type: 'Normal' as const,
                    reason: 'Scheduled',
                    message: `Successfully assigned ${spec.namespace}/${spec.name} (${spec.image})`,
                  },
                  ...n.events,
                ].slice(0, 12),
              }
            : n
        ),
        logs: [
          {
            id: `log-deploy-${Date.now()}`,
            timestamp: nowIso,
            level: LogLevel.INFO,
            service: spec.name.split('-').slice(0, 2).join('-'),
            pod: spec.name,
            nodeHostname: targetNode?.hostname || 'worker',
            traceId: `tr-${Math.random().toString(16).slice(2, 10)}`,
            message: `deployed manifest image=${spec.image} cpu=${spec.cpuLimitMillicores}m mem=${spec.memoryLimitMiB}Mi`,
          },
          ...c.logs,
        ].slice(0, 120),
      };
    });
    setInspector({ kind: 'pod', id: newPodId });
    setDrawerOpen(true);
    setActiveScreen(ScreenId.NODES);
    notify(`Manifest applied: ${spec.name} scheduled`);
  };

  const handleAcknowledgeIncident = (incidentId: string) => {
    const ts = new Date().toISOString().slice(11, 19);
    updateActiveCluster((c) => ({
      ...c,
      incidents: c.incidents.map((inc) =>
        inc.id === incidentId
          ? {
              ...inc,
              acknowledged: true,
              timeline: [
                ...inc.timeline,
                { time: ts, actor: 'sre-operator', note: 'Incident acknowledged via console' },
              ],
            }
          : inc
      ),
    }));
    notify(`${incidentId} acknowledged`);
  };

  const handleResolveIncident = (incidentId: string) => {
    const nowIso = new Date().toISOString();
    const ts = nowIso.slice(11, 19);
    updateActiveCluster((c) => ({
      ...c,
      incidents: c.incidents.map((inc) =>
        inc.id === incidentId
          ? {
              ...inc,
              acknowledged: true,
              severity: IncidentSeverity.RESOLVED,
              timeline: [
                ...inc.timeline,
                { time: ts, actor: 'sre-operator', note: 'Marked resolved after verification' },
              ],
            }
          : inc
      ),
      logs: [
        {
          id: `log-resolve-${Date.now()}`,
          timestamp: nowIso,
          level: LogLevel.INFO,
          service: 'alertmanager',
          pod: 'alertmanager-0',
          nodeHostname: c.nodes[0]?.hostname || 'control-plane',
          traceId: `tr-${Math.random().toString(16).slice(2, 10)}`,
          message: `incident ${incidentId} resolved by operator`,
        },
        ...c.logs,
      ].slice(0, 120),
    }));
    notify(`${incidentId} marked RESOLVED`);
  };

  const handleToggleCircuitBreaker = (routeId: string) => {
    const nowIso = new Date().toISOString();
    updateActiveCluster((c) => {
      const targetRoute = c.ingressRoutes.find((r) => r.id === routeId);
      const nextOpen = !targetRoute?.circuitBreakerOpen;
      return {
        ...c,
        ingressRoutes: c.ingressRoutes.map((r) =>
          r.id === routeId
            ? {
                ...r,
                circuitBreakerOpen: nextOpen,
                status: nextOpen ? HealthStatus.DEGRADED : HealthStatus.HEALTHY,
              }
            : r
        ),
        logs: [
          {
            id: `log-cb-${Date.now()}`,
            timestamp: nowIso,
            level: nextOpen ? LogLevel.WARN : LogLevel.INFO,
            service: 'envoy-gateway',
            pod: 'envoy-ingress-mesh',
            nodeHostname: c.nodes[0]?.hostname || 'edge-01',
            traceId: `tr-${Math.random().toString(16).slice(2, 10)}`,
            message: `circuit breaker ${nextOpen ? 'OPENED' : 'CLOSED'} for route ${
              targetRoute?.host || routeId
            }${targetRoute?.path || ''}`,
          },
          ...c.logs,
        ].slice(0, 120),
      };
    });
    notify('Envoy circuit breaker state updated');
  };

  const handleUpdateRateLimit = (routeId: string, rateLimitRpm: number) => {
    updateActiveCluster((c) => ({
      ...c,
      ingressRoutes: c.ingressRoutes.map((r) =>
        r.id === routeId ? { ...r, rateLimitRpm } : r
      ),
    }));
  };

  const handleToggleRule = (ruleId: string) => {
    updateActiveCluster((c) => ({
      ...c,
      alertRules: c.alertRules.map((r) =>
        r.id === ruleId ? { ...r, enabled: !r.enabled } : r
      ),
    }));
  };

  const handleUpdateRuleThreshold = (ruleId: string, threshold: number) => {
    updateActiveCluster((c) => ({
      ...c,
      alertRules: c.alertRules.map((r) =>
        r.id === ruleId ? { ...r, threshold } : r
      ),
    }));
  };

  const handleJumpToLogs = (filterTerm: string) => {
    setLogSearchPrefill(filterTerm);
    setActiveScreen(ScreenId.LOGS);
  };

  const handleClearLogs = () => {
    updateActiveCluster((c) => ({ ...c, logs: [] }));
    notify('Log ring buffer cleared');
  };

  const handleResetWorkspace = () => {
    localStorage.removeItem(STORAGE_KEY);
    setClusters(INITIAL_CLUSTERS);
    setActiveClusterId(INITIAL_CLUSTERS[0].id);
    setInspector({ kind: 'node', id: INITIAL_CLUSTERS[0].nodes[1].id });
    setTimeWindow('15m');
    notify('Workspace restored to default cluster baseline');
  };

  const renderScreen = () => {
    switch (activeScreen) {
      case ScreenId.OVERVIEW:
        return (
          <OverviewScreen
            cluster={activeCluster}
            timeWindow={timeWindow}
            onChangeTimeWindow={handleChangeTimeWindow}
            selectedInspector={inspector}
            onInspect={(sel) => handleInspect(sel)}
            onNavigateScreen={setActiveScreen}
            onRefreshMetrics={() => {
              sampleTelemetryTick(activeClusterId);
              notify('Sampled latest node & ingress telemetry');
            }}
          />
        );
      case ScreenId.NODES:
        return (
          <NodesScreen
            cluster={activeCluster}
            selectedInspector={inspector}
            onInspect={(sel) => handleInspect(sel)}
            onBatchCordon={handleBatchCordon}
            onDrainNode={handleDrainNode}
            onRestartPod={handleRestartPod}
          />
        );
      case ScreenId.LOGS:
        return (
          <LogsScreen
            key={`${activeCluster.id}-${logSearchPrefill}`}
            cluster={activeCluster}
            initialFilter={logSearchPrefill}
            onClearLogs={handleClearLogs}
          />
        );
      case ScreenId.NETWORK:
        return (
          <NetworkScreen
            cluster={activeCluster}
            selectedInspector={inspector}
            onInspect={(sel) => handleInspect(sel)}
            onToggleCircuitBreaker={handleToggleCircuitBreaker}
            onUpdateRateLimit={handleUpdateRateLimit}
          />
        );
      case ScreenId.INCIDENTS:
        return (
          <IncidentsScreen
            cluster={activeCluster}
            selectedInspector={inspector}
            onInspect={(sel) => handleInspect(sel)}
            onAcknowledgeIncident={handleAcknowledgeIncident}
            onResolveIncident={handleResolveIncident}
            onToggleRule={handleToggleRule}
            onUpdateRuleThreshold={handleUpdateRuleThreshold}
          />
        );
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex obsidian-grid-floor text-[#dfe2ee]">
      {/* Left Collapsible Navigation Rail */}
      <SidebarRail
        activeScreen={activeScreen}
        onSelectScreen={(s) => {
          if (s !== ScreenId.LOGS) setLogSearchPrefill('');
          setActiveScreen(s);
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
        clusters={clusters}
        activeClusterId={activeClusterId}
        onSelectCluster={handleSelectCluster}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      {/* Center Header + Main Viewport */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <TopBar
          cluster={activeCluster}
          activeScreen={activeScreen}
          isLive={isLive}
          onToggleLive={() => setIsLive((p) => !p)}
          onOpenCommandPalette={() => setCommandOpen(true)}
          onOpenDeployModal={() => setDeployModalOpen(true)}
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((p) => !p)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        <div className="flex-1 min-h-0 flex overflow-hidden">
          <main className="flex-1 min-w-0 overflow-y-auto micro-scroll p-4 lg:p-6">
            <div className="max-w-[1280px] mx-auto">{renderScreen()}</div>
          </main>

          {/* Persistent 360px Contextual Telemetry Drawer */}
          <TelemetryDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            cluster={activeCluster}
            selection={inspector}
            onCordonToggle={handleCordonToggle}
            onDrainNode={handleDrainNode}
            onRestartPod={handleRestartPod}
            onAcknowledgeIncident={handleAcknowledgeIncident}
            onResolveIncident={handleResolveIncident}
            onJumpToLogs={handleJumpToLogs}
          />
        </div>
      </div>

      {/* Command Palette & Deploy Modal */}
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        clusters={clusters}
        activeCluster={activeCluster}
        onSelectScreen={setActiveScreen}
        onSelectCluster={handleSelectCluster}
        onInspect={handleInspect}
        onResetWorkspace={handleResetWorkspace}
      />

      <ManifestModal
        open={deployModalOpen}
        onClose={() => setDeployModalOpen(false)}
        cluster={activeCluster}
        onDeployPod={handleDeployPod}
      />

      {/* Action Confirmation Toast */}
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 glass-flyout rounded px-4 py-2 font-mono text-xs text-[#4cd7f6] glow-cyan-focus shadow-xl">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
