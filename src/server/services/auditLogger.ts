import crypto from 'node:crypto';
import type { AuditEntry, UserRole } from '../../shared/types.ts';
import type { StateStore } from './stateStore.ts';

export class AuditLogger {
  private readonly maxEntries: number;
  private readonly store?: StateStore;
  private entries: AuditEntry[] = [];

  constructor(maxEntries = 250, store?: StateStore) {
    this.maxEntries = maxEntries;
    this.store = store;
    if (store) {
      this.entries = store.loadAuditEntries(maxEntries);
    }
  }

  record(input: {
    actorId: string;
    actorRole: UserRole;
    action: string;
    target: string;
    clusterId: string;
    outcome: 'allowed' | 'denied' | 'succeeded' | 'failed';
    detail: string;
    ip: string;
  }): AuditEntry {
    const entry: AuditEntry = {
      id: `aud-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      ...input,
    };
    this.entries = [entry, ...this.entries].slice(0, this.maxEntries);
    if (this.store) {
      try {
        this.store.appendAuditEntry(entry);
      } catch {
        // Do not crash request flow on log disk error
      }
    }
    return entry;
  }

  list(limit = 100): AuditEntry[] {
    return this.entries.slice(0, Math.max(1, Math.min(limit, this.maxEntries)));
  }

  clear(): void {
    this.entries = [];
  }
}
