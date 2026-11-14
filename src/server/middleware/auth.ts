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
  authMethod?: 'bearer' | 'cookie' | 'anonymous';
  sessionCookieRaw?: string;
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

export function deriveCsrfToken(sessionCookieValue: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`csrf:${sessionCookieValue}`)
    .digest('base64url');
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

export function extractAuthFromHeaders(
  headers: { authorization?: string; cookie?: string },
  config: AppConfig
): AuthSession & { authMethod: 'bearer' | 'cookie' | 'anonymous'; sessionCookieRaw?: string } {
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
        authMethod: 'bearer',
      };
    }
  }

  const cookies = parseCookies(headers.cookie);
  const rawCookie = cookies[SESSION_COOKIE_NAME];
  const session = verifySessionCookie(rawCookie, config.sessionSecret);
  if (session && rawCookie) {
    return {
      authenticated: true,
      authMode: config.authMode,
      role: session.role,
      actorId: session.actorId,
      podExecEnabled: config.enablePodExec,
      demoModeEnabled: config.enableDemoMode,
      csrfToken: deriveCsrfToken(rawCookie, config.sessionSecret),
      authMethod: 'cookie',
      sessionCookieRaw: rawCookie,
    };
  }

  return {
    authenticated: false,
    authMode: config.authMode,
    role: 'viewer',
    actorId: 'anonymous-viewer',
    podExecEnabled: config.enablePodExec,
    demoModeEnabled: config.enableDemoMode,
    authMethod: 'anonymous',
  };
}

export function attachAuthMiddleware(config: AppConfig) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const extracted = extractAuthFromHeaders(
      {
        authorization: req.headers.authorization,
        cookie: req.headers.cookie,
      },
      config
    );
    const { authMethod, sessionCookieRaw, ...session } = extracted;
    req.auth = session;
    req.authMethod = authMethod;
    req.sessionCookieRaw = sessionCookieRaw;
    next();
  };
}

export function requireCsrfForCookieMutations(config: AppConfig, audit: AuditLogger) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      next();
      return;
    }
    if (req.path === '/auth/login') {
      next();
      return;
    }
    if (req.authMethod !== 'cookie' || !req.sessionCookieRaw) {
      next();
      return;
    }

    const supplied = req.headers['x-csrf-token'];
    const token = Array.isArray(supplied) ? supplied[0] : supplied;
    const expected = deriveCsrfToken(req.sessionCookieRaw, config.sessionSecret);

    if (!token || !safeEqual(token, expected)) {
      audit.record({
        actorId: req.auth?.actorId || 'unknown',
        actorRole: req.auth?.role || 'viewer',
        action: `${req.method} ${req.path}`,
        target: req.path,
        clusterId: 'global',
        outcome: 'denied',
        detail: 'Missing or invalid X-CSRF-Token header for cookie-authenticated mutation',
        ip: req.ip || 'unknown',
      });
      res.status(403).json({ error: 'Invalid or missing CSRF token.' });
      return;
    }

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
      res
        .status(401)
        .json({ error: 'Authentication required. Provide valid credentials or Bearer token.' });
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
        error: `Authentication required. Sign in with an ${minRole} or admin account to perform this action.`,
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
