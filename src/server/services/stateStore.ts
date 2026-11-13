import crypto from 'node:crypto';
import fs from 'node:fs';
import type { AuditEntry, UserRole } from '../../shared/types.ts';
import { ensureDirSync, type PlatformPaths, writeFileAtomicSync } from '../platform.ts';

const CURRENT_SCHEMA_VERSION = 1;
const MAX_AUDIT_LINES = 2500;

export interface PersistedConfig {
  schemaVersion: number;
  host?: string;
  port?: number;
  authMode?: 'token' | 'optional';
  kubeMode?: 'auto' | 'kubeconfig' | 'incluster' | 'token' | 'disabled';
  prometheusUrl?: string;
  enablePodExec?: boolean;
  enableDemoMode?: boolean;
}

export interface StoredUserRecord {
  role: UserRole;
  passwordHash: string;
  updatedAt: string;
}

export interface PersistedCredentials {
  schemaVersion: number;
  sessionSecret: string;
  users: Record<string, StoredUserRecord>;
}

export interface PersistedAckState {
  acknowledged: boolean;
  acknowledgedBy: string;
  acknowledgedAt: string;
  resolvedLocally: boolean;
}

export interface PersistedAppState {
  schemaVersion: number;
  incidentAcks: Record<string, PersistedAckState>;
}

export interface RuntimePidInfo {
  pid: number;
  host: string;
  port: number;
  startedAt: string;
  version: string;
  nodeVersion: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hexHash] = parts;
  if (!salt || !hexHash) return false;
  try {
    const expected = Buffer.from(hexHash, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export class StateStore {
  readonly paths: PlatformPaths;

  constructor(paths: PlatformPaths) {
    this.paths = paths;
  }

  private readJsonWithMigration<T extends { schemaVersion?: number }>(
    filePath: string,
    defaultValue: () => T
  ): T {
    if (!fs.existsSync(filePath)) {
      return defaultValue();
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as T;
      if (
        typeof parsed.schemaVersion === 'number' &&
        parsed.schemaVersion < CURRENT_SCHEMA_VERSION
      ) {
        writeFileAtomicSync(`${filePath}.bak`, raw, 0o600);
        parsed.schemaVersion = CURRENT_SCHEMA_VERSION;
        writeFileAtomicSync(filePath, JSON.stringify(parsed, null, 2), 0o600);
      }
      return parsed;
    } catch {
      return defaultValue();
    }
  }

  loadConfig(): PersistedConfig {
    return this.readJsonWithMigration<PersistedConfig>(this.paths.configFile, () => ({
      schemaVersion: CURRENT_SCHEMA_VERSION,
    }));
  }

  saveConfig(cfg: Partial<PersistedConfig>): PersistedConfig {
    const existing = this.loadConfig();
    const next: PersistedConfig = {
      ...existing,
      ...cfg,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
    writeFileAtomicSync(this.paths.configFile, JSON.stringify(next, null, 2), 0o600);
    return next;
  }

  loadCredentials(): PersistedCredentials {
    return this.readJsonWithMigration<PersistedCredentials>(this.paths.credentialsFile, () => ({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sessionSecret: crypto.randomBytes(32).toString('hex'),
      users: {},
    }));
  }

  ensureCredentials(bootstrapEnvPassword?: string): {
    credentials: PersistedCredentials;
    generatedAdminPassword?: string;
  } {
    const existed = fs.existsSync(this.paths.credentialsFile);
    const creds = this.loadCredentials();
    let changed = !existed;
    let generatedAdminPassword: string | undefined;

    if (!creds.sessionSecret || creds.sessionSecret.length < 32) {
      creds.sessionSecret = crypto.randomBytes(32).toString('hex');
      changed = true;
    }

    if (Object.keys(creds.users).length === 0) {
      const initialPassword =
        bootstrapEnvPassword?.trim() || crypto.randomBytes(15).toString('base64url');
      if (!bootstrapEnvPassword?.trim()) {
        generatedAdminPassword = initialPassword;
      }
      creds.users.admin = {
        role: 'admin',
        passwordHash: hashPassword(initialPassword),
        updatedAt: new Date().toISOString(),
      };
      changed = true;
    }

    if (changed) {
      writeFileAtomicSync(this.paths.credentialsFile, JSON.stringify(creds, null, 2), 0o600);
    }

    return { credentials: creds, generatedAdminPassword };
  }

  verifyUserLogin(username: string, password: string): { username: string; role: UserRole } | null {
    const normalized = username.trim().toLowerCase();
    if (!normalized || !password) return null;
    const creds = this.loadCredentials();
    const record = creds.users[normalized];
    if (!record) return null;
    if (!verifyPassword(password, record.passwordHash)) return null;
    return { username: normalized, role: record.role };
  }

  setUserPassword(username: string, newPassword: string, role?: UserRole): void {
    const normalized = username.trim().toLowerCase();
    const creds = this.loadCredentials();
    const existing = creds.users[normalized];
    creds.users[normalized] = {
      role: role || existing?.role || 'admin',
      passwordHash: hashPassword(newPassword),
      updatedAt: new Date().toISOString(),
    };
    writeFileAtomicSync(this.paths.credentialsFile, JSON.stringify(creds, null, 2), 0o600);
  }

  loadState(): PersistedAppState {
    return this.readJsonWithMigration<PersistedAppState>(this.paths.stateFile, () => ({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      incidentAcks: {},
    }));
  }

  saveIncidentAcks(acks: Record<string, PersistedAckState>): void {
    const state = this.loadState();
    const next: PersistedAppState = {
      ...state,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      incidentAcks: acks,
    };
    writeFileAtomicSync(this.paths.stateFile, JSON.stringify(next, null, 2), 0o600);
  }

  appendAuditEntry(entry: AuditEntry): void {
    ensureDirSync(this.paths.dataDir);
    fs.appendFileSync(this.paths.auditFile, `${JSON.stringify(entry)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  loadAuditEntries(limit = 250): AuditEntry[] {
    if (!fs.existsSync(this.paths.auditFile)) return [];
    try {
      const lines = fs
        .readFileSync(this.paths.auditFile, 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0);
      if (lines.length > MAX_AUDIT_LINES) {
        const trimmed = lines.slice(-MAX_AUDIT_LINES);
        writeFileAtomicSync(this.paths.auditFile, `${trimmed.join('\n')}\n`, 0o600);
      }
      const parsed: AuditEntry[] = [];
      for (const line of lines.slice(-limit)) {
        try {
          parsed.push(JSON.parse(line) as AuditEntry);
        } catch {
          // Skip malformed lines safely
        }
      }
      return parsed.reverse();
    } catch {
      return [];
    }
  }

  writePid(info: RuntimePidInfo): void {
    writeFileAtomicSync(this.paths.pidFile, JSON.stringify(info, null, 2), 0o600);
  }

  readPid(): RuntimePidInfo | null {
    if (!fs.existsSync(this.paths.pidFile)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.paths.pidFile, 'utf8')) as RuntimePidInfo;
    } catch {
      return null;
    }
  }

  clearPid(): void {
    try {
      if (fs.existsSync(this.paths.pidFile)) {
        fs.unlinkSync(this.paths.pidFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
