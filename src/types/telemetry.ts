export enum ScreenId {
  OVERVIEW = 'overview',
  NODES = 'nodes',
  LOGS = 'logs',
  NETWORK = 'network',
  INCIDENTS = 'incidents',
}

export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  CRASHED = 'CRASHED',
  CORDONED = 'CORDONED',
}

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  TRACE = 'TRACE',
}

export enum IncidentSeverity {
  CRITICAL = 'CRITICAL',
  WARNING = 'WARNING',
  RESOLVED = 'RESOLVED',
}

export type TimeWindow = '15m' | '1h' | '6h' | '24h';

export interface TelemetryPoint {
  timestamp: string;
  cpu: number;
  memory: number;
  networkMbps: number;
  p99LatencyMs: number;
}

export interface PodWorkload {
  id: string;
  name: string;
  namespace: string;
  nodeId: string;
  status: HealthStatus;
  restarts: number;
  cpuMillicores: number;
  cpuLimitMillicores: number;
  memoryMiB: number;
  memoryLimitMiB: number;
  ip: string;
  image: string;
  sha256: string;
  age: string;
}

export interface ClusterNode {
  id: string;
  hostname: string;
  ip: string;
  podCidr: string;
  zone: string;
  role: 'control-plane' | 'worker-compute' | 'worker-memory' | 'edge-ingress';
  instanceType: string;
  kubeletVersion: string;
  kernelVersion: string;
  osImage: string;
  status: HealthStatus;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  networkRxMbps: number;
  networkTxMbps: number;
  podCount: number;
  podCapacity: number;
  uptime: string;
  cpuHistory: number[];
  memHistory: number[];
  events: {
    id: string;
    time: string;
    type: 'Normal' | 'Warning' | 'Critical';
    reason: string;
    message: string;
  }[];
}

export interface ServiceMeshNode {
  id: string;
  name: string;
  namespace: string;
  tier: 'edge' | 'ingress' | 'service' | 'data';
  status: HealthStatus;
  rps: number;
  errorRate: number;
  p99Ms: number;
  mtls: boolean;
  replicas: string;
  x: number;
  y: number;
  upstreamIds: string[];
}

export interface IngressRoute {
  id: string;
  host: string;
  path: string;
  service: string;
  cidrAllowlist: string;
  tlsExpiryDays: number;
  rps: number;
  p95Ms: number;
  rateLimitRpm: number;
  circuitBreakerOpen: boolean;
  status: HealthStatus;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  service: string;
  pod: string;
  nodeHostname: string;
  traceId: string;
  message: string;
  payload?: string;
}

export interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  acknowledged: boolean;
  clusterId: string;
  targetResource: string;
  nodeIp: string;
  openedAt: string;
  duration: string;
  summary: string;
  runbookCmd: string;
  timeline: {
    time: string;
    actor: string;
    note: string;
  }[];
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: string;
  threshold: number;
  unit: string;
  severity: IncidentSeverity;
  enabled: boolean;
  evaluationWindow: string;
}

export interface ClusterData {
  id: string;
  name: string;
  region: string;
  provider: string;
  controlPlaneIp: string;
  vpcCidr: string;
  k8sVersion: string;
  status: HealthStatus;
  telemetrySeries: TelemetryPoint[];
  nodes: ClusterNode[];
  pods: PodWorkload[];
  services: ServiceMeshNode[];
  ingressRoutes: IngressRoute[];
  logs: LogEntry[];
  incidents: Incident[];
  alertRules: AlertRule[];
}

export type InspectorSelection =
  | { kind: 'node'; id: string }
  | { kind: 'pod'; id: string }
  | { kind: 'service'; id: string }
  | { kind: 'incident'; id: string };
