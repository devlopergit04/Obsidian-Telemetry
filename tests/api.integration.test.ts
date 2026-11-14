import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { loadConfig } from '../src/server/config.ts';
import { AuditLogger } from '../src/server/services/auditLogger.ts';
import { IncidentService } from '../src/server/services/incidentService.ts';
import { KubernetesService } from '../src/server/services/kubernetesService.ts';
import { PrometheusService } from '../src/server/services/prometheusService.ts';
import { StateStore } from '../src/server/services/stateStore.ts';

function buildTestApp(envOverrides: Record<string, string> = {}, store?: StateStore) {
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
  const incidentService = new IncidentService(store);
  const auditLogger = new AuditLogger(250, store);

  return {
    config,
    k8sService,
    promService,
    auditLogger,
    app: createApp({
      config,
      k8sService,
      promService,
      incidentService,
      auditLogger,
      stateStore: store,
    }),
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

    const unauth = await request(app).get('/api/clusters/snapshot');
    expect(unauth.status).toBe(401);

    const badLogin = await request(app).post('/api/auth/login').send({ token: 'wrong-token' });
    expect(badLogin.status).toBe(401);

    const agent = request.agent(app);
    const okLogin = await agent.post('/api/auth/login').send({ token: 'operator-token-test' });
    expect(okLogin.status).toBe(200);
    expect(okLogin.body.role).toBe('operator');
    expect(okLogin.body.csrfToken).toBeTruthy();
    expect(okLogin.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(okLogin.headers['set-cookie']?.[0]).not.toContain('; Secure');

    const sessionRes = await agent.get('/api/auth/session');
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.authenticated).toBe(true);
    expect(sessionRes.body.role).toBe('operator');
    expect(sessionRes.body.csrfToken).toBe(okLogin.body.csrfToken);
  });

  it('supports local username/password authentication, CSRF validation, and password updates', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-api-auth-'));
    try {
      const baseCfg = loadConfig({
        NODE_ENV: 'production',
        OT_HOME: tmpHome,
        OT_ADMIN_PASSWORD: 'initial-password-123',
        KUBE_MODE: 'disabled',
      });
      const store = new StateStore(baseCfg.paths);
      const { app } = buildTestApp(
        {
          NODE_ENV: 'production',
          OT_HOME: tmpHome,
          KUBE_MODE: 'disabled',
        },
        store
      );

      const agent = request.agent(app);
      const badCreds = await agent
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrong' });
      expect(badCreds.status).toBe(401);

      const okCreds = await agent
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'initial-password-123' });
      expect(okCreds.status).toBe(200);
      expect(okCreds.body.actorId).toBe('admin');
      expect(okCreds.body.role).toBe('admin');
      expect(okCreds.headers['set-cookie']?.[0]).not.toContain('; Secure');

      const csrfToken = okCreds.body.csrfToken as string;

      // Cookie-authenticated mutation without CSRF token is rejected (403)
      const missingCsrf = await agent.post('/api/incidents/INC-99/acknowledge');
      expect(missingCsrf.status).toBe(403);

      // Cookie-authenticated mutation with valid X-CSRF-Token succeeds
      const withCsrf = await agent
        .post('/api/incidents/INC-99/acknowledge')
        .set('X-CSRF-Token', csrfToken);
      expect(withCsrf.status).toBe(200);
      expect(withCsrf.body.acknowledged).toBe(true);

      // Password change requires valid CSRF and currentPassword
      const passRes = await agent.post('/api/auth/password').set('X-CSRF-Token', csrfToken).send({
        currentPassword: 'initial-password-123',
        newPassword: 'rotated-password-456',
      });
      expect(passRes.status).toBe(200);

      // Verify new password works on fresh login with HTTPS proxy header setting Secure cookie
      const freshAgent = request.agent(app);
      const relogin = await freshAgent
        .post('/api/auth/login')
        .set('X-Forwarded-Proto', 'https')
        .send({ username: 'admin', password: 'rotated-password-456' });
      expect(relogin.status).toBe(200);
      expect(relogin.headers['set-cookie']?.[0]).toContain('; Secure');
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
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

    const disabledDemo = buildTestApp({ AUTH_MODE: 'optional', ENABLE_DEMO_MODE: 'false' });
    const forbiddenDemo = await request(disabledDemo.app).get('/api/clusters/snapshot?mode=demo');
    expect(forbiddenDemo.status).toBe(403);
  });

  it('enforces RBAC on mutating Kubernetes routes, blocks demo mutations, and audits calls', async () => {
    const { app, k8sService, auditLogger } = buildTestApp();
    const cordonSpy = vi.spyOn(k8sService, 'setNodeSchedulable').mockResolvedValue();

    const viewerRes = await request(app)
      .post('/api/nodes/worker-01/cordon')
      .set('Authorization', 'Bearer viewer-token-test');
    expect(viewerRes.status).toBe(403);

    const demoMutation = await request(app)
      .post('/api/nodes/worker-01/cordon?mode=demo')
      .set('Authorization', 'Bearer admin-token-test');
    expect(demoMutation.status).toBe(400);

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
      expect(res.headers['cache-control']).toBe('no-store');
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it('enforces brute-force lockout (429 + Retry-After) after 5 consecutive failures and rotates CSRF on password change', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-api-bruteforce-'));
    try {
      const baseCfg = loadConfig({
        NODE_ENV: 'production',
        OT_HOME: tmpHome,
        OT_ADMIN_PASSWORD: 'correct-password-999',
        KUBE_MODE: 'disabled',
      });
      const store = new StateStore(baseCfg.paths);
      const { app } = buildTestApp(
        {
          NODE_ENV: 'production',
          OT_HOME: tmpHome,
          KUBE_MODE: 'disabled',
        },
        store
      );

      for (let i = 0; i < 5; i += 1) {
        const failRes = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', '198.51.100.25')
          .send({ username: 'admin', password: 'wrong-password' });
        expect(failRes.status).toBe(401);
      }

      const lockedRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '198.51.100.25')
        .send({ username: 'admin', password: 'correct-password-999' });
      expect(lockedRes.status).toBe(429);
      expect(Number(lockedRes.headers['retry-after'])).toBeGreaterThan(0);

      // Separate client IP can still authenticate and rotate CSRF token on password change
      const agent = request.agent(app);
      const loginRes = await agent
        .post('/api/auth/login')
        .set('X-Forwarded-For', '198.51.100.99')
        .send({ username: 'admin', password: 'correct-password-999' });
      expect(loginRes.status).toBe(200);
      const initialCsrf = loginRes.body.csrfToken as string;

      const passRes = await agent
        .post('/api/auth/password')
        .set('X-Forwarded-For', '198.51.100.99')
        .set('X-CSRF-Token', initialCsrf)
        .send({
          currentPassword: 'correct-password-999',
          newPassword: 'rotated-strong-pass-123',
        });
      expect(passRes.status).toBe(200);
      expect(passRes.body.csrfToken).toBeTruthy();
      expect(passRes.body.csrfToken).not.toBe(initialCsrf);

      // Subsequent cookie mutation using rotated CSRF token succeeds
      const ackRes = await agent
        .post('/api/incidents/INC-ROTATE/acknowledge')
        .set('X-Forwarded-For', '198.51.100.99')
        .set('X-CSRF-Token', passRes.body.csrfToken as string);
      expect(ackRes.status).toBe(200);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});
