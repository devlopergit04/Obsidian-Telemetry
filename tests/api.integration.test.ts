import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { loadConfig } from '../src/server/config.ts';
import { AuditLogger } from '../src/server/services/auditLogger.ts';
import { IncidentService } from '../src/server/services/incidentService.ts';
import { KubernetesService } from '../src/server/services/kubernetesService.ts';
import { PrometheusService } from '../src/server/services/prometheusService.ts';

function buildTestApp(envOverrides: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    AUTH_MODE: 'token',
    OBSIDIAN_ADMIN_TOKEN: 'admin-token-test',
    OBSIDIAN_OPERATOR_TOKEN: 'operator-token-test',
    OBSIDIAN_VIEWER_TOKEN: 'viewer-token-test',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    KUBE_MODE: 'disabled',
    ENABLE_DEMO_MODE: 'true',
    ...envOverrides,
  });

  const k8sService = new KubernetesService(config);
  const promService = new PrometheusService(config);
  const incidentService = new IncidentService();
  const auditLogger = new AuditLogger();

  return {
    config,
    k8sService,
    promService,
    auditLogger,
    app: createApp({ config, k8sService, promService, incidentService, auditLogger }),
  };
}

describe('API Integration & RBAC Tests', () => {
  it('returns health status without exposing secrets', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('obsidian-telemetry');
    expect(res.body.kubernetesMode).toBe('disabled');
    expect(JSON.stringify(res.body)).not.toContain('admin-token-test');
  });

  it('enforces AUTH_MODE=token and issues HttpOnly session cookies on login', async () => {
    const { app } = buildTestApp();

    // Unauthenticated snapshot blocked
    const unauth = await request(app).get('/api/clusters/snapshot');
    expect(unauth.status).toBe(401);

    // Invalid token rejected
    const badLogin = await request(app).post('/api/auth/login').send({ token: 'wrong-token' });
    expect(badLogin.status).toBe(401);

    // Valid operator login sets HttpOnly cookie
    const agent = request.agent(app);
    const okLogin = await agent.post('/api/auth/login').send({ token: 'operator-token-test' });
    expect(okLogin.status).toBe(200);
    expect(okLogin.body.role).toBe('operator');
    expect(okLogin.headers['set-cookie']?.[0]).toContain('HttpOnly');

    const sessionRes = await agent.get('/api/auth/session');
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.authenticated).toBe(true);
    expect(sessionRes.body.role).toBe('operator');
  });

  it('distinguishes disconnected vs explicitly labeled demo snapshots', async () => {
    const { app } = buildTestApp({ AUTH_MODE: 'optional' });

    const liveDisconnected = await request(app).get('/api/clusters/snapshot?mode=live');
    expect(liveDisconnected.status).toBe(200);
    expect(liveDisconnected.body.sourceMode).toBe('disconnected');
    expect(liveDisconnected.body.nodes).toEqual([]);

    const demoSnapshot = await request(app).get('/api/clusters/snapshot?mode=demo');
    expect(demoSnapshot.status).toBe(200);
    expect(demoSnapshot.body.sourceMode).toBe('demo');
    expect(demoSnapshot.body.nodes.length).toBeGreaterThan(0);

    // Disabled demo mode returns 403
    const disabledDemo = buildTestApp({ AUTH_MODE: 'optional', ENABLE_DEMO_MODE: 'false' });
    const forbiddenDemo = await request(disabledDemo.app).get('/api/clusters/snapshot?mode=demo');
    expect(forbiddenDemo.status).toBe(403);
  });

  it('enforces RBAC on mutating Kubernetes routes, blocks demo mutations, and audits calls', async () => {
    const { app, k8sService, auditLogger } = buildTestApp();
    const cordonSpy = vi.spyOn(k8sService, 'setNodeSchedulable').mockResolvedValue();

    // Viewer cannot cordon node
    const viewerRes = await request(app)
      .post('/api/nodes/worker-01/cordon')
      .set('Authorization', 'Bearer viewer-token-test');
    expect(viewerRes.status).toBe(403);

    // Demo mode mutation blocked even for admin
    const demoMutation = await request(app)
      .post('/api/nodes/worker-01/cordon?mode=demo')
      .set('Authorization', 'Bearer admin-token-test');
    expect(demoMutation.status).toBe(400);

    // Operator can cordon live node and audit trail records it
    const opRes = await request(app)
      .post('/api/nodes/worker-01/cordon')
      .set('Authorization', 'Bearer operator-token-test');
    expect(opRes.status).toBe(200);
    expect(cordonSpy).toHaveBeenCalledWith('worker-01', true, undefined);

    const auditEntries = auditLogger.list(10);
    expect(auditEntries[0].action).toBe('NODE_CORDON');
    expect(auditEntries[0].outcome).toBe('succeeded');
    expect(auditEntries[0].actorRole).toBe('operator');
  });

  it('validates scale replicas and PromQL query inputs with Zod', async () => {
    const { app } = buildTestApp();

    const badScale = await request(app)
      .post('/api/namespaces/default/deployments/api/scale')
      .set('Authorization', 'Bearer operator-token-test')
      .send({ replicas: 999 });
    expect(badScale.status).toBe(400);

    const emptyProm = await request(app)
      .post('/api/prometheus/query')
      .set('Authorization', 'Bearer viewer-token-test')
      .send({ query: '' });
    expect(emptyProm.status).toBe(400);

    const disconnectedProm = await request(app)
      .post('/api/prometheus/query')
      .set('Authorization', 'Bearer viewer-token-test')
      .send({ query: 'up' });
    expect(disconnectedProm.status).toBe(502);
    expect(disconnectedProm.body.status).toBe('error');
  });

  it('handles X-Forwarded-For and Forwarded proxy headers without express-rate-limit ValidationErrors', async () => {
    const { app } = buildTestApp();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', '203.0.113.42')
        .set('Forwarded', 'for=203.0.113.42;proto=https');
      expect(res.status).toBe(200);
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});
