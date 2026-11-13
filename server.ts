import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './src/server/app.ts';
import { loadConfig } from './src/server/config.ts';
import { getReachableUrls } from './src/server/platform.ts';
import { AuditLogger } from './src/server/services/auditLogger.ts';
import { IncidentService } from './src/server/services/incidentService.ts';
import { KubernetesService } from './src/server/services/kubernetesService.ts';
import { PrometheusService } from './src/server/services/prometheusService.ts';
import { StateStore } from './src/server/services/stateStore.ts';
import { attachWebSocketHub } from './src/server/services/wsHub.ts';

function parseServerCliArgs(argv: string[]): { host?: string; port?: string } {
  const result: { host?: string; port?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === '--port' || arg === '-p') && argv[i + 1]) {
      result.port = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--port=')) {
      result.port = arg.slice('--port='.length);
    } else if ((arg === '--host' || arg === '-H') && argv[i + 1]) {
      result.host = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--host=')) {
      result.host = arg.slice('--host='.length);
    }
  }
  return result;
}

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [currentDir, path.resolve(currentDir, '..'), process.cwd()];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
  }
  return process.cwd();
}

function readPackageVersion(packageRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

export async function bootstrap(): Promise<void> {
  const cliArgs = parseServerCliArgs(process.argv.slice(2));
  const envOverrides: Record<string, string | undefined> = { ...process.env };
  if (cliArgs.port) {
    envOverrides.OT_PORT = cliArgs.port;
  }
  if (cliArgs.host) {
    envOverrides.OT_HOST = cliArgs.host;
  }

  const config = loadConfig(envOverrides);
  const store = new StateStore(config.paths);
  const k8sService = new KubernetesService(config);
  const promService = new PrometheusService(config);
  const incidentService = new IncidentService(store);
  const auditLogger = new AuditLogger(250, store);
  const packageRoot = resolvePackageRoot();
  const appVersion = readPackageVersion(packageRoot);

  const app = createApp({
    config,
    k8sService,
    promService,
    incidentService,
    auditLogger,
    stateStore: store,
  });

  const server = http.createServer(app);
  const wss = attachWebSocketHub(server, config, k8sService, auditLogger);

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
    const distCandidates = [path.join(packageRoot, 'dist'), path.resolve(process.cwd(), 'dist')];
    const distDir = distCandidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
    if (distDir) {
      app.use(express.static(distDir));
      app.get('/{*splat}', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Error: Port ${config.port} on ${config.host} is already in use. Stop the existing process or choose another port with OT_PORT=<port> / --port <port>.`
      );
      process.exit(1);
    }
    if (err.code === 'EACCES') {
      console.error(
        `Error: Permission denied binding to ${config.host}:${config.port}. Choose a port above 1024 or grant socket permissions.`
      );
      process.exit(1);
    }
    console.error('Server listen error:', err.message);
    process.exit(1);
  });

  const isManagedOrProd =
    config.nodeEnv === 'production' ||
    Boolean(envOverrides.OT_MANAGED) ||
    Boolean(envOverrides.OT_HOME);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    if (isManagedOrProd) {
      const currentPid = store.readPid();
      if (currentPid?.pid === process.pid) {
        store.clearPid();
      }
    }

    for (const client of wss.clients) {
      try {
        client.close(1001, `Server shutting down (${signal})`);
      } catch {
        // Ignore socket cleanup errors
      }
    }
    wss.close();

    const forceTimer = setTimeout(() => {
      process.exit(0);
    }, 5000);
    forceTimer.unref();

    server.close(() => {
      clearTimeout(forceTimer);
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  server.listen(config.port, config.host, () => {
    if (isManagedOrProd) {
      store.writePid({
        pid: process.pid,
        host: config.host,
        port: config.port,
        startedAt: new Date().toISOString(),
        version: appVersion,
        nodeVersion: process.version,
      });
    }

    const urls = getReachableUrls(config.host, config.port);
    const primaryUrl = urls[0] || `http://localhost:${config.port}`;

    console.log('Obsidian Telemetry\n');
    console.log('Status: Running');
    console.log(`Host: ${config.host}`);
    console.log(`Port: ${config.port}\n`);
    console.log(`Dashboard: ${primaryUrl}`);
    if (urls.length > 1) {
      for (const extraUrl of urls.slice(1)) {
        console.log(`Network:   ${extraUrl}`);
      }
    }
    console.log(`Auth Mode: ${config.authMode}`);

    if (config.generatedAdminPassword) {
      console.log('');
      console.log('Initial Administrator Credentials (shown once):');
      console.log('  Username: admin');
      console.log(`  Password: ${config.generatedAdminPassword}`);
      console.log(`  Stored:   ${config.paths.credentialsFile}`);
      console.log('  Change this password after signing in via the Session panel.');
    }
  });
}

bootstrap().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
