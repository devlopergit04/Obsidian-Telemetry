import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { PassThrough } from 'node:stream';
import * as k8s from '@kubernetes/client-node';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AppConfig } from '../config.ts';
import { extractAuthFromHeaders } from '../middleware/auth.ts';
import type { AuditLogger } from './auditLogger.ts';
import type { KubernetesService } from './kubernetesService.ts';

const SAFE_NAME_RE = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;

export function attachWebSocketHub(
  server: HttpServer,
  config: AppConfig,
  k8sService: KubernetesService,
  audit: AuditLogger
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (reqUrl.pathname !== '/ws/logs' && reqUrl.pathname !== '/ws/exec') {
      return;
    }

    const auth = extractAuthFromHeaders(
      {
        authorization: request.headers.authorization,
        cookie: request.headers.cookie,
      },
      config
    );

    if (config.authMode === 'token' && !auth.authenticated) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, reqUrl, auth);
    });
  });

  wss.on(
    'connection',
    async (
      ws: WebSocket,
      request: IncomingMessage,
      reqUrl: URL,
      auth: ReturnType<typeof extractAuthFromHeaders>
    ) => {
      const ip = request.socket.remoteAddress || 'unknown';
      const namespace = reqUrl.searchParams.get('namespace') || '';
      const pod = reqUrl.searchParams.get('pod') || '';
      const container = reqUrl.searchParams.get('container') || undefined;
      const context = reqUrl.searchParams.get('context') || undefined;

      if (!SAFE_NAME_RE.test(namespace) || !SAFE_NAME_RE.test(pod)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid namespace or pod identifier.' }));
        ws.close(1008, 'Invalid parameters');
        return;
      }

      if (reqUrl.pathname === '/ws/logs') {
        const kc = k8sService.getConnectionForExec(context);
        if (!kc) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'No active Kubernetes cluster connection for log streaming.',
            })
          );
          ws.close(1011, 'Cluster disconnected');
          return;
        }

        const logStreamer = new k8s.Log(kc);
        const logStream = new PassThrough();
        let abortCtrl: AbortController | null = null;

        logStream.on('data', (chunk: Buffer) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'log', data: chunk.toString('utf8') }));
          }
        });

        try {
          const targetContainer = container || (await resolveFirstContainer(kc, namespace, pod));
          abortCtrl = await logStreamer.log(namespace, pod, targetContainer, logStream, {
            follow: true,
            tailLines: 100,
            timestamps: true,
          });
          audit.record({
            actorId: auth.actorId,
            actorRole: auth.role,
            action: 'WS_LOG_STREAM',
            target: `${namespace}/${pod}`,
            clusterId: context || 'default',
            outcome: 'allowed',
            detail: `Started log stream for container ${targetContainer}`,
            ip,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unable to attach pod log stream';
          ws.send(JSON.stringify({ type: 'error', message: msg }));
          ws.close(1011, 'Log stream failed');
        }

        ws.on('close', () => {
          abortCtrl?.abort();
          logStream.destroy();
        });
        return;
      }

      // /ws/exec — strictly gated by ENABLE_POD_EXEC=true AND authenticated admin role
      if (reqUrl.pathname === '/ws/exec') {
        if (!config.enablePodExec) {
          audit.record({
            actorId: auth.actorId,
            actorRole: auth.role,
            action: 'WS_POD_EXEC',
            target: `${namespace}/${pod}`,
            clusterId: context || 'default',
            outcome: 'denied',
            detail: 'Pod exec rejected: ENABLE_POD_EXEC is false',
            ip,
          });
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Pod exec is disabled by server policy (ENABLE_POD_EXEC=false).',
            })
          );
          ws.close(1008, 'Exec disabled');
          return;
        }

        if (!auth.authenticated || auth.role !== 'admin') {
          audit.record({
            actorId: auth.actorId,
            actorRole: auth.role,
            action: 'WS_POD_EXEC',
            target: `${namespace}/${pod}`,
            clusterId: context || 'default',
            outcome: 'denied',
            detail: 'Pod exec rejected: requires authenticated admin role',
            ip,
          });
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Forbidden: authenticated admin role required for pod exec.',
            })
          );
          ws.close(1008, 'Forbidden');
          return;
        }

        const kc = k8sService.getConnectionForExec(context);
        if (!kc) {
          ws.send(
            JSON.stringify({ type: 'error', message: 'No active Kubernetes cluster connection.' })
          );
          ws.close(1011, 'Cluster disconnected');
          return;
        }

        const targetContainer = container || (await resolveFirstContainer(kc, namespace, pod));
        const execClient = new k8s.Exec(kc);
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const stdin = new PassThrough();

        stdout.on('data', (chunk: Buffer) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'stdout', data: chunk.toString('utf8') }));
          }
        });
        stderr.on('data', (chunk: Buffer) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'stderr', data: chunk.toString('utf8') }));
          }
        });

        let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
        let k8sWs: { close: () => void } | null = null;

        try {
          k8sWs = await execClient.exec(
            namespace,
            pod,
            targetContainer,
            ['/bin/sh'],
            stdout,
            stderr,
            stdin,
            true,
            (status) => {
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'status', status }));
              }
            }
          );

          audit.record({
            actorId: auth.actorId,
            actorRole: auth.role,
            action: 'WS_POD_EXEC',
            target: `${namespace}/${pod}/${targetContainer}`,
            clusterId: context || 'default',
            outcome: 'allowed',
            detail: `Exec session opened (timeout=${config.execTimeoutMs}ms)`,
            ip,
          });

          timeoutTimer = setTimeout(() => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: 'Exec session timed out.' }));
              ws.close(1000, 'Session timeout');
            }
          }, config.execTimeoutMs);

          ws.on('message', (raw) => {
            try {
              const parsed = JSON.parse(String(raw)) as { type?: string; data?: string };
              if (parsed.type === 'stdin' && typeof parsed.data === 'string') {
                stdin.write(parsed.data);
              }
            } catch {
              // Ignore malformed frames
            }
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Kubernetes exec handshake failed';
          audit.record({
            actorId: auth.actorId,
            actorRole: auth.role,
            action: 'WS_POD_EXEC',
            target: `${namespace}/${pod}`,
            clusterId: context || 'default',
            outcome: 'failed',
            detail: msg,
            ip,
          });
          ws.send(JSON.stringify({ type: 'error', message: msg }));
          ws.close(1011, 'Exec failed');
        }

        ws.on('close', () => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          k8sWs?.close();
          stdout.destroy();
          stderr.destroy();
          stdin.destroy();
        });
      }
    }
  );

  return wss;
}

async function resolveFirstContainer(
  kc: k8s.KubeConfig,
  namespace: string,
  podName: string
): Promise<string> {
  const coreApi = kc.makeApiClient(k8s.CoreV1Api);
  const pod = await coreApi.readNamespacedPod({ name: podName, namespace });
  return pod.spec?.containers?.[0]?.name || '';
}
