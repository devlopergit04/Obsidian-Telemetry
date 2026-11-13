import type {
  IncidentItem,
  IncidentSeverity,
  PromAlertRule,
  PrometheusTelemetry,
  PromQLQueryResult,
  TelemetryPoint,
  TimeWindow,
} from '../../shared/types.ts';
import type { AppConfig } from '../config.ts';

interface PromApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  error?: string;
  errorType?: string;
}

interface PromVectorData {
  resultType: 'vector' | 'matrix' | 'scalar' | 'string';
  result: {
    metric: Record<string, string>;
    value?: [number, string];
    values?: [number, string][];
  }[];
}

interface PromRulesData {
  groups: {
    name: string;
    rules: {
      type: string;
      name: string;
      query: string;
      state?: string;
      health?: string;
      evaluationTime?: number;
      labels?: Record<string, string>;
      alerts?: {
        labels: Record<string, string>;
        annotations: Record<string, string>;
        state: string;
        activeAt?: string;
        value?: string;
      }[];
    }[];
  }[];
}

function windowToRange(window: TimeWindow): { lookbackSec: number; stepSec: number } {
  switch (window) {
    case '15m':
      return { lookbackSec: 15 * 60, stepSec: 60 };
    case '1h':
      return { lookbackSec: 60 * 60, stepSec: 240 };
    case '6h':
      return { lookbackSec: 6 * 3600, stepSec: 1440 };
    case '24h':
      return { lookbackSec: 24 * 3600, stepSec: 5760 };
  }
}

export function roundMetric(val: number | null): number | null {
  if (val === null || !Number.isFinite(val)) return null;
  return Math.round(val * 100) / 100;
}

export class PrometheusService {
  private readonly baseUrl?: string;
  private readonly bearerToken?: string;
  private readonly timeoutMs: number;

  constructor(
    config: Pick<AppConfig, 'prometheusUrl' | 'prometheusBearerToken' | 'prometheusTimeoutMs'>
  ) {
    this.baseUrl = config.prometheusUrl;
    this.bearerToken = config.prometheusBearerToken;
    this.timeoutMs = config.prometheusTimeoutMs;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  private async request<T>(
    path: string,
    params?: Record<string, string>
  ): Promise<PromApiResponse<T>> {
    if (!this.baseUrl) {
      return { status: 'error', error: 'PROMETHEUS_URL is not configured' };
    }

    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (this.bearerToken) {
        headers.Authorization = `Bearer ${this.bearerToken}`;
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      const body = (await response.json()) as PromApiResponse<T>;
      if (!response.ok || body.status !== 'success') {
        return {
          status: 'error',
          error: body.error || `Prometheus HTTP ${response.status}`,
          errorType: body.errorType,
        };
      }
      return body;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to Prometheus';
      return { status: 'error', error: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  async executeQuery(promql: string): Promise<PromQLQueryResult> {
    if (!this.baseUrl) {
      return { status: 'error', error: 'PROMETHEUS_URL is not configured' };
    }
    const res = await this.request<PromVectorData>('/api/v1/query', { query: promql });
    if (res.status !== 'success' || !res.data) {
      return { status: 'error', error: res.error || 'Query failed' };
    }
    return {
      status: 'success',
      resultType: res.data.resultType,
      result: res.data.result,
    };
  }

  private async queryScalar(promql: string): Promise<{ value: number | null; error?: string }> {
    const res = await this.request<PromVectorData>('/api/v1/query', { query: promql });
    if (res.status !== 'success' || !res.data) {
      return { value: null, error: res.error };
    }
    const raw = res.data.result?.[0]?.value?.[1];
    if (raw === undefined) return { value: null };
    const num = Number(raw);
    return { value: Number.isFinite(num) ? num : null };
  }

  private async queryRange(
    promql: string,
    startSec: number,
    endSec: number,
    stepSec: number
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    const res = await this.request<PromVectorData>('/api/v1/query_range', {
      query: promql,
      start: String(startSec),
      end: String(endSec),
      step: String(stepSec),
    });
    if (res.status !== 'success' || !res.data) return map;
    const values = res.data.result?.[0]?.values || [];
    for (const [ts, rawVal] of values) {
      const num = Number(rawVal);
      if (Number.isFinite(num)) {
        map.set(ts, num);
      }
    }
    return map;
  }

  async getTelemetry(window: TimeWindow): Promise<PrometheusTelemetry> {
    const queriedAt = new Date().toISOString();
    if (!this.baseUrl) {
      return {
        status: 'disconnected',
        error:
          'PROMETHEUS_URL is not configured. Configure PROMETHEUS_URL to enable live PromQL metrics.',
        queriedAt,
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
      };
    }

    const endSec = Math.floor(Date.now() / 1000);
    const { lookbackSec, stepSec } = windowToRange(window);
    const startSec = endSec - lookbackSec;

    const cpuPromql = '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)';
    const memPromql =
      '(1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))) * 100';
    const diskPromql =
      '(1 - (sum(node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}) / sum(node_filesystem_size_bytes{fstype!~"tmpfs|overlay"}))) * 100';
    const netPromql =
      '(sum(rate(node_network_receive_bytes_total{device!~"lo|veth.*"}[5m])) + sum(rate(node_network_transmit_bytes_total{device!~"lo|veth.*"}[5m]))) * 8 / 1e6';
    const rpsPromql = 'sum(rate(http_requests_total[5m]))';
    const errPromql =
      '(sum(rate(http_requests_total{status=~"5.."}[5m])) / clamp_min(sum(rate(http_requests_total[5m])), 1)) * 100';
    const p99Promql =
      'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) * 1000';

    const probe = await this.request<Record<string, unknown>>('/api/v1/status/buildinfo');
    if (probe.status !== 'success') {
      return {
        status: 'error',
        error: probe.error || 'Prometheus endpoint unreachable',
        queriedAt,
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
      };
    }

    const [
      cpuCur,
      memCur,
      diskCur,
      netCur,
      rpsCur,
      errCur,
      p99Cur,
      cpuRange,
      memRange,
      netRange,
      p99Range,
    ] = await Promise.all([
      this.queryScalar(cpuPromql),
      this.queryScalar(memPromql),
      this.queryScalar(diskPromql),
      this.queryScalar(netPromql),
      this.queryScalar(rpsPromql),
      this.queryScalar(errPromql),
      this.queryScalar(p99Promql),
      this.queryRange(cpuPromql, startSec, endSec, stepSec),
      this.queryRange(memPromql, startSec, endSec, stepSec),
      this.queryRange(netPromql, startSec, endSec, stepSec),
      this.queryRange(p99Promql, startSec, endSec, stepSec),
    ]);

    const allTimestamps = Array.from(
      new Set([...cpuRange.keys(), ...memRange.keys(), ...netRange.keys(), ...p99Range.keys()])
    ).sort((a, b) => a - b);

    const series: TelemetryPoint[] = allTimestamps.map((ts) => ({
      timestamp: new Date(ts * 1000).toISOString().slice(11, 19),
      cpu: roundMetric(cpuRange.get(ts) ?? null),
      memory: roundMetric(memRange.get(ts) ?? null),
      networkMbps: roundMetric(netRange.get(ts) ?? null),
      p99LatencyMs: roundMetric(p99Range.get(ts) ?? null),
    }));

    return {
      status: 'connected',
      queriedAt,
      series,
      current: {
        cpuPercent: roundMetric(cpuCur.value),
        memoryPercent: roundMetric(memCur.value),
        diskPercent: roundMetric(diskCur.value),
        networkMbps: roundMetric(netCur.value),
        rps: roundMetric(rpsCur.value),
        errorRatePercent: roundMetric(errCur.value),
        p99LatencyMs: roundMetric(p99Cur.value),
      },
    };
  }

  async getAlertRulesAndIncidents(): Promise<{
    rules: PromAlertRule[];
    incidents: IncidentItem[];
    error?: string;
  }> {
    if (!this.baseUrl) {
      return { rules: [], incidents: [] };
    }

    const res = await this.request<PromRulesData>('/api/v1/rules', { type: 'alert' });
    if (res.status !== 'success' || !res.data) {
      return { rules: [], incidents: [], error: res.error };
    }

    const rules: PromAlertRule[] = [];
    const incidents: IncidentItem[] = [];

    for (const group of res.data.groups || []) {
      for (const rule of group.rules || []) {
        const rawSeverity = (rule.labels?.severity || 'warning').toLowerCase();
        const severity: IncidentSeverity =
          rawSeverity === 'critical' || rawSeverity === 'page' ? 'CRITICAL' : 'WARNING';

        rules.push({
          id: `${group.name}:${rule.name}`,
          group: group.name,
          name: rule.name,
          query: rule.query,
          state: rule.state || 'inactive',
          health: rule.health || 'ok',
          severity,
          evaluationTimeSec: rule.evaluationTime,
        });

        for (const alert of rule.alerts || []) {
          if (alert.state !== 'firing' && alert.state !== 'pending') continue;
          const target =
            alert.labels?.pod ||
            alert.labels?.node ||
            alert.labels?.instance ||
            alert.labels?.job ||
            rule.name;
          incidents.push({
            id: `PROM-${Buffer.from(`${rule.name}:${target}`).toString('hex').slice(0, 8)}`,
            title: alert.annotations?.summary || `${rule.name} (${alert.state})`,
            severity,
            source: 'prometheus-alert',
            acknowledged: false,
            resolvedLocally: false,
            targetResource: target,
            namespace: alert.labels?.namespace,
            openedAt: alert.activeAt || new Date().toISOString(),
            summary:
              alert.annotations?.description ||
              `PromQL rule "${rule.name}" is ${alert.state} (value=${alert.value ?? 'n/a'}).`,
            labels: alert.labels || {},
          });
        }
      }
    }

    return { rules, incidents };
  }
}
