import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createApp } from './src/server/app.ts';
import { loadConfig } from './src/server/config.ts';
import { AuditLogger } from './src/server/services/auditLogger.ts';
import { IncidentService } from './src/server/services/incidentService.ts';
import { KubernetesService } from './src/server/services/kubernetesService.ts';
import { PrometheusService } from './src/server/services/prometheusService.ts';
import { attachWebSocketHub } from './src/server/services/wsHub.ts';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const k8sService = new KubernetesService(config);
  const promService = new PrometheusService(config);
  const incidentService = new IncidentService();
  const auditLogger = new AuditLogger();

  const app = createApp({
    config,
    k8sService,
    promService,
    incidentService,
    auditLogger,
  });

  const server = http.createServer(app);
  attachWebSocketHub(server, config, k8sService, auditLogger);

  if (config.nodeEnv !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server },
      },
      appType: 'spa',
    });
    if (hmrDisabled) {
      app.get('/@vite/client', async (_req, res, next) => {
        try {
          const transformed = await vite.transformRequest('/@vite/client');
          if (!transformed) {
            next();
            return;
          }
          const patched = transformed.code.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR WebSocket disabled (DISABLE_HMR=true) */'
          );
          res.setHeader('Content-Type', 'application/javascript');
          res.send(patched);
        } catch (err) {
          next(err);
        }
      });
    }
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('/{*splat}', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  server.listen(config.port, '0.0.0.0', () => {
    console.log(
      `Obsidian Telemetry listening on http://0.0.0.0:${config.port} (env=${config.nodeEnv}, kubeMode=${config.kubeMode}, authMode=${config.authMode})`
    );
  });
}

bootstrap().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
