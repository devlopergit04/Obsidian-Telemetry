import net from 'node:net';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import type { ClusterSnapshot, DataSourceMode, TimeWindow } from '../shared/types.ts';
import type { AppConfig } from './config.ts';
import {
  attachAuthMiddleware,
  requireRole,
  resolveTokenRole,
  SESSION_COOKIE_NAME,
  signSessionCookie,
  type AuthenticatedRequest,
} from './middleware/auth.ts';
import { AuditLogger } from './services/auditLogger.ts';
import { getDemoPodLogs, getDemoSnapshot } from './services/demoProvider.ts';
import { IncidentService } from './services/incidentService.ts';
import { KubernetesService } from './services/kubernetesService.ts';
import { PrometheusService } from './services/prometheusService.ts';

const TimeWindowSchema = z.enum(['15m', '1h', '6h', '24h']).default('15m');
const K8sNameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/, 'Invalid Kubernetes resource identifier');

const LoginBodySchema = z.object({
  token: z.string().min(1),
});

const ScaleBodySchema = z.object({
  replicas: z.number().int().min(0).max(200),
});

const PromQuerySchema = z.object({
  query: z.string().min(1).max(1024),
});

export interface AppServices {
  config: AppConfig;
  k8sService: KubernetesService;
  promService: PrometheusService;
  incidentService: IncidentService;
  auditLogger: AuditLogger;
}

export function extractClientIp(req: Request): string {
  const forwarded = req.headers.forwarded;
  if (typeof forwarded === 'string' && forwarded) {
    const match = forwarded.match(/for=(?:"\[([^\]]+)\](?::\d+)?"|"?([^;\s,"]+)"?)/i);
    const raw = match?.[1] || match?.[2];
    if (raw) {
      const candidate = raw.includes('.') ? raw.replace(/:\d+$/, '') : raw;
      if (net.isIP(candidate)) {
        return candidate;
      }
    }
  }
  const fallback = req.ip || req.socket.remoteAddress || '127.0.0.1';
  return net.isIP(fallback) ? fallback : '127.0.0.1';
}

export function createApp(services: AppServices): express.Express {
  const { config, k8sService, promService, incidentService, auditLogger } = services;
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
          cb(null, true);
          return;
        }
        cb(new Error('CORS origin denied'));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '64kb' }));

  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(extractClientIp(req)),
    message: { error: 'Rate limit exceeded. Please retry shortly.' },
  });
  app.use('/api', limiter);
  app.use(attachAuthMiddleware(config));

  // Health Check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'obsidian-telemetry',
      timestamp: new Date().toISOString(),
      kubernetesMode: config.kubeMode,
      prometheusConfigured: promService.isConfigured(),
      demoModeEnabled: config.enableDemoMode,
      podExecEnabled: config.enablePodExec,
    });
  });

  // Auth Session Routes
  app.get('/api/auth/session', (req: AuthenticatedRequest, res: Response) => {
    res.json(req.auth);
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const parsed = LoginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const resolved = resolveTokenRole(parsed.data.token.trim(), config);
    if (!resolved) {
      auditLogger.record({
        actorId: 'unauthenticated',
        actorRole: 'viewer',
        action: 'AUTH_LOGIN',
        target: 'session',
        clusterId: 'global',
        outcome: 'denied',
        detail: 'Invalid role token supplied',
        ip: req.ip || 'unknown',
      });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const cookieVal = signSessionCookie(
      {
        role: resolved.role,
        actorId: resolved.actorId,
        exp: Date.now() + 8 * 60 * 60 * 1000,
      },
      config.sessionSecret
    );

    res.cookie(SESSION_COOKIE_NAME, cookieVal, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.nodeEnv === 'production',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    auditLogger.record({
      actorId: resolved.actorId,
      actorRole: resolved.role,
      action: 'AUTH_LOGIN',
      target: 'session',
      clusterId: 'global',
      outcome: 'succeeded',
      detail: `Authenticated session established as ${resolved.role}`,
      ip: req.ip || 'unknown',
    });

    res.json({
      authenticated: true,
      authMode: config.authMode,
      role: resolved.role,
      actorId: resolved.actorId,
      podExecEnabled: config.enablePodExec,
      demoModeEnabled: config.enableDemoMode,
    });
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res: Response) => {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    auditLogger.record({
      actorId: req.auth?.actorId || 'anonymous',
      actorRole: req.auth?.role || 'viewer',
      action: 'AUTH_LOGOUT',
      target: 'session',
      clusterId: 'global',
      outcome: 'succeeded',
      detail: 'Session cookie cleared',
      ip: req.ip || 'unknown',
    });
    res.json({ ok: true });
  });

  // Snapshot Endpoint: Live Kubernetes + Prometheus OR Explicit Demo Mode OR Disconnected
  app.get(
    '/api/clusters/snapshot',
    requireRole('viewer', config, auditLogger),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const modeParam = typeof req.query.mode === 'string' ? req.query.mode : 'live';
        const contextParam = typeof req.query.context === 'string' ? req.query.context : undefined;
        const windowParsed = TimeWindowSchema.safeParse(req.query.window);
        const window: TimeWindow = windowParsed.success ? windowParsed.data : '15m';

        if (modeParam === 'demo') {
          if (!config.enableDemoMode) {
            res.status(403).json({ error: 'Demo mode is disabled on this server.' });
            return;
          }
          res.json(getDemoSnapshot(window));
          return;
        }

        const [k8sData, promTelemetry, promAlerts] = await Promise.all([
          k8sService.getSnapshot(contextParam),
          promService.getTelemetry(window),
          promService.getAlertRulesAndIncidents(),
        ]);

        let sourceMode: DataSourceMode = 'disconnected';
        if (k8sData.summary.kubernetesStatus === 'connected') {
          sourceMode = 'live';
        } else if (promTelemetry.status === 'connected') {
          sourceMode = 'live';
        }

        const mergedIncidents = incidentService.merge([
          ...promAlerts.incidents,
          ...k8sData.derivedIncidents,
        ]);

        const snapshot: ClusterSnapshot = {
          sourceMode,
          collectedAt: new Date().toISOString(),
          cluster: {
            ...k8sData.summary,
            prometheusStatus:
              promTelemetry.status === 'demo' ? 'disconnected' : promTelemetry.status,
            prometheusError: promTelemetry.error,
          },
          availableClusters: k8sData.availableClusters,
          rbac: k8sData.rbac,
          namespaces: k8sData.namespaces,
          nodes: k8sData.nodes,
          pods: k8sData.pods,
          deployments: k8sData.deployments,
          statefulSets: k8sData.statefulSets,
          daemonSets: k8sData.daemonSets,
          services: k8sData.services,
          ingresses: k8sData.ingresses,
          events: k8sData.events,
          pdbs: k8sData.pdbs,
          telemetry: promTelemetry,
          incidents: mergedIncidents,
          alertRules: promAlerts.rules,
        };

        res.json(snapshot);
      } catch (err) {
        next(err);
      }
    }
  );

  // Real PromQL Query Endpoint
  app.post(
    '/api/prometheus/query',
    requireRole('viewer', config, auditLogger),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = PromQuerySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Valid PromQL query string is required.' });
          return;
        }
        const result = await promService.executeQuery(parsed.data.query);
        res.status(result.status === 'success' ? 200 : 502).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // Pod Logs Retrieval
  app.get(
    '/api/namespaces/:namespace/pods/:pod/logs',
    requireRole('viewer', config, auditLogger),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const namespace = K8sNameSchema.parse(req.params.namespace);
        const pod = K8sNameSchema.parse(req.params.pod);
        const container =
          typeof req.query.container === 'string' && req.query.container
            ? K8sNameSchema.parse(req.query.container)
            : undefined;
        const tailLines = Math.min(1000, Math.max(10, Number(req.query.tailLines) || 200));
        const mode = typeof req.query.mode === 'string' ? req.query.mode : 'live';
        const context = typeof req.query.context === 'string' ? req.query.context : undefined;

        if (mode === 'demo') {
          if (!config.enableDemoMode) {
            res.status(403).json({ error: 'Demo mode disabled' });
            return;
          }
          res.json({ sourceMode: 'demo', logs: getDemoPodLogs(namespace, pod) });
          return;
        }

        const logs = await k8sService.getPodLogs(
          namespace,
          pod,
          container,
          tailLines,
          undefined,
          context
        );
        res.json({ sourceMode: 'live', logs });
      } catch (err) {
        next(err);
      }
    }
  );

  // Resource YAML Manifest Retrieval
  app.get(
    '/api/manifests/:kind/:name',
    requireRole('viewer', config, auditLogger),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const kind = z.enum(['node', 'pod', 'deployment', 'service']).parse(req.params.kind);
        const name = K8sNameSchema.parse(req.params.name);
        const namespace =
          typeof req.query.namespace === 'string' && req.query.namespace
            ? K8sNameSchema.parse(req.query.namespace)
            : undefined;
        const context = typeof req.query.context === 'string' ? req.query.context : undefined;
        const yaml = await k8sService.getResourceManifest(kind, name, namespace, context);
        res.json({ yaml });
      } catch (err) {
        next(err);
      }
    }
  );

  // Guard helper to block cluster mutations in Demo Mode
  const rejectDemoMutation = (req: Request, res: Response): boolean => {
    if (req.query.mode === 'demo' || req.body?.mode === 'demo') {
      res.status(400).json({
        error:
          'Cluster mutations are disabled in Demo Mode. Connect a real Kubernetes cluster to execute operations.',
      });
      return true;
    }
    return false;
  };

  // Node Cordon / Uncordon
  app.post(
    '/api/nodes/:name/cordon',
    requireRole('operator', config, auditLogger),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (rejectDemoMutation(req, res)) return;
      try {
        const nodeName = K8sNameSchema.parse(req.params.name);
        const context = typeof req.query.context === 'string' ? req.query.context : undefined;
        await k8sService.setNodeSchedulable(nodeName, true, context);
        auditLogger.record({
          actorId: req.auth!.actorId,
          actorRole: req.auth!.role,
          action: 'NODE_CORDON',
          target: `node/${nodeName}`,
          clusterId: context || 'default',
          outcome: 'succeeded',
          detail: 'Marked node unschedulable',
          ip: req.ip || 'unknown',
        });
        res.json({ ok: true, nodeName, unschedulable: true });
      } catch (err) {
        auditLogger.record({
          actorId: req.auth!.actorId,
          actorRole: req.auth!.role,
          action: 'NODE_CORDON',
          target: `node/${req.params.name}`,
          clusterId: 'default',
          outcome: 'failed',
          detail: err instanceof Error ? err.message : 'Failed to cordon node',
          ip: req.ip || 'unknown',
        });
        next(err);
      }
    }
  );

  app.post(
    '/api/nodes/:name/uncordon',
    requireRole('operator', config, auditLogger),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (rejectDemoMutation(req, res)) return;
      try {
        const nodeName = K8sNameSchema.parse(req.params.name);
        const context = typeof req.query.context === 'string' ? req.query.context : undefined;
        await k8sService.setNodeSchedulable(nodeName, false, context);
        auditLogger.record({
          actorId: req.auth!.actorId,
          actorRole: req.auth!.role,
          action: 'NODE_UNCORDON',
          target: `node/${nodeName}`,
          clusterId: context || 'default',
          outcome: 'succeeded',
          detail: 'Marked node schedulable',
          ip: req.ip || 'unknown',
        });
        res.json({ ok: true, nodeName, unschedulable: false });
      } catch (err) {
        next(err);
      }
    }
  );

  // Node Drain (PDB + Capacity checked)
  app.post(
    '/api/nodes/:name/drain',
    requireRole('operator', config, auditLogger),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (rejectDemoMutation(req, res)) return;
      try {
        const nodeName = K8sNameSchema.parse(req.params.name);
        const context = typeof req.query.context === 'string' ? req.query.context : undefined;
        const report = await k8sService.drainNode(nodeName, context);
        auditLogger.record({
          actorId: req.auth!.actorId,
          actorRole: req.auth!.role,
          action: 'NODE_DRAIN',
          target: `node/${nodeName}`,
          clusterId: context || 'default',
          outcome: report.failed.length > 0 ? 'failed' : 'succeeded',
          detail: `Evicted ${report.evicted.length}, skipped ${report.skipped.length}, failed ${report.failed.length}`,
          ip: req.ip || 'unknown',
        });
        res.status(report.failed.length > 0 ? 207 : 200).json(report);
      } catch (err) {
        auditLogger.record({
          actorId: req.auth!.actorId,
          actorRole: req.auth!.role,
          action: 'NODE_DRAIN',
          target: `node/${req.params.name}`,
          clusterId: 'default',
          outcome: 'failed',
          detail: err instanceof Error ? err.message : 'Drain rejected',
          ip: req.ip || 'unknown',
        });
        next(err);
      }
    }
  );

  // Pod Delete
  app.delete(
    '/api/namespaces/:namespace/pods/:pod',
    requireRole('operator', config, auditLogger),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (rejectDemoMutation(req, res)) return;
      try {
        const namespace = K8sNameSchema.parse(req.params.namespace);
        const pod = K8sNameSchema.parse(req.params.pod);
        const context = typeof req.query.context === 'string' ? req.query.context : undefined;
        await k8sService.deletePod(namespace, pod, context);
        auditLogger.record({
          actorId: req.auth!.actorId,
          actorRole: req.auth!.role,
          action: 'POD_DELETE',
          target: `pod/${namespace}/${pod}`,
          clusterId: context || 'default',
          outcome: 'succeeded',
          detail: 'Pod deletion requested via Kubernetes API',
          ip: req.ip || 'unknown',
        });
        res.json({ ok: true, namespace, pod });
      } catch (err) {
        next(err);
      }
    }
  );

  // Deployment Rollout Restart
  app.post(
    '/api/namespaces/:namespace/deployments/:name/restart',
    requireRole('operator', config, auditLogger),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (rejectDemoMutation(req, res)) return;
      try {
        const namespace = K8sNameSchema.parse(req.params.namespace);
        const name = K8sNameSchema.parse(req.params.name);
        const context = typeof req.query.context === 'string' ? req.query.context : undefined;
        await k8sService.restartDeployment(namespace, name, context);
        auditLogger.record({
          actorId: req.auth!.actorId,
          actorRole: req.auth!.role,
          action: 'DEPLOYMENT_RESTART',
          target: `deployment/${namespace}/${name}`,
          clusterId: context || 'default',
          outcome: 'succeeded',
          detail: 'Triggered rolling restart annotation patch',
          ip: req.ip || 'unknown',
        });
        res.json({ ok: true, namespace, name });
      } catch (err) {
        next(err);
      }
    }
  );

  // Deployment Scale
  app.post(
    '/api/namespaces/:namespace/deployments/:name/scale',
    requireRole('operator', config, auditLogger),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (rejectDemoMutation(req, res)) return;
      try {
        const namespace = K8sNameSchema.parse(req.params.namespace);
        const name = K8sNameSchema.parse(req.params.name);
        const parsed = ScaleBodySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'replicas must be an integer between 0 and 200' });
          return;
        }
        const context = typeof req.query.context === 'string' ? req.query.context : undefined;
        await k8sService.scaleDeployment(namespace, name, parsed.data.replicas, context);
        auditLogger.record({
          actorId: req.auth!.actorId,
          actorRole: req.auth!.role,
          action: 'DEPLOYMENT_SCALE',
          target: `deployment/${namespace}/${name}`,
          clusterId: context || 'default',
          outcome: 'succeeded',
          detail: `Scaled replicas to ${parsed.data.replicas}`,
          ip: req.ip || 'unknown',
        });
        res.json({ ok: true, namespace, name, replicas: parsed.data.replicas });
      } catch (err) {
        next(err);
      }
    }
  );

  // Incident Triage Acknowledgement (explicitly tracks operator triage without fabricating cluster healing)
  app.post(
    '/api/incidents/:id/acknowledge',
    requireRole('operator', config, auditLogger),
    (req: AuthenticatedRequest, res: Response) => {
      const incidentId = String(req.params.id || '').slice(0, 128);
      const state = incidentService.acknowledge(incidentId, req.auth!.actorId);
      auditLogger.record({
        actorId: req.auth!.actorId,
        actorRole: req.auth!.role,
        action: 'INCIDENT_ACK',
        target: incidentId,
        clusterId: 'global',
        outcome: 'succeeded',
        detail: 'Operator acknowledged incident',
        ip: req.ip || 'unknown',
      });
      res.json({ ok: true, incidentId, ...state });
    }
  );

  app.post(
    '/api/incidents/:id/resolve',
    requireRole('operator', config, auditLogger),
    (req: AuthenticatedRequest, res: Response) => {
      const incidentId = String(req.params.id || '').slice(0, 128);
      const state = incidentService.markResolvedLocally(incidentId, req.auth!.actorId);
      auditLogger.record({
        actorId: req.auth!.actorId,
        actorRole: req.auth!.role,
        action: 'INCIDENT_RESOLVE_TRIAGE',
        target: incidentId,
        clusterId: 'global',
        outcome: 'succeeded',
        detail: 'Operator marked triage resolved locally',
        ip: req.ip || 'unknown',
      });
      res.json({ ok: true, incidentId, ...state });
    }
  );

  // Audit Log Endpoint
  app.get(
    '/api/audit',
    requireRole('viewer', config, auditLogger),
    (req: Request, res: Response) => {
      const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 100));
      res.json({ entries: auditLogger.list(limit) });
    }
  );

  // Safe Error Handler (never leaks stack traces in production)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues.map((i) => i.message).join('; ') });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    const statusCode =
      message.includes('not found') || message.includes('NotFound')
        ? 404
        : message.includes('Forbidden') || message.includes('PodDisruptionBudget')
          ? 409
          : message.includes('No active Kubernetes')
            ? 503
            : 500;
    res.status(statusCode).json({ error: message });
  });

  return app;
}
