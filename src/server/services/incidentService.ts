import type { IncidentItem } from '../../shared/types.ts';
import type { PersistedAckState, StateStore } from './stateStore.ts';

export class IncidentService {
  private ackStore = new Map<string, PersistedAckState>();
  private readonly store?: StateStore;

  constructor(store?: StateStore) {
    this.store = store;
    if (store) {
      const persisted = store.loadState();
      for (const [id, state] of Object.entries(persisted.incidentAcks || {})) {
        this.ackStore.set(id, state);
      }
    }
  }

  private persist(): void {
    if (!this.store) return;
    try {
      this.store.saveIncidentAcks(Object.fromEntries(this.ackStore.entries()));
    } catch {
      // Ignore transient disk write errors cleanly
    }
  }

  acknowledge(incidentId: string, actorId: string): PersistedAckState {
    const existing = this.ackStore.get(incidentId);
    const next: PersistedAckState = {
      acknowledged: true,
      acknowledgedBy: actorId,
      acknowledgedAt: new Date().toISOString(),
      resolvedLocally: existing?.resolvedLocally ?? false,
    };
    this.ackStore.set(incidentId, next);
    this.persist();
    return next;
  }

  markResolvedLocally(incidentId: string, actorId: string): PersistedAckState {
    const existing = this.ackStore.get(incidentId);
    const next: PersistedAckState = {
      acknowledged: true,
      acknowledgedBy: existing?.acknowledgedBy || actorId,
      acknowledgedAt: existing?.acknowledgedAt || new Date().toISOString(),
      resolvedLocally: true,
    };
    this.ackStore.set(incidentId, next);
    this.persist();
    return next;
  }

  merge(incidents: IncidentItem[]): IncidentItem[] {
    return incidents.map((inc) => {
      const state = this.ackStore.get(inc.id);
      if (!state) return inc;
      return {
        ...inc,
        acknowledged: state.acknowledged,
        acknowledgedBy: state.acknowledgedBy,
        acknowledgedAt: state.acknowledgedAt,
        resolvedLocally: state.resolvedLocally,
        severity: state.resolvedLocally ? 'RESOLVED' : inc.severity,
      };
    });
  }
}
