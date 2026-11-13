export type DataSourceMode = 'live' | 'cached' | 'disconnected' | 'demo';

export type UserRole = 'viewer' | 'operator' | 'admin';

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'CRASHED' | 'CORDONED' | 'UNKNOWN';

export type IncidentSeverity = 'CRITICAL' | 'WARNING' | 'RESOLVED';

export type TimeWindow = '15m' | '1h' | '6h' | '24h';

export type ScreenId = 'overview' | 'nodes' | 'logs' | 'network' | 'incidents' | 'audit';

export interface AuthSession {
  authenticated: boolean;
  authMode: 'token' | 'optional';
  role: UserRole;
  actorId: string;
  podExecEnabled: boolean;
  demoModeEnabled: boolean;
}

export interface RbacCapabilities {
  canListNodes: boolean;
  canPatchNodes: boolean;
  canEvictPods: boolean;
  canDeletePods: boolean;
  canScaleDeployments: boolean;
  canRestartDeployments: boolean;
  canReadLogs: boolean;
  canExecPods: boolean;
}

export interface TelemetryPoint {
  timestamp: string;
  cpu: number | null;
  memory: number | null;
  networkMbps: number | null;
  p99LatencyMs: number | null;
}

export interface PrometheusTelemetry {
  status: 'connected' | 'disconnected' | 'error' | 'demo';
  error?: string;
  queriedAt: string;
  series: TelemetryPoint[];
  current: {
    cpuPercent: number | null;
    memoryPercent: number | null;
    diskPercent: number | null;
    networkMbps: number | null;
    rps: number | null;
    errorRatePercent: number | null;
    p99LatencyMs: number | null;
  };
}

export interface ContainerInfo {
  name: string;
  image: string;
  imageId?: string;
  ready: boolean;
  restartCount: number;
  state: 'running' | 'waiting' | 'terminated' | 'unknown';
  reason?: string;
  lastTerminationReason?: string;
  exitCode?: number;
}

export interface PodWorkload {
  id: string;
  name: string;
  namespace: string;
  nodeName: string;
  status: HealthStatus;
  phase: string;
  restarts: number;
  containers: ContainerInfo[];
  cpuMillicores: number | null;
  cpuRequestMillicores: number;
  cpuLimitMillicores: number;
  memoryMiB: number | null;
  memoryRequestMiB: number;
  memoryLimitMiB: number;
  ip: string;
  age: string;
  ownerKind?: string;
  ownerName?: string;
}

export interface NodeCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

export interface ClusterNode {
  id: string;
  hostname: string;
  ip: string;
  podCidr: string;
  zone: string;
  role: string;
  instanceType: string;
  kubeletVersion: string;
  kernelVersion: string;
  osImage: string;
  status: HealthStatus;
  unschedulable: boolean;
  conditions: NodeCondition[];
  cpuPercent: number | null;
  memoryPercent: number | null;
  cpuMillicores: number | null;
  allocatableCpuMillicores: number;
  memoryMiB: number | null;
  allocatableMemoryMiB: number;
  podCount: number;
  podCapacity: number;
  uptime: string;
  metricsSource: 'metrics-server' | 'unavailable' | 'demo';
}

export interface DeploymentWorkload {
  id: string;
  name: string;
  namespace: string;
  replicas: number;
  readyReplicas: number;
  availableReplicas: number;
  updatedReplicas: number;
  image: string;
  strategy: string;
  age: string;
}

export interface StatefulSetWorkload {
  id: string;
  name: string;
  namespace: string;
  replicas: number;
  readyReplicas: number;
  serviceName: string;
  age: string;
}

export interface DaemonSetWorkload {
  id: string;
  name: string;
  namespace: string;
  desiredNumberScheduled: number;
  numberReady: number;
  numberAvailable: number;
  age: string;
}

export interface K8sService {
  id: string;
  name: string;
  namespace: string;
  type: string;
  clusterIp: string;
  ports: string[];
  selectorLabels: Record<string, string>;
}

export interface K8sIngress {
  id: string;
  name: string;
  namespace: string;
  ingressClassName: string;
  hosts: string[];
  paths: { host: string; path: string; serviceName: string; servicePort: string }[];
  tlsEnabled: boolean;
}

export interface K8sEvent {
  id: string;
  timestamp: string;
  type: 'Normal' | 'Warning' | string;
  reason: string;
  message: string;
  namespace: string;
  involvedKind: string;
  involvedName: string;
  count: number;
}

export interface PodDisruptionBudgetSummary {
  name: string;
  namespace: string;
  minAvailable?: string;
  maxUnavailable?: string;
  disruptionsAllowed: number;
  currentHealthy: number;
  desiredHealthy: number;
}

export interface IncidentItem {
  id: string;
  title: string;
  severity: IncidentSeverity;
  source: 'prometheus-alert' | 'kubernetes-event' | 'pod-health' | 'node-condition' | 'demo';
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedLocally: boolean;
  targetResource: string;
  namespace?: string;
  openedAt: string;
  summary: string;
  labels: Record<string, string>;
}

export interface PromAlertRule {
  id: string;
  group: string;
  name: string;
  query: string;
  state: 'firing' | 'pending' | 'inactive' | string;
  health: string;
  severity: IncidentSeverity;
  evaluationTimeSec?: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  target: string;
  clusterId: string;
  outcome: 'allowed' | 'denied' | 'succeeded' | 'failed';
  detail: string;
  ip: string;
}

export interface ClusterSummary {
  id: string;
  name: string;
  contextName: string;
  serverDisplay: string;
  k8sVersion: string;
  connectionMode: 'kubeconfig' | 'incluster' | 'token' | 'disabled' | 'demo';
  kubernetesStatus: 'connected' | 'disconnected' | 'error';
  prometheusStatus: 'connected' | 'disconnected' | 'error' | 'demo';
  kubernetesError?: string;
  prometheusError?: string;
}

export interface ClusterSnapshot {
  sourceMode: DataSourceMode;
  collectedAt: string;
  cluster: ClusterSummary;
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
  telemetry: PrometheusTelemetry;
  incidents: IncidentItem[];
  alertRules: PromAlertRule[];
}

export interface DrainReport {
  nodeName: string;
  cordoned: boolean;
  evicted: string[];
  skipped: { pod: string; reason: string }[];
  failed: { pod: string; reason: string }[];
}

export interface PromQLQueryResult {
  status: 'success' | 'error';
  resultType?: 'vector' | 'matrix' | 'scalar' | 'string';
  result?: {
    metric: Record<string, string>;
    value?: [number, string];
    values?: [number, string][];
  }[];
  error?: string;
}

export type InspectorSelection =
  | { kind: 'node'; id: string }
  | { kind: 'pod'; id: string }
  | { kind: 'deployment'; id: string }
  | { kind: 'service'; id: string }
  | { kind: 'incident'; id: string };
