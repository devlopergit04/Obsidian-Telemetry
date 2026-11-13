import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthSession, UserRole } from '../../shared/types.ts';
import type { AppConfig } from '../config.ts';
import type { AuditLogger } from '../services/auditLogger.ts';

const ROLE_WEIGHT: Record<UserRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

export const SESSION_COOKIE_NAME = 'obsidian_session';

interface SessionPayload {
  role: UserRole;
  actorId: string;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthSession;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function resolveTokenRole(
  token: string,
  config: AppConfig
): { role: UserRole; actorId: string } | null {
  if (!token) return null;
  if (config.adminToken && safeEqual(token, config.adminToken)) {
    return { role: 'admin', actorId: 'token-admin' };
  }
  if (config.operatorToken && safeEqual(token, config.operatorToken)) {
    return { role: 'operator', actorId: 'token-operator' };
  }
  if (config.viewerToken && safeEqual(token, config.viewerToken)) {
    return { role: 'viewer', actorId: 'token-viewer' };
  }
  return null;
}

export function signSessionCookie(payload: SessionPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionCookie(
  raw: string | undefined,
  secret: string
): SessionPayload | null {
  if (!raw || !raw.includes('.')) return null;
  const [encoded, sig] = raw.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!safeEqual(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    if (!ROLE_WEIGHT[parsed.role]) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  }
  return out;
}

export function extractAuthFromHeaders(
  headers: { authorization?: string; cookie?: string },
  config: AppConfig
): AuthSession {
  const authHeader = headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const resolved = resolveTokenRole(token, config);
    if (resolved) {
      return {
        authenticated: true,
        authMode: config.authMode,
        role: resolved.role,
        actorId: resolved.actorId,
        podExecEnabled: config.enablePodExec,
        demoModeEnabled: config.enableDemoMode,
      };
    }
  }

  const cookies = parseCookies(headers.cookie);
  const session = verifySessionCookie(cookies[SESSION_COOKIE_NAME], config.sessionSecret);
  if (session) {
    return {
      authenticated: true,
      authMode: config.authMode,
      role: session.role,
      actorId: session.actorId,
      podExecEnabled: config.enablePodExec,
      demoModeEnabled: config.enableDemoMode,
    };
  }

  return {
    authenticated: false,
    authMode: config.authMode,
    role: 'viewer',
    actorId: 'anonymous-viewer',
    podExecEnabled: config.enablePodExec,
    demoModeEnabled: config.enableDemoMode,
  };
}

export function attachAuthMiddleware(config: AppConfig) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    req.auth = extractAuthFromHeaders(
      {
        authorization: req.headers.authorization,
        cookie: req.headers.cookie,
      },
      config
    );
    next();
  };
}

export function requireRole(minRole: UserRole, config: AppConfig, audit: AuditLogger) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Authentication context missing' });
      return;
    }

    if (config.authMode === 'token' && !auth.authenticated) {
      audit.record({
        actorId: auth.actorId,
        actorRole: auth.role,
        action: `${req.method} ${req.path}`,
        target: req.path,
        clusterId: typeof req.params.id === 'string' ? req.params.id : 'global',
        outcome: 'denied',
        detail: 'Unauthenticated request rejected under AUTH_MODE=token',
        ip: req.ip || 'unknown',
      });
      res.status(401).json({
        error: 'Authentication required. Provide a valid Bearer token or session cookie.',
      });
      return;
    }

    if (minRole !== 'viewer' && !auth.authenticated) {
      audit.record({
        actorId: auth.actorId,
        actorRole: auth.role,
        action: `${req.method} ${req.path}`,
        target: req.path,
        clusterId: typeof req.params.id === 'string' ? req.params.id : 'global',
        outcome: 'denied',
        detail: `Mutating operation requires authenticated ${minRole} role`,
        ip: req.ip || 'unknown',
      });
      res.status(401).json({
        error: `Authentication required. Sign in with an ${minRole} or admin token to perform this action.`,
      });
      return;
    }

    if (ROLE_WEIGHT[auth.role] < ROLE_WEIGHT[minRole]) {
      audit.record({
        actorId: auth.actorId,
        actorRole: auth.role,
        action: `${req.method} ${req.path}`,
        target: req.path,
        clusterId: typeof req.params.id === 'string' ? req.params.id : 'global',
        outcome: 'denied',
        detail: `Role '${auth.role}' insufficient; requires '${minRole}'`,
        ip: req.ip || 'unknown',
      });
      res.status(403).json({
        error: `Forbidden: requires '${minRole}' role (current role: '${auth.role}').`,
      });
      return;
    }

    next();
  };
}
