import type { ClusterSnapshot, TimeWindow } from '../../shared/types.ts';

function buildDemoSeries(window: TimeWindow) {
  const stepMs =
    window === '15m' ? 60_000 : window === '1h' ? 240_000 : window === '6h' ? 1_440_000 : 5_760_000;
  const now = Date.now();
  return Array.from({ length: 15 }, (_, idx) => {
    const t = new Date(now - (14 - idx) * stepMs);
    const wave = Math.sin(idx * 0.7) * 5 + Math.cos(idx * 1.1) * 3;
    return {
      timestamp: t.toISOString().slice(11, 19),
      cpu: Math.round((56 + wave) * 10) / 10,
      memory: Math.round((68 + wave * 0.5) * 10) / 10,
      networkMbps: Math.round(1420 + wave * 35),
      p99LatencyMs: Math.round((13.4 + Math.abs(wave) * 0.8) * 10) / 10,
    };
  });
}

export function getDemoSnapshot(window: TimeWindow): ClusterSnapshot {
  const now = new Date().toISOString();
  const series = buildDemoSeries(window);
  const latest = series[series.length - 1];

  const demoSummary = {
    id: 'demo-sandbox',
    name: 'demo-sandbox (synthetic)',
    contextName: 'demo-sandbox',
    serverDisplay: 'synthetic-demo-dataset',
    k8sVersion: 'v1.31.2-demo',
    connectionMode: 'demo' as const,
    kubernetesStatus: 'connected' as const,
    prometheusStatus: 'demo' as const,
  };

  return {
    sourceMode: 'demo',
    collectedAt: now,
    cluster: demoSummary,
    availableClusters: [demoSummary],
    rbac: {
      canListNodes: true,
      canPatchNodes: false,
      canEvictPods: false,
      canDeletePods: false,
      canScaleDeployments: false,
      canRestartDeployments: false,
      canReadLogs: true,
      canExecPods: false,
    },
    namespaces: ['default', 'ingress-system', 'observability', 'payments'],
    nodes: [
      {
        id: 'demo-node-01',
        hostname: 'demo-worker-01.internal',
        ip: '10.240.12.41',
        podCidr: '10.244.1.0/24',
        zone: 'demo-zone-a',
        role: 'worker',
        instanceType: 'c7i.4xlarge',
        kubeletVersion: 'v1.31.2',
        kernelVersion: '6.8.0-45-generic',
        osImage: 'Bottlerocket OS (Demo)',
        status: 'HEALTHY',
        unschedulable: false,
        conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady' }],
        cpuPercent: 54.2,
        memoryPercent: 63.8,
        cpuMillicores: 8672,
        allocatableCpuMillicores: 16000,
        memoryMiB: 20905,
        allocatableMemoryMiB: 32768,
        podCount: 2,
        podCapacity: 110,
        uptime: '14d',
        metricsSource: 'demo',
      },
      {
        id: 'demo-node-02',
        hostname: 'demo-worker-02.internal',
        ip: '10.240.14.88',
        podCidr: '10.244.2.0/24',
        zone: 'demo-zone-b',
        role: 'worker',
        instanceType: 'r7i.2xlarge',
        kubeletVersion: 'v1.31.2',
        kernelVersion: '6.8.0-45-generic',
        osImage: 'Bottlerocket OS (Demo)',
        status: 'DEGRADED',
        unschedulable: false,
        conditions: [
          { type: 'Ready', status: 'True', reason: 'KubeletReady' },
          {
            type: 'MemoryPressure',
            status: 'True',
            reason: 'KubeletHasInsufficientMemory',
            message: 'Demo synthetic memory pressure condition',
          },
        ],
        cpuPercent: 84.1,
        memoryPercent: 90.6,
        cpuMillicores: 6728,
        allocatableCpuMillicores: 8000,
        memoryMiB: 29688,
        allocatableMemoryMiB: 32768,
        podCount: 2,
        podCapacity: 110,
        uptime: '9d',
        metricsSource: 'demo',
      },
    ],
    pods: [
      {
        id: 'payments/checkout-api-6b9d4f7c-m4p8w',
        name: 'checkout-api-6b9d4f7c-m4p8w',
        namespace: 'payments',
        nodeName: 'demo-worker-01.internal',
        status: 'HEALTHY',
        phase: 'Running',
        restarts: 0,
        containers: [
          {
            name: 'checkout-api',
            image: 'ghcr.io/example/checkout-api:2.14.3',
            ready: true,
            restartCount: 0,
            state: 'running',
          },
        ],
        cpuMillicores: 620,
        cpuRequestMillicores: 500,
        cpuLimitMillicores: 2000,
        memoryMiB: 1024,
        memoryRequestMiB: 512,
        memoryLimitMiB: 2048,
        ip: '10.244.1.44',
        age: '6d',
        ownerKind: 'ReplicaSet',
        ownerName: 'checkout-api-6b9d4f7c',
      },
      {
        id: 'observability/otel-collector-5d7c98f-z1v4r',
        name: 'otel-collector-5d7c98f-z1v4r',
        namespace: 'observability',
        nodeName: 'demo-worker-02.internal',
        status: 'CRASHED',
        phase: 'Running',
        restarts: 7,
        containers: [
          {
            name: 'otel-collector',
            image: 'otel/opentelemetry-collector:0.109.1',
            ready: false,
            restartCount: 7,
            state: 'waiting',
            reason: 'CrashLoopBackOff',
            lastTerminationReason: 'OOMKilled',
            exitCode: 137,
          },
        ],
        cpuMillicores: 920,
        cpuRequestMillicores: 250,
        cpuLimitMillicores: 1000,
        memoryMiB: 1018,
        memoryRequestMiB: 512,
        memoryLimitMiB: 1024,
        ip: '10.244.2.63',
        age: '19h',
        ownerKind: 'ReplicaSet',
        ownerName: 'otel-collector-5d7c98f',
      },
    ],
    deployments: [
      {
        id: 'payments/checkout-api',
        name: 'checkout-api',
        namespace: 'payments',
        replicas: 2,
        readyReplicas: 2,
        availableReplicas: 2,
        updatedReplicas: 2,
        image: 'ghcr.io/example/checkout-api:2.14.3',
        strategy: 'RollingUpdate',
        age: '18d',
      },
      {
        id: 'observability/otel-collector',
        name: 'otel-collector',
        namespace: 'observability',
        replicas: 1,
        readyReplicas: 0,
        availableReplicas: 0,
        updatedReplicas: 1,
        image: 'otel/opentelemetry-collector:0.109.1',
        strategy: 'RollingUpdate',
        age: '5d',
      },
    ],
    statefulSets: [
      {
        id: 'payments/ledger-postgres',
        name: 'ledger-postgres',
        namespace: 'payments',
        replicas: 1,
        readyReplicas: 1,
        serviceName: 'ledger-postgres-headless',
        age: '30d',
      },
    ],
    daemonSets: [
      {
        id: 'observability/node-exporter',
        name: 'node-exporter',
        namespace: 'observability',
        desiredNumberScheduled: 2,
        numberReady: 2,
        numberAvailable: 2,
        age: '30d',
      },
    ],
    services: [
      {
        id: 'payments/checkout-api',
        name: 'checkout-api',
        namespace: 'payments',
        type: 'ClusterIP',
        clusterIp: '10.96.42.18',
        ports: ['80:8080/TCP'],
        selectorLabels: { app: 'checkout-api' },
      },
      {
        id: 'observability/otel-collector',
        name: 'otel-collector',
        namespace: 'observability',
        type: 'ClusterIP',
        clusterIp: '10.96.88.14',
        ports: ['4317:4317/TCP', '4318:4318/TCP'],
        selectorLabels: { app: 'otel-collector' },
      },
    ],
    ingresses: [
      {
        id: 'ingress-system/api-gateway',
        name: 'api-gateway',
        namespace: 'ingress-system',
        ingressClassName: 'nginx',
        hosts: ['api.demo.example.internal'],
        paths: [
          {
            host: 'api.demo.example.internal',
            path: '/v2/checkout',
            serviceName: 'checkout-api',
            servicePort: '80',
          },
        ],
        tlsEnabled: true,
      },
    ],
    events: [
      {
        id: 'demo-ev-1',
        timestamp: now,
        type: 'Warning',
        reason: 'OOMKilling',
        message: 'Synthetic demo event: container otel-collector killed due to memory limit 1024Mi',
        namespace: 'observability',
        involvedKind: 'Pod',
        involvedName: 'otel-collector-5d7c98f-z1v4r',
        count: 7,
      },
      {
        id: 'demo-ev-2',
        timestamp: now,
        type: 'Normal',
        reason: 'Scheduled',
        message: 'Successfully assigned payments/checkout-api-6b9d4f7c-m4p8w to demo-worker-01',
        namespace: 'payments',
        involvedKind: 'Pod',
        involvedName: 'checkout-api-6b9d4f7c-m4p8w',
        count: 1,
      },
    ],
    pdbs: [
      {
        name: 'checkout-api-pdb',
        namespace: 'payments',
        minAvailable: '1',
        disruptionsAllowed: 1,
        currentHealthy: 2,
        desiredHealthy: 1,
      },
    ],
    telemetry: {
      status: 'demo',
      queriedAt: now,
      series,
      current: {
        cpuPercent: latest.cpu,
        memoryPercent: latest.memory,
        diskPercent: 44.2,
        networkMbps: latest.networkMbps,
        rps: 4120,
        errorRatePercent: 0.12,
        p99LatencyMs: latest.p99LatencyMs,
      },
    },
    incidents: [
      {
        id: 'DEMO-INC-1',
        title: '[DEMO] Pod observability/otel-collector-5d7c98f-z1v4r CrashLoopBackOff',
        severity: 'CRITICAL',
        source: 'demo',
        acknowledged: false,
        resolvedLocally: false,
        targetResource: 'pod/observability/otel-collector-5d7c98f-z1v4r',
        namespace: 'observability',
        openedAt: now,
        summary: 'Synthetic demo incident illustrating OOMKilled container tracking (exit 137).',
        labels: { mode: 'demo', namespace: 'observability' },
      },
    ],
    alertRules: [
      {
        id: 'demo-rule-1',
        group: 'demo.rules',
        name: 'DemoPodCrashLooping',
        query: 'increase(kube_pod_container_status_restarts_total[15m]) > 3',
        state: 'firing',
        health: 'ok',
        severity: 'CRITICAL',
        evaluationTimeSec: 0.012,
      },
    ],
  };
}

export function getDemoPodLogs(namespace: string, pod: string): string {
  const now = new Date().toISOString();
  return [
    `${now} [DEMO LOG] namespace=${namespace} pod=${pod} level=INFO msg="Synthetic demo log stream active"`,
    `${now} [DEMO LOG] namespace=${namespace} pod=${pod} level=WARN msg="This output is synthetic demo data, not a real container log."`,
  ].join('\n');
}
