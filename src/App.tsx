import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiClient } from './api/client.ts';
import { AuditScreen } from './components/AuditScreen.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { ConfirmActionModal, type ConfirmActionRequest } from './components/ConfirmActionModal.tsx';
import { IncidentsScreen } from './components/IncidentsScreen.tsx';
import { LogsScreen } from './components/LogsScreen.tsx';
import { NetworkScreen } from './components/NetworkScreen.tsx';
import { NodesScreen } from './components/NodesScreen.tsx';
import { OverviewScreen } from './components/OverviewScreen.tsx';
import { ResourceManifestModal } from './components/ResourceManifestModal.tsx';
import { SidebarRail } from './components/SidebarRail.tsx';
import { TelemetryDrawer } from './components/TelemetryDrawer.tsx';
import { TopBar } from './components/TopBar.tsx';
import type {
  AuthSession,
  ClusterSnapshot,
  InspectorSelection,
  ScreenId,
  TimeWindow,
} from './shared/types.ts';

const EMPTY_SESSION: AuthSession = {
  authenticated: false,
  authMode: 'optional',
  role: 'viewer',
  actorId: 'anonymous',
  podExecEnabled: false,
  demoModeEnabled: false,
};

const EMPTY_SNAPSHOT: ClusterSnapshot = {
  sourceMode: 'disconnected',
  collectedAt: new Date(0).toISOString(),
  cluster: {
    id: 'disconnected',
    name: 'unconnected-cluster',
    contextName: '',
    serverDisplay: 'none',
    k8sVersion: 'unknown',
    connectionMode: 'disabled',
    kubernetesStatus: 'disconnected',
    prometheusStatus: 'disconnected',
  },
  availableClusters: [
    {
      id: 'disconnected',
      name: 'unconnected-cluster',
      contextName: '',
      serverDisplay: 'none',
      k8sVersion: 'unknown',
      connectionMode: 'disabled',
      kubernetesStatus: 'disconnected',
      prometheusStatus: 'disconnected',
    },
  ],
  rbac: {
    canListNodes: false,
    canPatchNodes: false,
    canEvictPods: false,
    canDeletePods: false,
    canScaleDeployments: false,
    canRestartDeployments: false,
    canReadLogs: false,
    canExecPods: false,
  },
  namespaces: [],
  nodes: [],
  pods: [],
  deployments: [],
  statefulSets: [],
  daemonSets: [],
  services: [],
  ingresses: [],
  events: [],
  pdbs: [],
  telemetry: {
    status: 'disconnected',
    queriedAt: new Date(0).toISOString(),
    series: [],
    current: {
      cpuPercent: null,
      memoryPercent: null,
      diskPercent: null,
      networkMbps: null,
      rps: null,
      errorRatePercent: null,
      p99LatencyMs: null,
    },
  },
  incidents: [],
  alertRules: [],
};

export default function App() {
  const [session, setSession] = useState<AuthSession>(EMPTY_SESSION);
  const [snapshot, setSnapshot] = useState<ClusterSnapshot>(EMPTY_SNAPSHOT);
  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const [contextName, setContextName] = useState<string | undefined>(undefined);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('15m');
  const [activeScreen, setActiveScreen] = useState<ScreenId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true);
  const [inspector, setInspector] = useState<InspectorSelection | null>(null);
  const [commandOpen, setCommandOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmActionRequest | null>(null);
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [logTarget, setLogTarget] = useState<{ namespace: string; pod: string } | null>(null);
  const [auditRefreshKey, setAuditRefreshKey] = useState<number>(0);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);
  const [manifestModal, setManifestModal] = useState<{
    open: boolean;
    title: string;
    yaml: string | null;
    loading: boolean;
    error: string | null;
  }>({ open: false, title: '', yaml: null, loading: false, error: null });

  const notify = (text: string, isError = false) => {
    setToast({ text, isError });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadSessionAndSnapshot = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setRefreshing(true);
      try {
        const currentSession = await apiClient.getSession();
        setSession(currentSession);

        const nextSnapshot = await apiClient.getSnapshot({
          mode,
          window: timeWindow,
          context: mode === 'live' ? contextName : undefined,
        });
        setSnapshot(nextSnapshot);
        if (!inspector && nextSnapshot.nodes.length > 0) {
          setInspector({ kind: 'node', id: nextSnapshot.nodes[0].id });
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          if (!opts?.silent) {
            setAuthModalOpen(true);
            notify('Authentication required to query cluster telemetry', true);
          }
        } else if (!opts?.silent) {
          notify(err instanceof Error ? err.message : 'Failed to refresh cluster state', true);
        }
      } finally {
        if (!opts?.silent) setRefreshing(false);
      }
    },
    [mode, timeWindow, contextName, inspector]
  );

  useEffect(() => {
    void loadSessionAndSnapshot();
  }, [loadSessionAndSnapshot]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadSessionAndSnapshot({ silent: true });
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, [loadSessionAndSnapshot]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setCommandOpen(false);
        setAuthModalOpen(false);
        setManifestModal((prev) => ({ ...prev, open: false }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const executeConfirmedAction = async () => {
    if (!confirmRequest) return;
    setActionBusy(true);
    try {
      await confirmRequest.onConfirm();
      setConfirmRequest(null);
      setAuditRefreshKey((k) => k + 1);
      await loadSessionAndSnapshot({ silent: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthModalOpen(true);
      }
      notify(err instanceof Error ? err.message : 'Cluster operation failed', true);
    } finally {
      setActionBusy(false);
    }
  };

  const requestCordonNode = (nodeName: string, unschedulable: boolean) => {
    setConfirmRequest({
      title: unschedulable ? 'Cordon Kubernetes Node' : 'Uncordon Kubernetes Node',
      target: `node/${nodeName}`,
      destructive: unschedulable,
      confirmLabel: unschedulable ? 'Cordon Node' : 'Uncordon Node',
      description: unschedulable
        ? 'Marks spec.unschedulable=true on the live Kubernetes node. Existing pods remain running; new pods will not schedule here.'
        : 'Clears spec.unschedulable on the live Kubernetes node so the scheduler can assign pods again.',
      onConfirm: async () => {
        if (unschedulable) {
          await apiClient.cordonNode(nodeName, snapshot.cluster.contextName);
          notify(`Node ${nodeName} cordoned`);
        } else {
          await apiClient.uncordonNode(nodeName, snapshot.cluster.contextName);
          notify(`Node ${nodeName} uncordoned`);
        }
      },
    });
  };

  const requestDrainNode = (nodeName: string) => {
    setConfirmRequest({
      title: 'Drain Kubernetes Node',
      target: `node/${nodeName}`,
      destructive: true,
      confirmLabel: 'Execute Drain',
      description:
        'Cordons the node, verifies PodDisruptionBudgets and remaining cluster pod capacity, skips DaemonSet/mirror pods, and issues real Eviction API requests.',
      onConfirm: async () => {
        const report = await apiClient.drainNode(nodeName, snapshot.cluster.contextName);
        notify(
          `Drained ${report.nodeName}: ${report.evicted.length} evicted, ${report.skipped.length} skipped, ${report.failed.length} failed`,
          report.failed.length > 0
        );
      },
    });
  };

  const requestDeletePod = (namespace: string, podName: string) => {
    setConfirmRequest({
      title: 'Delete Kubernetes Pod',
      target: `pod/${namespace}/${podName}`,
      destructive: true,
      confirmLabel: 'Delete Pod',
      description:
        'Issues a real Kubernetes pod deletion request. Controller-managed pods (Deployments/StatefulSets) will be recreated by their controller.',
      onConfirm: async () => {
        await apiClient.deletePod(namespace, podName, snapshot.cluster.contextName);
        notify(`Deleted pod ${namespace}/${podName}`);
      },
    });
  };

  const requestRestartDeployment = (namespace: string, name: string) => {
    setConfirmRequest({
      title: 'Trigger Deployment Rollout Restart',
      target: `deployment/${namespace}/${name}`,
      confirmLabel: 'Rollout Restart',
      description:
        'Patches pod template annotation kubectl.kubernetes.io/restartedAt on the Deployment to trigger a zero-downtime rolling replacement.',
      onConfirm: async () => {
        await apiClient.restartDeployment(namespace, name, snapshot.cluster.contextName);
        notify(`Rollout restart triggered for ${namespace}/${name}`);
      },
    });
  };

  const requestScaleDeployment = (namespace: string, name: string, replicas: number) => {
    setConfirmRequest({
      title: 'Scale Deployment Replicas',
      target: `deployment/${namespace}/${name} -> ${replicas} replicas`,
      destructive: replicas === 0,
      confirmLabel: `Scale to ${replicas}`,
      description: `Updates spec.replicas to ${replicas} via the Kubernetes AppsV1 API.`,
      onConfirm: async () => {
        await apiClient.scaleDeployment(namespace, name, replicas, snapshot.cluster.contextName);
        notify(`Scaled ${namespace}/${name} to ${replicas} replicas`);
      },
    });
  };

  const handleAcknowledgeIncident = async (id: string) => {
    try {
      await apiClient.acknowledgeIncident(id);
      setAuditRefreshKey((k) => k + 1);
      await loadSessionAndSnapshot({ silent: true });
      notify(`Incident ${id} acknowledged`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setAuthModalOpen(true);
      notify(err instanceof Error ? err.message : 'Unable to acknowledge incident', true);
    }
  };

  const handleResolveIncident = async (id: string) => {
    try {
      await apiClient.resolveIncident(id);
      setAuditRefreshKey((k) => k + 1);
      await loadSessionAndSnapshot({ silent: true });
      notify(`Incident ${id} marked triaged locally`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setAuthModalOpen(true);
      notify(err instanceof Error ? err.message : 'Unable to mark incident triaged', true);
    }
  };

  const handleViewManifest = async (
    kind: 'node' | 'pod' | 'deployment' | 'service',
    name: string,
    namespace?: string
  ) => {
    const title = namespace ? `${kind}/${namespace}/${name}` : `${kind}/${name}`;
    setManifestModal({ open: true, title, yaml: null, loading: true, error: null });
    try {
      const res = await apiClient.getManifest({
        kind,
        name,
        namespace,
        context: snapshot.cluster.contextName,
      });
      setManifestModal({ open: true, title, yaml: res.yaml, loading: false, error: null });
    } catch (err) {
      setManifestModal({
        open: true,
        title,
        yaml: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load Kubernetes manifest',
      });
    }
  };

  const handleInspect = (selection: InspectorSelection, targetScreen?: ScreenId) => {
    setInspector(selection);
    setDrawerOpen(true);
    if (targetScreen) setActiveScreen(targetScreen);
  };

  const openIncidentsCount = snapshot.incidents.filter((i) => i.severity !== 'RESOLVED').length;

  const renderScreen = () => {
    switch (activeScreen) {
      case 'overview':
        return (
          <OverviewScreen
            snapshot={snapshot}
            timeWindow={timeWindow}
            onChangeTimeWindow={setTimeWindow}
            selectedInspector={inspector}
            onInspect={(sel) => handleInspect(sel)}
            onNavigateScreen={setActiveScreen}
            onEnableDemoMode={() => setMode('demo')}
            demoModeEnabled={session.demoModeEnabled}
          />
        );
      case 'nodes':
        return (
          <NodesScreen
            snapshot={snapshot}
            session={session}
            selectedInspector={inspector}
            onInspect={(sel) => handleInspect(sel)}
            onCordonNode={requestCordonNode}
            onDrainNode={requestDrainNode}
            onDeletePod={requestDeletePod}
            onRestartDeployment={requestRestartDeployment}
            onScaleDeployment={requestScaleDeployment}
          />
        );
      case 'logs':
        return <LogsScreen snapshot={snapshot} initialTarget={logTarget} />;
      case 'network':
        return (
          <NetworkScreen
            snapshot={snapshot}
            selectedInspector={inspector}
            onInspect={(sel) => handleInspect(sel)}
          />
        );
      case 'incidents':
        return (
          <IncidentsScreen
            snapshot={snapshot}
            session={session}
            selectedInspector={inspector}
            onInspect={(sel) => handleInspect(sel)}
            onAcknowledgeIncident={(id) => void handleAcknowledgeIncident(id)}
            onResolveIncident={(id) => void handleResolveIncident(id)}
          />
        );
      case 'audit':
        return <AuditScreen refreshKey={auditRefreshKey} />;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex obsidian-grid-floor text-[#dfe2ee]">
      <SidebarRail
        activeScreen={activeScreen}
        onSelectScreen={(s) => {
          if (s !== 'logs') setLogTarget(null);
          setActiveScreen(s);
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
        clusters={snapshot.availableClusters}
        activeCluster={snapshot.cluster}
        onSelectContext={(ctx) => {
          if (mode === 'demo') setMode('live');
          setContextName(ctx);
          setInspector(null);
        }}
        openIncidentsCount={openIncidentsCount}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <TopBar
          cluster={snapshot.cluster}
          sourceMode={snapshot.sourceMode}
          activeScreen={activeScreen}
          session={session}
          mode={mode}
          onToggleMode={() => {
            setMode((prev) => (prev === 'live' ? 'demo' : 'live'));
            setInspector(null);
          }}
          onRefresh={() => void loadSessionAndSnapshot()}
          refreshing={refreshing}
          onOpenCommandPalette={() => setCommandOpen(true)}
          onOpenAuthModal={() => setAuthModalOpen(true)}
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((p) => !p)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        {snapshot.sourceMode === 'demo' && (
          <div className="shrink-0 bg-amber-500/15 border-b border-amber-500/40 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-amber-200">
            <span>
              DEMO MODE ACTIVE — Displaying synthetic demonstration cluster data. All cluster
              mutations are disabled.
            </span>
            <button
              onClick={() => {
                setMode('live');
                setInspector(null);
              }}
              className="underline text-amber-100 hover:text-white"
            >
              Return to Live Infrastructure
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 flex overflow-hidden">
          <main className="flex-1 min-w-0 overflow-y-auto micro-scroll p-4 lg:p-6">
            <div className="max-w-[1280px] mx-auto">{renderScreen()}</div>
          </main>

          <TelemetryDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            snapshot={snapshot}
            session={session}
            selection={inspector}
            onCordonNode={requestCordonNode}
            onDrainNode={requestDrainNode}
            onDeletePod={requestDeletePod}
            onRestartDeployment={requestRestartDeployment}
            onViewManifest={(kind, name, ns) => void handleViewManifest(kind, name, ns)}
            onJumpToLogs={(ns, podName) => {
              setLogTarget({ namespace: ns, pod: podName });
              setActiveScreen('logs');
            }}
            onAcknowledgeIncident={(id) => void handleAcknowledgeIncident(id)}
            onResolveIncident={(id) => void handleResolveIncident(id)}
          />
        </div>
      </div>

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        snapshot={snapshot}
        onSelectScreen={setActiveScreen}
        onSelectContext={(ctx) => {
          if (mode === 'demo') setMode('live');
          setContextName(ctx);
          setInspector(null);
        }}
        onInspect={handleInspect}
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        session={session}
        onLogin={async (token) => {
          const next = await apiClient.login(token);
          setSession(next);
          setAuditRefreshKey((k) => k + 1);
          notify(`Authenticated as ${next.role}`);
          await loadSessionAndSnapshot({ silent: true });
        }}
        onLoginCredentials={async (username, password) => {
          const next = await apiClient.loginWithPassword(username, password);
          setSession(next);
          setAuditRefreshKey((k) => k + 1);
          notify(`Signed in as ${next.actorId} (${next.role})`);
          await loadSessionAndSnapshot({ silent: true });
        }}
        onChangePassword={async (currentPassword, newPassword) => {
          await apiClient.changePassword(currentPassword, newPassword);
          setAuditRefreshKey((k) => k + 1);
          notify('Administrator password updated');
        }}
        onLogout={async () => {
          await apiClient.logout();
          if (session.authMode === 'token') {
            setSnapshot(EMPTY_SNAPSHOT);
          }
          setAuditRefreshKey((k) => k + 1);
          notify('Signed out');
          await loadSessionAndSnapshot({ silent: true });
        }}
      />

      <ConfirmActionModal
        request={confirmRequest}
        busy={actionBusy}
        onCancel={() => !actionBusy && setConfirmRequest(null)}
        onExecute={() => void executeConfirmedAction()}
      />

      <ResourceManifestModal
        open={manifestModal.open}
        title={manifestModal.title}
        yaml={manifestModal.yaml}
        loading={manifestModal.loading}
        error={manifestModal.error}
        onClose={() => setManifestModal((p) => ({ ...p, open: false }))}
      />

      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 glass-flyout rounded px-4 py-2 font-mono text-xs shadow-xl ${
            toast.isError
              ? 'border-red-500/50 text-red-300 glow-critical'
              : 'text-[#4cd7f6] glow-cyan-focus'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
