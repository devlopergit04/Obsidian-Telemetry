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

export interface BackupBundle {
  format: 'obsidian-telemetry-backup';
  schemaVersion: number;
  createdAt: string;
  checksumSha256: string;
  payload: {
    config: PersistedConfig | null;
    credentials: PersistedCredentials | null;
    state: PersistedAppState | null;
    auditLines: string[];
  };
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

function computeBackupChecksum(payload: BackupBundle['payload']): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

export class StateStore {
  readonly paths: PlatformPaths;

  constructor(paths: PlatformPaths) {
    this.paths = paths;
  }

  private preserveCorruptFile(filePath: string, raw: string): void {
    try {
      const corruptPath = `${filePath}.corrupt.${Date.now()}`;
      writeFileAtomicSync(corruptPath, raw, 0o600);
    } catch {
      // Ignore preservation failures if filesystem is read-only
    }
  }

  private writeJsonWithBackup<T>(filePath: string, nextValue: T): void {
    if (fs.existsSync(filePath)) {
      try {
        const previous = fs.readFileSync(filePath, 'utf8');
        JSON.parse(previous);
        writeFileAtomicSync(`${filePath}.bak`, previous, 0o600);
      } catch {
        // Do not overwrite good .bak with corrupt primary data
      }
    }
    writeFileAtomicSync(filePath, JSON.stringify(nextValue, null, 2), 0o600);
  }

  private readJsonWithMigration<T extends { schemaVersion?: number }>(
    filePath: string,
    defaultValue: () => T
  ): T {
    if (!fs.existsSync(filePath)) {
      return defaultValue();
    }

    let raw = '';
    try {
      raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as T;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Parsed state is not an object');
      }
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
      if (raw) {
        this.preserveCorruptFile(filePath, raw);
      }
      const bakPath = `${filePath}.bak`;
      if (fs.existsSync(bakPath)) {
        try {
          const bakRaw = fs.readFileSync(bakPath, 'utf8');
          const recovered = JSON.parse(bakRaw) as T;
          if (recovered && typeof recovered === 'object') {
            recovered.schemaVersion = CURRENT_SCHEMA_VERSION;
            writeFileAtomicSync(filePath, JSON.stringify(recovered, null, 2), 0o600);
            return recovered;
          }
        } catch {
          // Backup file also unreadable; fall back cleanly to defaults
        }
      }
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
    this.writeJsonWithBackup(this.paths.configFile, next);
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

    if (!creds.users || typeof creds.users !== 'object') {
      creds.users = {};
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
      this.writeJsonWithBackup(this.paths.credentialsFile, creds);
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
    this.writeJsonWithBackup(this.paths.credentialsFile, creds);
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
    this.writeJsonWithBackup(this.paths.stateFile, next);
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

  exportBackup(outputFile: string): BackupBundle {
    const auditLines = fs.existsSync(this.paths.auditFile)
      ? fs
          .readFileSync(this.paths.auditFile, 'utf8')
          .split('\n')
          .filter((l) => l.trim().length > 0)
      : [];

    const payload: BackupBundle['payload'] = {
      config: fs.existsSync(this.paths.configFile) ? this.loadConfig() : null,
      credentials: fs.existsSync(this.paths.credentialsFile) ? this.loadCredentials() : null,
      state: fs.existsSync(this.paths.stateFile) ? this.loadState() : null,
      auditLines,
    };

    const bundle: BackupBundle = {
      format: 'obsidian-telemetry-backup',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      checksumSha256: computeBackupChecksum(payload),
      payload,
    };

    writeFileAtomicSync(outputFile, JSON.stringify(bundle, null, 2), 0o600);
    return bundle;
  }

  importBackup(inputFile: string): BackupBundle {
    const raw = fs.readFileSync(inputFile, 'utf8');
    const parsed = JSON.parse(raw) as BackupBundle;

    if (
      !parsed ||
      parsed.format !== 'obsidian-telemetry-backup' ||
      typeof parsed.schemaVersion !== 'number' ||
      !parsed.payload ||
      typeof parsed.checksumSha256 !== 'string'
    ) {
      throw new Error('Invalid backup archive format.');
    }

    const actualChecksum = computeBackupChecksum(parsed.payload);
    const expectedBuf = Buffer.from(parsed.checksumSha256, 'hex');
    const actualBuf = Buffer.from(actualChecksum, 'hex');
    if (
      expectedBuf.length === 0 ||
      expectedBuf.length !== actualBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      throw new Error('Backup integrity check failed (SHA-256 mismatch).');
    }

    if (parsed.payload.config) {
      this.writeJsonWithBackup(this.paths.configFile, {
        ...parsed.payload.config,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      });
    }
    if (parsed.payload.credentials) {
      this.writeJsonWithBackup(this.paths.credentialsFile, {
        ...parsed.payload.credentials,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      });
    }
    if (parsed.payload.state) {
      this.writeJsonWithBackup(this.paths.stateFile, {
        ...parsed.payload.state,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      });
    }
    if (Array.isArray(parsed.payload.auditLines)) {
      const content =
        parsed.payload.auditLines.length > 0 ? `${parsed.payload.auditLines.join('\n')}\n` : '';
      writeFileAtomicSync(this.paths.auditFile, content, 0o600);
    }

    return parsed;
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
