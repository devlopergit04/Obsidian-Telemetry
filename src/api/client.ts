import type {
  AuditEntry,
  AuthSession,
  ClusterSnapshot,
  DrainReport,
  PromQLQueryResult,
  TimeWindow,
} from '../shared/types.ts';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { error: text };
    }
  }

  if (!res.ok) {
    const msg =
      typeof parsed.error === 'string' && parsed.error.trim()
        ? parsed.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }

  return parsed as unknown as T;
}

export const apiClient = {
  getSession(): Promise<AuthSession> {
    return requestJson<AuthSession>('/api/auth/session');
  },

  login(token: string): Promise<AuthSession> {
    return requestJson<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  logout(): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    });
  },

  getSnapshot(params: {
    mode: 'live' | 'demo';
    window: TimeWindow;
    context?: string;
  }): Promise<ClusterSnapshot> {
    const q = new URLSearchParams({
      mode: params.mode,
      window: params.window,
    });
    if (params.context) q.set('context', params.context);
    return requestJson<ClusterSnapshot>(`/api/clusters/snapshot?${q.toString()}`);
  },

  queryPrometheus(query: string): Promise<PromQLQueryResult> {
    return requestJson<PromQLQueryResult>('/api/prometheus/query', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  },

  getPodLogs(params: {
    namespace: string;
    pod: string;
    container?: string;
    tailLines?: number;
    mode: 'live' | 'demo';
    context?: string;
  }): Promise<{ sourceMode: 'live' | 'demo'; logs: string }> {
    const q = new URLSearchParams({
      mode: params.mode,
      tailLines: String(params.tailLines ?? 250),
    });
    if (params.container) q.set('container', params.container);
    if (params.context) q.set('context', params.context);
    return requestJson<{ sourceMode: 'live' | 'demo'; logs: string }>(
      `/api/namespaces/${encodeURIComponent(params.namespace)}/pods/${encodeURIComponent(
        params.pod
      )}/logs?${q.toString()}`
    );
  },

  getManifest(params: {
    kind: 'node' | 'pod' | 'deployment' | 'service';
    name: string;
    namespace?: string;
    context?: string;
  }): Promise<{ yaml: string }> {
    const q = new URLSearchParams();
    if (params.namespace) q.set('namespace', params.namespace);
    if (params.context) q.set('context', params.context);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return requestJson<{ yaml: string }>(
      `/api/manifests/${params.kind}/${encodeURIComponent(params.name)}${qs}`
    );
  },

  cordonNode(nodeName: string, context?: string): Promise<{ ok: boolean }> {
    const qs = context ? `?context=${encodeURIComponent(context)}` : '';
    return requestJson<{ ok: boolean }>(`/api/nodes/${encodeURIComponent(nodeName)}/cordon${qs}`, {
      method: 'POST',
    });
  },

  uncordonNode(nodeName: string, context?: string): Promise<{ ok: boolean }> {
    const qs = context ? `?context=${encodeURIComponent(context)}` : '';
    return requestJson<{ ok: boolean }>(
      `/api/nodes/${encodeURIComponent(nodeName)}/uncordon${qs}`,
      { method: 'POST' }
    );
  },

  drainNode(nodeName: string, context?: string): Promise<DrainReport> {
    const qs = context ? `?context=${encodeURIComponent(context)}` : '';
    return requestJson<DrainReport>(`/api/nodes/${encodeURIComponent(nodeName)}/drain${qs}`, {
      method: 'POST',
    });
  },

  deletePod(namespace: string, pod: string, context?: string): Promise<{ ok: boolean }> {
    const qs = context ? `?context=${encodeURIComponent(context)}` : '';
    return requestJson<{ ok: boolean }>(
      `/api/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}${qs}`,
      { method: 'DELETE' }
    );
  },

  restartDeployment(namespace: string, name: string, context?: string): Promise<{ ok: boolean }> {
    const qs = context ? `?context=${encodeURIComponent(context)}` : '';
    return requestJson<{ ok: boolean }>(
      `/api/namespaces/${encodeURIComponent(namespace)}/deployments/${encodeURIComponent(
        name
      )}/restart${qs}`,
      { method: 'POST' }
    );
  },

  scaleDeployment(
    namespace: string,
    name: string,
    replicas: number,
    context?: string
  ): Promise<{ ok: boolean }> {
    const qs = context ? `?context=${encodeURIComponent(context)}` : '';
    return requestJson<{ ok: boolean }>(
      `/api/namespaces/${encodeURIComponent(namespace)}/deployments/${encodeURIComponent(
        name
      )}/scale${qs}`,
      {
        method: 'POST',
        body: JSON.stringify({ replicas }),
      }
    );
  },

  acknowledgeIncident(id: string): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/incidents/${encodeURIComponent(id)}/acknowledge`, {
      method: 'POST',
    });
  },

  resolveIncident(id: string): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/incidents/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
    });
  },

  getAuditLogs(limit = 100): Promise<{ entries: AuditEntry[] }> {
    return requestJson<{ entries: AuditEntry[] }>(`/api/audit?limit=${limit}`);
  },
};
