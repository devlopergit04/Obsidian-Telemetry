// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthModal } from '../src/components/AuthModal.tsx';
import { ConfirmActionModal } from '../src/components/ConfirmActionModal.tsx';
import { NodesScreen } from '../src/components/NodesScreen.tsx';
import { OverviewScreen } from '../src/components/OverviewScreen.tsx';
import { StatusBadge } from '../src/components/StatusBadge.tsx';
import { getDemoSnapshot } from '../src/server/services/demoProvider.ts';
import type { AuthSession, ClusterSnapshot } from '../src/shared/types.ts';

afterEach(() => {
  cleanup();
});

const VIEWER_SESSION: AuthSession = {
  authenticated: false,
  authMode: 'optional',
  role: 'viewer',
  actorId: 'anonymous-viewer',
  podExecEnabled: false,
  demoModeEnabled: true,
};

function makeDisconnectedSnapshot(): ClusterSnapshot {
  const demo = getDemoSnapshot('15m');
  return {
    ...demo,
    sourceMode: 'disconnected',
    cluster: {
      ...demo.cluster,
      id: 'disconnected',
      name: 'unconnected-cluster',
      connectionMode: 'disabled',
      kubernetesStatus: 'disconnected',
      prometheusStatus: 'disconnected',
      kubernetesError: 'No kubeconfig found.',
    },
    nodes: [],
    pods: [],
    deployments: [],
    statefulSets: [],
    daemonSets: [],
    services: [],
    ingresses: [],
    events: [],
    pdbs: [],
    incidents: [],
    alertRules: [],
    telemetry: {
      status: 'disconnected',
      queriedAt: new Date().toISOString(),
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
  };
}

describe('Frontend Component Verification', () => {
  it('renders accessible StatusBadge variants cleanly', () => {
    render(
      <div>
        <StatusBadge status="HEALTHY" />
        <StatusBadge status="CRASHED" />
        <StatusBadge status="CRITICAL" />
      </div>
    );
    expect(screen.getByText('HEALTHY')).toBeTruthy();
    expect(screen.getByText('CRASHED')).toBeTruthy();
    expect(screen.getByText('CRITICAL')).toBeTruthy();
  });

  it('requires explicit confirmation before executing ConfirmActionModal', () => {
    const onCancel = vi.fn();
    const onExecute = vi.fn();

    render(
      <ConfirmActionModal
        request={{
          title: 'Cordon Node',
          description: 'Disable pod scheduling',
          target: 'node/worker-01',
          confirmLabel: 'Confirm Cordon',
          onConfirm: async () => {},
        }}
        busy={false}
        onCancel={onCancel}
        onExecute={onExecute}
      />
    );

    expect(screen.getByText('node/worker-01')).toBeTruthy();
    fireEvent.click(screen.getByText('Confirm Cordon'));
    expect(onExecute).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('displays explicit disconnected notice and optional Demo Sandbox CTA when unconfigured', () => {
    const onEnableDemo = vi.fn();
    render(
      <OverviewScreen
        snapshot={makeDisconnectedSnapshot()}
        timeWindow="15m"
        onChangeTimeWindow={vi.fn()}
        selectedInspector={null}
        onInspect={vi.fn()}
        onNavigateScreen={vi.fn()}
        onEnableDemoMode={onEnableDemo}
        demoModeEnabled={true}
      />
    );

    expect(screen.getByText('Cluster Infrastructure Disconnected')).toBeTruthy();
    fireEvent.click(screen.getByText('Load Demo Sandbox'));
    expect(onEnableDemo).toHaveBeenCalledTimes(1);
  });

  it('renders AuthModal with Account credentials and Bearer Token sign-in options', async () => {
    const onLoginCredentials = vi.fn().mockResolvedValue(undefined);
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthModal
        open={true}
        onClose={vi.fn()}
        session={VIEWER_SESSION}
        onLogin={onLogin}
        onLoginCredentials={onLoginCredentials}
        onChangePassword={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass-123' } });
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => expect(onLoginCredentials).toHaveBeenCalledWith('admin', 'pass-123'));

    fireEvent.click(screen.getByText('Bearer Token'));
    fireEvent.change(screen.getByLabelText('Operator / Admin Bearer Token'), {
      target: { value: 'tok-xyz' },
    });
    await waitFor(() => {
      const btn = screen.getByText('Authenticate').closest('button') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    fireEvent.click(screen.getByText('Authenticate'));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('tok-xyz'));
  });

  it('renders NodesScreen and blocks mutations for viewer role or demo mode', () => {
    const demo = getDemoSnapshot('15m');
    render(
      <NodesScreen
        snapshot={demo}
        session={VIEWER_SESSION}
        selectedInspector={null}
        onInspect={vi.fn()}
        onCordonNode={vi.fn()}
        onDrainNode={vi.fn()}
        onDeletePod={vi.fn()}
        onRestartDeployment={vi.fn()}
        onScaleDeployment={vi.fn()}
      />
    );

    expect(screen.getByText('demo-worker-01.internal')).toBeTruthy();
    expect(screen.getByText('demo-worker-02.internal')).toBeTruthy();

    const cordonButtons = screen.getAllByText('Cordon');
    for (const btn of cordonButtons) {
      expect((btn.closest('button') as HTMLButtonElement).disabled).toBe(true);
    }

    const searchInput = screen.getByPlaceholderText(
      'Filter nodes, pods, deployments, or namespaces...'
    );
    fireEvent.change(searchInput, { target: { value: 'demo-worker-02' } });
    expect(screen.queryByText('demo-worker-01.internal')).toBeNull();
    expect(screen.getByText('demo-worker-02.internal')).toBeTruthy();
  });
});
