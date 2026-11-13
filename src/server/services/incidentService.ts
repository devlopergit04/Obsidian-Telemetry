import type { IncidentItem } from '../../shared/types.ts';

interface AckState {
  acknowledged: boolean;
  acknowledgedBy: string;
  acknowledgedAt: string;
  resolvedLocally: boolean;
}

export class IncidentService {
  private ackStore = new Map<string, AckState>();

  acknowledge(incidentId: string, actorId: string): AckState {
    const existing = this.ackStore.get(incidentId);
    const next: AckState = {
      acknowledged: true,
      acknowledgedBy: actorId,
      acknowledgedAt: new Date().toISOString(),
      resolvedLocally: existing?.resolvedLocally ?? false,
    };
    this.ackStore.set(incidentId, next);
    return next;
  }

  markResolvedLocally(incidentId: string, actorId: string): AckState {
    const existing = this.ackStore.get(incidentId);
    const next: AckState = {
      acknowledged: true,
      acknowledgedBy: existing?.acknowledgedBy || actorId,
      acknowledgedAt: existing?.acknowledgedAt || new Date().toISOString(),
      resolvedLocally: true,
    };
    this.ackStore.set(incidentId, next);
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
