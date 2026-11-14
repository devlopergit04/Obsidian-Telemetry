import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as k8s from '@kubernetes/client-node';
import type {
  ClusterNode,
  ClusterSummary,
  ContainerInfo,
  DaemonSetWorkload,
  DeploymentWorkload,
  DrainReport,
  HealthStatus,
  IncidentItem,
  K8sEvent,
  K8sIngress,
  K8sService,
  PodDisruptionBudgetSummary,
  PodWorkload,
  RbacCapabilities,
  StatefulSetWorkload,
} from '../../shared/types.ts';
import type { AppConfig } from '../config.ts';

export function parseCpuMillicores(raw?: string): number {
  if (!raw) return 0;
  const val = raw.trim();
  if (val.endsWith('n')) {
    const n = Number(val.slice(0, -1));
    return Number.isFinite(n) ? Math.round(n / 1_000_000) : 0;
  }
  if (val.endsWith('u')) {
    const u = Number(val.slice(0, -1));
    return Number.isFinite(u) ? Math.round(u / 1_000) : 0;
  }
  if (val.endsWith('m')) {
    const m = Number(val.slice(0, -1));
    return Number.isFinite(m) ? Math.round(m) : 0;
  }
  const cores = Number(val);
  return Number.isFinite(cores) ? Math.round(cores * 1000) : 0;
}

export function parseMemoryMiB(raw?: string): number {
  if (!raw) return 0;
  const val = raw.trim();
  const match = val.match(/^([0-9.]+)\s*(Ki|Mi|Gi|Ti|K|M|G|T)?$/i);
  if (!match) return 0;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return 0;
  const unit = match[2] || '';
  switch (unit) {
    case 'Ki':
      return Math.round(num / 1024);
    case 'Mi':
      return Math.round(num);
    case 'Gi':
      return Math.round(num * 1024);
    case 'Ti':
      return Math.round(num * 1024 * 1024);
    case 'K':
    case 'k':
      return Math.round((num * 1000) / (1024 * 1024));
    case 'M':
      return Math.round((num * 1_000_000) / (1024 * 1024));
    case 'G':
      return Math.round((num * 1_000_000_000) / (1024 * 1024));
    case 'T':
      return Math.round((num * 1_000_000_000_000) / (1024 * 1024));
    default:
      return Math.round(num / (1024 * 1024));
  }
}

export function formatAge(creationTimestamp?: Date | string): string {
  if (!creationTimestamp) return 'unknown';
  const createdMs =
    creationTimestamp instanceof Date
      ? creationTimestamp.getTime()
      : Date.parse(String(creationTimestamp));
  if (!Number.isFinite(createdMs)) return 'unknown';
  const diffSec = Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86400)}d`;
}

export function derivePodStatus(pod: k8s.V1Pod): HealthStatus {
  const phase = pod.status?.phase || 'Unknown';
  const containerStatuses = pod.status?.containerStatuses || [];
  for (const cs of containerStatuses) {
    const waitingReason = cs.state?.waiting?.reason;
    if (
      waitingReason === 'CrashLoopBackOff' ||
      waitingReason === 'ImagePullBackOff' ||
      waitingReason === 'ErrImagePull' ||
      waitingReason === 'CreateContainerConfigError'
    ) {
      return 'CRASHED';
    }
    if (cs.lastState?.terminated?.reason === 'OOMKilled' && !cs.ready) {
      return 'CRASHED';
    }
  }
  if (phase === 'Failed') return 'CRASHED';
  if (phase === 'Pending' || phase === 'Unknown') return 'DEGRADED';
  if (phase === 'Succeeded') return 'HEALTHY';
  const allReady = containerStatuses.length > 0 && containerStatuses.every((c) => c.ready);
  return allReady ? 'HEALTHY' : 'DEGRADED';
}

export function deriveNodeStatus(node: k8s.V1Node): HealthStatus {
  if (node.spec?.unschedulable) return 'CORDONED';
  const conditions = node.status?.conditions || [];
  const ready = conditions.find((c) => c.type === 'Ready');
  if (!ready || ready.status !== 'True') return 'CRASHED';
  const pressure = conditions.some(
    (c) =>
      (c.type === 'MemoryPressure' || c.type === 'DiskPressure' || c.type === 'PIDPressure') &&
      c.status === 'True'
  );
  return pressure ? 'DEGRADED' : 'HEALTHY';
}

export function sanitizeServerHost(rawUrl?: string): string {
  if (!rawUrl) return 'not-configured';
  try {
    const parsed = new URL(rawUrl);
    return parsed.host;
  } catch {
    return 'configured-cluster';
  }
}

export function labelsMatchSelector(
  podLabels: Record<string, string> | undefined,
  selector: k8s.V1LabelSelector | undefined
): boolean {
  if (!selector) return false;
  const labels = podLabels || {};
  if (selector.matchLabels) {
    for (const [k, v] of Object.entries(selector.matchLabels)) {
      if (labels[k] !== v) return false;
    }
  }
  if (selector.matchExpressions) {
    for (const expr of selector.matchExpressions) {
      const val = labels[expr.key];
      if (expr.operator === 'In' && (!val || !(expr.values || []).includes(val))) return false;
      if (expr.operator === 'NotIn' && val && (expr.values || []).includes(val)) return false;
      if (expr.operator === 'Exists' && val === undefined) return false;
      if (expr.operator === 'DoesNotExist' && val !== undefined) return false;
    }
  }
  return Boolean(selector.matchLabels || selector.matchExpressions);
}

export interface KubernetesSnapshotData {
  summary: ClusterSummary;
  availableClusters: ClusterSummary[];
  rbac: RbacCapabilities;
  namespaces: string[];
  nodes: ClusterNode[];
  pods: PodWorkload[];
  deployments: DeploymentWorkload[];
  statefulSets: StatefulSetWorkload[];
  daemonSets: DaemonSetWorkload[];
  services: K8sService[];
  ingresses: K8sIngress[];
  events: K8sEvent[];
  pdbs: PodDisruptionBudgetSummary[];
  derivedIncidents: IncidentItem[];
}

const K8S_REQUEST_TIMEOUT_MS = 10_000;

function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = K8S_REQUEST_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Kubernetes API request timed out after ${timeoutMs}ms (${label})`));
    }, timeoutMs);
    timer.unref?.();
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function sanitizeK8sError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : fallback;
  return raw.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
}

export class KubernetesService {
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  private createKubeConfig(contextOverride?: string): {
    kc: k8s.KubeConfig | null;
    mode: ClusterSummary['connectionMode'];
    error?: string;
  } {
    if (this.config.kubeMode === 'disabled') {
      return {
        kc: null,
        mode: 'disabled',
        error: 'Kubernetes integration disabled (KUBE_MODE=disabled).',
      };
    }

    const kc = new k8s.KubeConfig();

    if (
      this.config.kubeMode === 'token' ||
      (this.config.k8sApiServer && this.config.k8sBearerToken)
    ) {
      if (!this.config.k8sApiServer || !this.config.k8sBearerToken) {
        return {
          kc: null,
          mode: 'token',
          error: 'KUBE_MODE=token requires both K8S_API_SERVER and K8S_BEARER_TOKEN.',
        };
      }
      kc.loadFromOptions({
        clusters: [
          {
            name: 'configured-cluster',
            server: this.config.k8sApiServer,
            skipTLSVerify: this.config.k8sSkipTlsVerify,
          },
        ],
        users: [{ name: 'configured-user', token: this.config.k8sBearerToken }],
        contexts: [
          {
            name: 'configured-context',
            cluster: 'configured-cluster',
            user: 'configured-user',
          },
        ],
        currentContext: 'configured-context',
      });
      return { kc, mode: 'token' };
    }

    const serviceAccountPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
    if (
      this.config.kubeMode === 'incluster' ||
      (this.config.kubeMode === 'auto' && fs.existsSync(serviceAccountPath))
    ) {
      try {
        kc.loadFromCluster();
        return { kc, mode: 'incluster' };
      } catch (err) {
        if (this.config.kubeMode === 'incluster') {
          return {
            kc: null,
            mode: 'incluster',
            error:
              err instanceof Error ? err.message : 'Failed to load in-cluster service account.',
          };
        }
      }
    }

    const explicitPath = this.config.kubeconfigPath;
    const defaultPath = path.join(os.homedir(), '.kube', 'config');
    const targetPath = explicitPath || defaultPath;

    if (fs.existsSync(targetPath)) {
      try {
        kc.loadFromFile(targetPath);
        const ctx = contextOverride || this.config.kubeContext;
        if (ctx && kc.getContexts().some((c) => c.name === ctx)) {
          kc.setCurrentContext(ctx);
        }
        if (!kc.getCurrentContext()) {
          return {
            kc: null,
            mode: 'kubeconfig',
            error: `Kubeconfig loaded from ${path.basename(targetPath)}, but no current-context is selected.`,
          };
        }
        return { kc, mode: 'kubeconfig' };
      } catch (err) {
        return {
          kc: null,
          mode: 'kubeconfig',
          error: err instanceof Error ? err.message : 'Failed to parse kubeconfig file.',
        };
      }
    }

    return {
      kc: null,
      mode: 'disabled',
      error:
        'No Kubernetes cluster configured. Set KUBECONFIG_PATH, K8S_API_SERVER + K8S_BEARER_TOKEN, or run inside a Kubernetes pod.',
    };
  }

  getConnectionForExec(contextOverride?: string): k8s.KubeConfig | null {
    return this.createKubeConfig(contextOverride).kc;
  }

  private listSafeContexts(
    kc: k8s.KubeConfig | null,
    mode: ClusterSummary['connectionMode']
  ): ClusterSummary[] {
    if (!kc) return [];
    const current = kc.getCurrentContext();
    return kc.getContexts().map((ctx) => {
      const clusterObj = kc.getClusters().find((c) => c.name === ctx.cluster);
      return {
        id: ctx.name,
        name: ctx.name,
        contextName: ctx.name,
        serverDisplay: sanitizeServerHost(clusterObj?.server),
        k8sVersion: 'unknown',
        connectionMode: mode,
        kubernetesStatus: ctx.name === current ? 'connected' : 'disconnected',
        prometheusStatus: 'disconnected',
      };
    });
  }

  private async checkAccess(
    authApi: k8s.AuthorizationV1Api,
    verb: string,
    resource: string,
    group = '',
    subresource?: string
  ): Promise<boolean> {
    try {
      const res = await authApi.createSelfSubjectAccessReview({
        body: {
          apiVersion: 'authorization.k8s.io/v1',
          kind: 'SelfSubjectAccessReview',
          spec: {
            resourceAttributes: {
              verb,
              group,
              resource,
              subresource,
            },
          },
        },
      });
      return Boolean(res.status?.allowed);
    } catch {
      return false;
    }
  }

  async inspectRbac(kc: k8s.KubeConfig): Promise<RbacCapabilities> {
    const authApi = kc.makeApiClient(k8s.AuthorizationV1Api);
    const [
      canListNodes,
      canPatchNodes,
      canEvictPods,
      canDeletePods,
      canScaleDeployments,
      canRestartDeployments,
      canReadLogs,
      canExecPods,
    ] = await Promise.all([
      this.checkAccess(authApi, 'list', 'nodes'),
      this.checkAccess(authApi, 'patch', 'nodes'),
      this.checkAccess(authApi, 'create', 'pods', '', 'eviction'),
      this.checkAccess(authApi, 'delete', 'pods'),
      this.checkAccess(authApi, 'patch', 'deployments', 'apps', 'scale'),
      this.checkAccess(authApi, 'patch', 'deployments', 'apps'),
      this.checkAccess(authApi, 'get', 'pods', '', 'log'),
      this.checkAccess(authApi, 'create', 'pods', '', 'exec'),
    ]);

    return {
      canListNodes,
      canPatchNodes,
      canEvictPods,
      canDeletePods,
      canScaleDeployments,
      canRestartDeployments,
      canReadLogs,
      canExecPods: this.config.enablePodExec && canExecPods,
    };
  }

  async getSnapshot(contextOverride?: string): Promise<KubernetesSnapshotData> {
    const { kc, mode, error } = this.createKubeConfig(contextOverride);

    if (!kc) {
      const disconnectedSummary: ClusterSummary = {
        id: contextOverride || 'local-disconnected',
        name: contextOverride || 'unconfigured-cluster',
        contextName: contextOverride || 'none',
        serverDisplay: 'not-configured',
        k8sVersion: 'n/a',
        connectionMode: mode,
        kubernetesStatus: error?.includes('No Kubernetes') ? 'disconnected' : 'error',
        prometheusStatus: 'disconnected',
        kubernetesError: error,
      };
      return {
        summary: disconnectedSummary,
        availableClusters: [disconnectedSummary],
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
        derivedIncidents: [],
      };
    }

    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);
    const netApi = kc.makeApiClient(k8s.NetworkingV1Api);
    const policyApi = kc.makeApiClient(k8s.PolicyV1Api);
    const metricsClient = new k8s.Metrics(kc);
    const currentCtxName = kc.getCurrentContext();
    const currentCluster = kc.getCurrentCluster();
    const availableClusters = this.listSafeContexts(kc, mode);

    try {
      const [
        nodeList,
        podList,
        nsList,
        deployList,
        stsList,
        dsList,
        svcList,
        ingList,
        eventList,
        pdbList,
        nodeMetricsList,
        podMetricsList,
        rbac,
      ] = await withTimeout(
        Promise.all([
          coreApi.listNode(),
          coreApi.listPodForAllNamespaces(),
          coreApi.listNamespace(),
          appsApi.listDeploymentForAllNamespaces(),
          appsApi.listStatefulSetForAllNamespaces(),
          appsApi.listDaemonSetForAllNamespaces(),
          coreApi.listServiceForAllNamespaces(),
          netApi.listIngressForAllNamespaces().catch(() => ({ items: [] as k8s.V1Ingress[] })),
          coreApi.listEventForAllNamespaces().catch(() => ({ items: [] as k8s.CoreV1Event[] })),
          policyApi
            .listPodDisruptionBudgetForAllNamespaces()
            .catch(() => ({ items: [] as k8s.V1PodDisruptionBudget[] })),
          metricsClient.getNodeMetrics().catch(() => null),
          metricsClient.getPodMetrics().catch(() => null),
          this.inspectRbac(kc),
        ]),
        'cluster snapshot'
      );

      const nodeMetricMap = new Map<string, { cpuM: number; memMiB: number }>();
      for (const nm of nodeMetricsList?.items || []) {
        nodeMetricMap.set(nm.metadata.name, {
          cpuM: parseCpuMillicores(nm.usage?.cpu),
          memMiB: parseMemoryMiB(nm.usage?.memory),
        });
      }

      const podMetricMap = new Map<string, { cpuM: number; memMiB: number }>();
      for (const pm of podMetricsList?.items || []) {
        let cpuM = 0;
        let memMiB = 0;
        for (const c of pm.containers || []) {
          cpuM += parseCpuMillicores(c.usage?.cpu);
          memMiB += parseMemoryMiB(c.usage?.memory);
        }
        podMetricMap.set(`${pm.metadata.namespace}/${pm.metadata.name}`, { cpuM, memMiB });
      }

      const podsPerNode = new Map<string, number>();
      for (const p of podList.items) {
        const nodeName = p.spec?.nodeName;
        if (nodeName) {
          podsPerNode.set(nodeName, (podsPerNode.get(nodeName) || 0) + 1);
        }
      }

      const nodes: ClusterNode[] = nodeList.items.map((n) => {
        const name = n.metadata?.name || 'unknown-node';
        const labels = n.metadata?.labels || {};
        const allocCpuM = parseCpuMillicores(n.status?.allocatable?.cpu);
        const allocMemMiB = parseMemoryMiB(n.status?.allocatable?.memory);
        const podCap = Number(n.status?.allocatable?.pods || 110);
        const usage = nodeMetricMap.get(name);
        const cpuPercent =
          usage && allocCpuM > 0
            ? Math.min(100, Math.round((usage.cpuM / allocCpuM) * 1000) / 10)
            : null;
        const memoryPercent =
          usage && allocMemMiB > 0
            ? Math.min(100, Math.round((usage.memMiB / allocMemMiB) * 1000) / 10)
            : null;
        const internalIp =
          n.status?.addresses?.find((a) => a.type === 'InternalIP')?.address || 'n/a';
        const roleKeys = Object.keys(labels).filter((k) =>
          k.startsWith('node-role.kubernetes.io/')
        );
        const role =
          roleKeys.length > 0
            ? roleKeys.map((k) => k.replace('node-role.kubernetes.io/', '')).join(',')
            : 'worker';

        return {
          id: name,
          hostname: name,
          ip: internalIp,
          podCidr: n.spec?.podCIDR || 'n/a',
          zone:
            labels['topology.kubernetes.io/zone'] ||
            labels['failure-domain.beta.kubernetes.io/zone'] ||
            'default',
          role,
          instanceType: labels['node.kubernetes.io/instance-type'] || 'standard',
          kubeletVersion: n.status?.nodeInfo?.kubeletVersion || 'unknown',
          kernelVersion: n.status?.nodeInfo?.kernelVersion || 'unknown',
          osImage: n.status?.nodeInfo?.osImage || 'Linux',
          status: deriveNodeStatus(n),
          unschedulable: Boolean(n.spec?.unschedulable),
          conditions: (n.status?.conditions || []).map((c) => ({
            type: c.type,
            status: c.status,
            reason: c.reason,
            message: c.message,
          })),
          cpuPercent,
          memoryPercent,
          cpuMillicores: usage ? usage.cpuM : null,
          allocatableCpuMillicores: allocCpuM,
          memoryMiB: usage ? usage.memMiB : null,
          allocatableMemoryMiB: allocMemMiB,
          podCount: podsPerNode.get(name) || 0,
          podCapacity: Number.isFinite(podCap) ? podCap : 110,
          uptime: formatAge(n.metadata?.creationTimestamp),
          metricsSource: usage ? 'metrics-server' : 'unavailable',
        };
      });

      const pods: PodWorkload[] = podList.items.map((p) => {
        const name = p.metadata?.name || 'unknown-pod';
        const namespace = p.metadata?.namespace || 'default';
        const statusMap = new Map((p.status?.containerStatuses || []).map((cs) => [cs.name, cs]));

        let reqCpu = 0;
        let limCpu = 0;
        let reqMem = 0;
        let limMem = 0;
        const containers: ContainerInfo[] = (p.spec?.containers || []).map((c) => {
          reqCpu += parseCpuMillicores(c.resources?.requests?.cpu);
          limCpu += parseCpuMillicores(c.resources?.limits?.cpu);
          reqMem += parseMemoryMiB(c.resources?.requests?.memory);
          limMem += parseMemoryMiB(c.resources?.limits?.memory);
          const cs = statusMap.get(c.name);
          const state: ContainerInfo['state'] = cs?.state?.running
            ? 'running'
            : cs?.state?.waiting
              ? 'waiting'
              : cs?.state?.terminated
                ? 'terminated'
                : 'unknown';
          return {
            name: c.name,
            image: c.image || 'unknown',
            imageId: cs?.imageID,
            ready: Boolean(cs?.ready),
            restartCount: cs?.restartCount || 0,
            state,
            reason: cs?.state?.waiting?.reason || cs?.state?.terminated?.reason,
            lastTerminationReason: cs?.lastState?.terminated?.reason,
            exitCode: cs?.lastState?.terminated?.exitCode ?? cs?.state?.terminated?.exitCode,
          };
        });

        const totalRestarts = containers.reduce((sum, c) => sum + c.restartCount, 0);
        const metric = podMetricMap.get(`${namespace}/${name}`);
        const owner = p.metadata?.ownerReferences?.[0];

        return {
          id: `${namespace}/${name}`,
          name,
          namespace,
          nodeName: p.spec?.nodeName || 'unscheduled',
          status: derivePodStatus(p),
          phase: p.status?.phase || 'Unknown',
          restarts: totalRestarts,
          containers,
          cpuMillicores: metric ? metric.cpuM : null,
          cpuRequestMillicores: reqCpu,
          cpuLimitMillicores: limCpu,
          memoryMiB: metric ? metric.memMiB : null,
          memoryRequestMiB: reqMem,
          memoryLimitMiB: limMem,
          ip: p.status?.podIP || 'pending',
          age: formatAge(p.metadata?.creationTimestamp),
          ownerKind: owner?.kind,
          ownerName: owner?.name,
        };
      });

      const namespaces = nsList.items
        .map((ns) => ns.metadata?.name || '')
        .filter(Boolean)
        .sort();

      const deployments: DeploymentWorkload[] = deployList.items.map((d) => ({
        id: `${d.metadata?.namespace}/${d.metadata?.name}`,
        name: d.metadata?.name || 'unknown',
        namespace: d.metadata?.namespace || 'default',
        replicas: d.spec?.replicas ?? 0,
        readyReplicas: d.status?.readyReplicas ?? 0,
        availableReplicas: d.status?.availableReplicas ?? 0,
        updatedReplicas: d.status?.updatedReplicas ?? 0,
        image: d.spec?.template?.spec?.containers?.[0]?.image || 'unknown',
        strategy: d.spec?.strategy?.type || 'RollingUpdate',
        age: formatAge(d.metadata?.creationTimestamp),
      }));

      const statefulSets: StatefulSetWorkload[] = stsList.items.map((s) => ({
        id: `${s.metadata?.namespace}/${s.metadata?.name}`,
        name: s.metadata?.name || 'unknown',
        namespace: s.metadata?.namespace || 'default',
        replicas: s.spec?.replicas ?? 0,
        readyReplicas: s.status?.readyReplicas ?? 0,
        serviceName: s.spec?.serviceName || 'headless',
        age: formatAge(s.metadata?.creationTimestamp),
      }));

      const daemonSets: DaemonSetWorkload[] = dsList.items.map((ds) => ({
        id: `${ds.metadata?.namespace}/${ds.metadata?.name}`,
        name: ds.metadata?.name || 'unknown',
        namespace: ds.metadata?.namespace || 'default',
        desiredNumberScheduled: ds.status?.desiredNumberScheduled ?? 0,
        numberReady: ds.status?.numberReady ?? 0,
        numberAvailable: ds.status?.numberAvailable ?? 0,
        age: formatAge(ds.metadata?.creationTimestamp),
      }));

      const services: K8sService[] = svcList.items.map((s) => ({
        id: `${s.metadata?.namespace}/${s.metadata?.name}`,
        name: s.metadata?.name || 'unknown',
        namespace: s.metadata?.namespace || 'default',
        type: s.spec?.type || 'ClusterIP',
        clusterIp: s.spec?.clusterIP || 'None',
        ports: (s.spec?.ports || []).map(
          (p) => `${p.port}${p.targetPort ? `:${p.targetPort}` : ''}/${p.protocol || 'TCP'}`
        ),
        selectorLabels: s.spec?.selector || {},
      }));

      const ingresses: K8sIngress[] = ingList.items.map((ing) => {
        const paths: K8sIngress['paths'] = [];
        const hosts: string[] = [];
        for (const rule of ing.spec?.rules || []) {
          if (rule.host) hosts.push(rule.host);
          for (const p of rule.http?.paths || []) {
            paths.push({
              host: rule.host || '*',
              path: p.path || '/',
              serviceName: p.backend?.service?.name || 'unknown',
              servicePort: String(
                p.backend?.service?.port?.number ?? p.backend?.service?.port?.name ?? '80'
              ),
            });
          }
        }
        return {
          id: `${ing.metadata?.namespace}/${ing.metadata?.name}`,
          name: ing.metadata?.name || 'unknown',
          namespace: ing.metadata?.namespace || 'default',
          ingressClassName: ing.spec?.ingressClassName || 'default',
          hosts,
          paths,
          tlsEnabled: Boolean(ing.spec?.tls && ing.spec.tls.length > 0),
        };
      });

      const events: K8sEvent[] = eventList.items
        .map((ev) => ({
          id: ev.metadata?.uid || `${ev.metadata?.namespace}-${ev.metadata?.name}`,
          timestamp: String(
            ev.lastTimestamp ||
              ev.eventTime ||
              ev.metadata?.creationTimestamp ||
              new Date().toISOString()
          ),
          type: ev.type || 'Normal',
          reason: ev.reason || 'Event',
          message: ev.message || '',
          namespace: ev.metadata?.namespace || 'default',
          involvedKind: ev.involvedObject?.kind || 'Object',
          involvedName: ev.involvedObject?.name || 'unknown',
          count: ev.count || 1,
        }))
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        .slice(0, 120);

      const pdbs: PodDisruptionBudgetSummary[] = pdbList.items.map((pdb) => ({
        name: pdb.metadata?.name || 'unknown',
        namespace: pdb.metadata?.namespace || 'default',
        minAvailable:
          pdb.spec?.minAvailable !== undefined ? String(pdb.spec.minAvailable) : undefined,
        maxUnavailable:
          pdb.spec?.maxUnavailable !== undefined ? String(pdb.spec.maxUnavailable) : undefined,
        disruptionsAllowed: pdb.status?.disruptionsAllowed ?? 0,
        currentHealthy: pdb.status?.currentHealthy ?? 0,
        desiredHealthy: pdb.status?.desiredHealthy ?? 0,
      }));

      // Derive real incidents from unhealthy nodes, crashed pods, and Warning events
      const derivedIncidents: IncidentItem[] = [];
      for (const n of nodes) {
        if (n.status === 'CRASHED' || n.status === 'DEGRADED') {
          const activeConds = n.conditions
            .filter(
              (c) =>
                (c.type === 'Ready' && c.status !== 'True') ||
                (c.type !== 'Ready' && c.status === 'True')
            )
            .map((c) => `${c.type}=${c.status} (${c.reason || 'condition'})`)
            .join(', ');
          derivedIncidents.push({
            id: `NODE-${n.hostname}`,
            title: `Node ${n.hostname} reporting ${n.status}`,
            severity: n.status === 'CRASHED' ? 'CRITICAL' : 'WARNING',
            source: 'node-condition',
            acknowledged: false,
            resolvedLocally: false,
            targetResource: `node/${n.hostname}`,
            openedAt: new Date().toISOString(),
            summary: activeConds || `Node status is ${n.status}`,
            labels: { node: n.hostname, zone: n.zone },
          });
        }
      }

      for (const p of pods) {
        if (p.status === 'CRASHED') {
          const failingContainer = p.containers.find((c) => !c.ready || c.reason);
          derivedIncidents.push({
            id: `POD-${p.namespace}-${p.name}`,
            title: `Pod ${p.namespace}/${p.name} is ${failingContainer?.reason || 'CRASHED'}`,
            severity: 'CRITICAL',
            source: 'pod-health',
            acknowledged: false,
            resolvedLocally: false,
            targetResource: `pod/${p.namespace}/${p.name}`,
            namespace: p.namespace,
            openedAt: new Date().toISOString(),
            summary: `Restarts: ${p.restarts}. ${
              failingContainer?.lastTerminationReason
                ? `Last termination: ${failingContainer.lastTerminationReason} (exit ${failingContainer.exitCode ?? '?'})`
                : 'Container failing readiness/liveness.'
            }`,
            labels: { namespace: p.namespace, pod: p.name, node: p.nodeName },
          });
        }
      }

      const k8sVersion = nodes[0]?.kubeletVersion || 'v1.x';
      const summary: ClusterSummary = {
        id: currentCtxName || 'default',
        name: currentCtxName || 'kubernetes-cluster',
        contextName: currentCtxName || 'default',
        serverDisplay: sanitizeServerHost(currentCluster?.server),
        k8sVersion,
        connectionMode: mode,
        kubernetesStatus: 'connected',
        prometheusStatus: 'disconnected',
      };

      return {
        summary,
        availableClusters: availableClusters.map((c) =>
          c.id === summary.id ? { ...c, k8sVersion, kubernetesStatus: 'connected' } : c
        ),
        rbac,
        namespaces,
        nodes,
        pods,
        deployments,
        statefulSets,
        daemonSets,
        services,
        ingresses,
        events,
        pdbs,
        derivedIncidents,
      };
    } catch (err) {
      const message = sanitizeK8sError(err, 'Kubernetes API request failed');
      const errorSummary: ClusterSummary = {
        id: currentCtxName || 'error-cluster',
        name: currentCtxName || 'kubernetes-cluster',
        contextName: currentCtxName || 'default',
        serverDisplay: sanitizeServerHost(currentCluster?.server),
        k8sVersion: 'unknown',
        connectionMode: mode,
        kubernetesStatus: 'error',
        prometheusStatus: 'disconnected',
        kubernetesError: message,
      };
      return {
        summary: errorSummary,
        availableClusters: availableClusters.length > 0 ? availableClusters : [errorSummary],
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
        derivedIncidents: [],
      };
    }
  }

  private getRequiredClient(contextOverride?: string): k8s.KubeConfig {
    const { kc, error } = this.createKubeConfig(contextOverride);
    if (!kc) {
      throw new Error(error || 'No active Kubernetes connection');
    }
    return kc;
  }

  async setNodeSchedulable(
    nodeName: string,
    unschedulable: boolean,
    contextOverride?: string
  ): Promise<void> {
    const kc = this.getRequiredClient(contextOverride);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const patchOpts = k8s.setHeaderOptions('Content-Type', k8s.PatchStrategy.StrategicMergePatch);
    await coreApi.patchNode(
      {
        name: nodeName,
        body: { spec: { unschedulable } },
      },
      patchOpts
    );
  }

  async drainNode(nodeName: string, contextOverride?: string): Promise<DrainReport> {
    const kc = this.getRequiredClient(contextOverride);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const policyApi = kc.makeApiClient(k8s.PolicyV1Api);

    const [nodeList, podList, pdbList] = await Promise.all([
      coreApi.listNode(),
      coreApi.listPodForAllNamespaces(),
      policyApi.listPodDisruptionBudgetForAllNamespaces().catch(() => ({
        items: [] as k8s.V1PodDisruptionBudget[],
      })),
    ]);

    const targetNode = nodeList.items.find((n) => n.metadata?.name === nodeName);
    if (!targetNode) {
      throw new Error(`Node '${nodeName}' not found`);
    }

    const podsOnNode = podList.items.filter((p) => p.spec?.nodeName === nodeName);
    const evictablePods = podsOnNode.filter((p) => {
      const isDaemonSet = p.metadata?.ownerReferences?.some((o) => o.kind === 'DaemonSet');
      const isMirror = Boolean(p.metadata?.annotations?.['kubernetes.io/config.mirror']);
      return !isDaemonSet && !isMirror;
    });

    // 1. Check peer cluster scheduling capacity before cordoning/draining
    const healthyPeers = nodeList.items.filter((n) => {
      if (n.metadata?.name === nodeName) return false;
      if (n.spec?.unschedulable) return false;
      const ready = n.status?.conditions?.find((c) => c.type === 'Ready');
      return ready?.status === 'True';
    });

    if (evictablePods.length > 0 && healthyPeers.length === 0) {
      throw new Error(
        `Cannot safely drain '${nodeName}': no schedulable Ready peer nodes available for ${evictablePods.length} workload(s).`
      );
    }

    const totalPeerPodSlots = healthyPeers.reduce((sum, n) => {
      const cap = Number(n.status?.allocatable?.pods || 110);
      const current = podList.items.filter((p) => p.spec?.nodeName === n.metadata?.name).length;
      return sum + Math.max(0, cap - current);
    }, 0);

    if (evictablePods.length > totalPeerPodSlots) {
      throw new Error(
        `Insufficient peer pod capacity: ${evictablePods.length} pods need rescheduling, but only ${totalPeerPodSlots} slots exist.`
      );
    }

    // 2. Check PodDisruptionBudgets before evicting
    const pdbViolations: string[] = [];
    for (const pod of evictablePods) {
      const ns = pod.metadata?.namespace || 'default';
      const matchingPdb = pdbList.items.find(
        (pdb) =>
          pdb.metadata?.namespace === ns &&
          labelsMatchSelector(pod.metadata?.labels, pdb.spec?.selector)
      );
      if (matchingPdb && (matchingPdb.status?.disruptionsAllowed ?? 0) <= 0) {
        pdbViolations.push(
          `${ns}/${pod.metadata?.name} blocked by PDB '${matchingPdb.metadata?.name}' (disruptionsAllowed=0)`
        );
      }
    }

    if (pdbViolations.length > 0) {
      throw new Error(`PodDisruptionBudget check failed: ${pdbViolations.join('; ')}`);
    }

    // 3. Cordon node first
    await this.setNodeSchedulable(nodeName, true, contextOverride);

    const evicted: string[] = [];
    const skipped: { pod: string; reason: string }[] = [];
    const failed: { pod: string; reason: string }[] = [];

    for (const p of podsOnNode) {
      const ns = p.metadata?.namespace || 'default';
      const podName = p.metadata?.name || 'unknown';
      const isDaemonSet = p.metadata?.ownerReferences?.some((o) => o.kind === 'DaemonSet');
      const isMirror = Boolean(p.metadata?.annotations?.['kubernetes.io/config.mirror']);

      if (isDaemonSet) {
        skipped.push({ pod: `${ns}/${podName}`, reason: 'DaemonSet-managed pod' });
        continue;
      }
      if (isMirror) {
        skipped.push({ pod: `${ns}/${podName}`, reason: 'Static mirror pod' });
        continue;
      }

      try {
        await coreApi.createNamespacedPodEviction({
          name: podName,
          namespace: ns,
          body: {
            apiVersion: 'policy/v1',
            kind: 'Eviction',
            metadata: { name: podName, namespace: ns },
          },
        });
        evicted.push(`${ns}/${podName}`);
      } catch (err) {
        failed.push({
          pod: `${ns}/${podName}`,
          reason: err instanceof Error ? err.message : 'Eviction rejected',
        });
      }
    }

    return { nodeName, cordoned: true, evicted, skipped, failed };
  }

  async deletePod(namespace: string, podName: string, contextOverride?: string): Promise<void> {
    const kc = this.getRequiredClient(contextOverride);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    await coreApi.deleteNamespacedPod({ name: podName, namespace });
  }

  async restartDeployment(
    namespace: string,
    deploymentName: string,
    contextOverride?: string
  ): Promise<void> {
    const kc = this.getRequiredClient(contextOverride);
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);
    const patchOpts = k8s.setHeaderOptions('Content-Type', k8s.PatchStrategy.StrategicMergePatch);
    await appsApi.patchNamespacedDeployment(
      {
        name: deploymentName,
        namespace,
        body: {
          spec: {
            template: {
              metadata: {
                annotations: {
                  'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
                },
              },
            },
          },
        },
      },
      patchOpts
    );
  }

  async scaleDeployment(
    namespace: string,
    deploymentName: string,
    replicas: number,
    contextOverride?: string
  ): Promise<void> {
    const kc = this.getRequiredClient(contextOverride);
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);
    const patchOpts = k8s.setHeaderOptions('Content-Type', k8s.PatchStrategy.MergePatch);
    await appsApi.patchNamespacedDeploymentScale(
      {
        name: deploymentName,
        namespace,
        body: { spec: { replicas } },
      },
      patchOpts
    );
  }

  async getPodLogs(
    namespace: string,
    podName: string,
    container?: string,
    tailLines = 200,
    sinceSeconds?: number,
    contextOverride?: string
  ): Promise<string> {
    const kc = this.getRequiredClient(contextOverride);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const logText = await withTimeout(
      coreApi.readNamespacedPodLog({
        name: podName,
        namespace,
        container,
        tailLines,
        sinceSeconds,
        timestamps: true,
      }),
      'pod logs'
    );
    return typeof logText === 'string' ? logText : String(logText || '');
  }

  async getResourceManifest(
    kind: 'node' | 'pod' | 'deployment' | 'service',
    name: string,
    namespace?: string,
    contextOverride?: string
  ): Promise<string> {
    const kc = this.getRequiredClient(contextOverride);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);

    let obj: Record<string, unknown>;
    if (kind === 'node') {
      obj = (await withTimeout(coreApi.readNode({ name }), 'read node')) as unknown as Record<
        string,
        unknown
      >;
    } else if (kind === 'pod') {
      obj = (await coreApi.readNamespacedPod({
        name,
        namespace: namespace || 'default',
      })) as unknown as Record<string, unknown>;
    } else if (kind === 'deployment') {
      obj = (await appsApi.readNamespacedDeployment({
        name,
        namespace: namespace || 'default',
      })) as unknown as Record<string, unknown>;
    } else {
      obj = (await coreApi.readNamespacedService({
        name,
        namespace: namespace || 'default',
      })) as unknown as Record<string, unknown>;
    }

    // Strip verbose managedFields for readability
    if (obj.metadata && typeof obj.metadata === 'object') {
      const meta = { ...(obj.metadata as Record<string, unknown>) };
      delete meta.managedFields;
      obj = { ...obj, metadata: meta };
    }

    return k8s.dumpYaml(obj);
  }
}
