import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/server/config.ts';
import {
  resolveTokenRole,
  signSessionCookie,
  verifySessionCookie,
} from '../src/server/middleware/auth.ts';
import { AuditLogger } from '../src/server/services/auditLogger.ts';
import { IncidentService } from '../src/server/services/incidentService.ts';
import {
  deriveNodeStatus,
  derivePodStatus,
  labelsMatchSelector,
  parseCpuMillicores,
  parseMemoryMiB,
} from '../src/server/services/kubernetesService.ts';
import { PrometheusService } from '../src/server/services/prometheusService.ts';

describe('Server Config & Auth Security', () => {
  it('loads defaults cleanly and ignores placeholder tokens', () => {
    const cfg = loadConfig({
      PORT: '3000',
      AUTH_MODE: 'token',
      OBSIDIAN_ADMIN_TOKEN: 'replace-with-strong-admin-token',
      OBSIDIAN_OPERATOR_TOKEN: 'op-secret-123',
      ENABLE_DEMO_MODE: 'false',
    });

    expect(cfg.port).toBe(3000);
    expect(cfg.authMode).toBe('token');
    expect(cfg.adminToken).toBe('');
    expect(cfg.operatorToken).toBe('op-secret-123');
    expect(cfg.enableDemoMode).toBe(false);
    expect(cfg.sessionSecret.length).toBeGreaterThanOrEqual(32);
  });

  it('resolves token roles using timing-safe comparison and rejects invalid tokens', () => {
    const cfg = loadConfig({
      OBSIDIAN_ADMIN_TOKEN: 'adm-999',
      OBSIDIAN_OPERATOR_TOKEN: 'opr-888',
      OBSIDIAN_VIEWER_TOKEN: 'vwr-777',
    });

    expect(resolveTokenRole('adm-999', cfg)?.role).toBe('admin');
    expect(resolveTokenRole('opr-888', cfg)?.role).toBe('operator');
    expect(resolveTokenRole('vwr-777', cfg)?.role).toBe('viewer');
    expect(resolveTokenRole('wrong', cfg)).toBeNull();
    expect(resolveTokenRole('', cfg)).toBeNull();
  });

  it('signs and verifies HMAC-SHA256 session cookies and rejects tampering or expiry', () => {
    const secret = 'test-signing-secret-0123456789abcdef';
    const validCookie = signSessionCookie(
      { role: 'operator', actorId: 'token-operator', exp: Date.now() + 60_000 },
      secret
    );
    const verified = verifySessionCookie(validCookie, secret);
    expect(verified?.role).toBe('operator');
    expect(verified?.actorId).toBe('token-operator');

    // Tampered signature
    const [payload] = validCookie.split('.');
    expect(verifySessionCookie(`${payload}.tampered`, secret)).toBeNull();

    // Expired payload
    const expiredCookie = signSessionCookie(
      { role: 'admin', actorId: 'token-admin', exp: Date.now() - 1000 },
      secret
    );
    expect(verifySessionCookie(expiredCookie, secret)).toBeNull();
  });
});

describe('AuditLogger & IncidentService', () => {
  it('records audit entries in newest-first order with bounded ring size', () => {
    const logger = new AuditLogger(3);
    logger.record({
      actorId: 'a1',
      actorRole: 'viewer',
      action: 'FIRST',
      target: 'node/n1',
      clusterId: 'ctx',
      outcome: 'allowed',
      detail: 'd1',
      ip: '127.0.0.1',
    });
    logger.record({
      actorId: 'a2',
      actorRole: 'operator',
      action: 'SECOND',
      target: 'node/n2',
      clusterId: 'ctx',
      outcome: 'succeeded',
      detail: 'd2',
      ip: '127.0.0.1',
    });
    logger.record({
      actorId: 'a3',
      actorRole: 'admin',
      action: 'THIRD',
      target: 'pod/p1',
      clusterId: 'ctx',
      outcome: 'denied',
      detail: 'd3',
      ip: '127.0.0.1',
    });
    logger.record({
      actorId: 'a4',
      actorRole: 'admin',
      action: 'FOURTH',
      target: 'pod/p2',
      clusterId: 'ctx',
      outcome: 'succeeded',
      detail: 'd4',
      ip: '127.0.0.1',
    });

    const listed = logger.list(10);
    expect(listed).toHaveLength(3);
    expect(listed.map((e) => e.action)).toEqual(['FOURTH', 'THIRD', 'SECOND']);
  });

  it('merges operator triage overlay cleanly without erasing underlying incidents', () => {
    const service = new IncidentService();
    service.acknowledge('INC-1', 'token-operator');
    service.markResolvedLocally('INC-2', 'token-admin');

    const merged = service.merge([
      {
        id: 'INC-1',
        title: 'High CPU',
        severity: 'WARNING',
        source: 'prometheus-alert',
        acknowledged: false,
        resolvedLocally: false,
        targetResource: 'node-1',
        openedAt: '2026-01-01T00:00:00Z',
        summary: 'CPU > 85%',
        labels: {},
      },
      {
        id: 'INC-2',
        title: 'CrashLoop',
        severity: 'CRITICAL',
        source: 'pod-health',
        acknowledged: false,
        resolvedLocally: false,
        targetResource: 'pod-1',
        openedAt: '2026-01-01T00:00:00Z',
        summary: 'OOMKilled',
        labels: {},
      },
    ]);

    expect(merged[0].acknowledged).toBe(true);
    expect(merged[0].acknowledgedBy).toBe('token-operator');
    expect(merged[1].resolvedLocally).toBe(true);
    expect(merged[1].severity).toBe('RESOLVED');
  });
});

describe('Kubernetes Resource Parsing & Status Derivation', () => {
  it('parses CPU quantities across nanocores, microcores, millicores, and cores', () => {
    expect(parseCpuMillicores('250000000n')).toBe(250);
    expect(parseCpuMillicores('500000u')).toBe(500);
    expect(parseCpuMillicores('1500m')).toBe(1500);
    expect(parseCpuMillicores('4')).toBe(4000);
    expect(parseCpuMillicores(undefined)).toBe(0);
  });

  it('parses Memory quantities across Ki, Mi, Gi, Ti', () => {
    expect(parseMemoryMiB('1048576Ki')).toBe(1024);
    expect(parseMemoryMiB('512Mi')).toBe(512);
    expect(parseMemoryMiB('2Gi')).toBe(2048);
    expect(parseMemoryMiB('1Ti')).toBe(1048576);
    expect(parseMemoryMiB(undefined)).toBe(0);
  });

  it('derives node status accurately from unschedulable and conditions', () => {
    expect(deriveNodeStatus({ spec: { unschedulable: true } })).toBe('CORDONED');
    expect(
      deriveNodeStatus({
        status: { conditions: [{ type: 'Ready', status: 'True' }] },
      })
    ).toBe('HEALTHY');
    expect(
      deriveNodeStatus({
        status: {
          conditions: [
            { type: 'Ready', status: 'True' },
            { type: 'MemoryPressure', status: 'True' },
          ],
        },
      })
    ).toBe('DEGRADED');
    expect(
      deriveNodeStatus({
        status: { conditions: [{ type: 'Ready', status: 'False' }] },
      })
    ).toBe('CRASHED');
  });

  it('derives pod status accurately from CrashLoopBackOff, OOMKilled, and readiness', () => {
    expect(
      derivePodStatus({
        status: {
          phase: 'Running',
          containerStatuses: [
            {
              name: 'app',
              ready: false,
              restartCount: 5,
              image: 'img',
              imageID: 'id',
              state: { waiting: { reason: 'CrashLoopBackOff' } },
            },
          ],
        },
      })
    ).toBe('CRASHED');

    expect(
      derivePodStatus({
        status: {
          phase: 'Running',
          containerStatuses: [
            { name: 'app', ready: true, restartCount: 0, image: 'img', imageID: 'id' },
          ],
        },
      })
    ).toBe('HEALTHY');
  });

  it('matches PDB label selectors accurately', () => {
    expect(
      labelsMatchSelector(
        { app: 'api', tier: 'backend' },
        {
          matchLabels: { app: 'api' },
          matchExpressions: [{ key: 'tier', operator: 'In', values: ['backend'] }],
        }
      )
    ).toBe(true);
    expect(labelsMatchSelector({ app: 'web' }, { matchLabels: { app: 'api' } })).toBe(false);
  });
});

describe('PrometheusService Real HTTP Behavior', () => {
  it('returns disconnected telemetry without fabricating metrics when PROMETHEUS_URL is unset', async () => {
    const prom = new PrometheusService({
      prometheusUrl: undefined,
      prometheusBearerToken: undefined,
      prometheusTimeoutMs: 2000,
    });

    const telemetry = await prom.getTelemetry('15m');
    expect(telemetry.status).toBe('disconnected');
    expect(telemetry.series).toEqual([]);
    expect(telemetry.current.cpuPercent).toBeNull();
  });

  it('queries live Prometheus JSON responses accurately', async () => {
    const mockFetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/status/buildinfo')) {
        return new Response(JSON.stringify({ status: 'success', data: { version: '2.53.0' } }), {
          status: 200,
        });
      }
      if (url.includes('/api/v1/query_range')) {
        return new Response(
          JSON.stringify({
            status: 'success',
            data: {
              resultType: 'matrix',
              result: [{ metric: {}, values: [[1700000000, '42.5']] }],
            },
          }),
          { status: 200 }
        );
      }
      if (url.includes('/api/v1/query')) {
        return new Response(
          JSON.stringify({
            status: 'success',
            data: {
              resultType: 'vector',
              result: [{ metric: {}, value: [1700000000, '51.25'] }],
            },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ status: 'error', error: 'unexpected path' }), {
        status: 404,
      });
    });

    vi.stubGlobal('fetch', mockFetch);
    try {
      const prom = new PrometheusService({
        prometheusUrl: 'http://prometheus.monitoring.svc:9090',
        prometheusBearerToken: undefined,
        prometheusTimeoutMs: 3000,
      });

      const telemetry = await prom.getTelemetry('15m');
      expect(telemetry.status).toBe('connected');
      expect(telemetry.current.cpuPercent).toBe(51.25);
      expect(telemetry.series).toHaveLength(1);
      expect(telemetry.series[0].cpu).toBe(42.5);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
