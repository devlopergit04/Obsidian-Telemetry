import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw, Search } from 'lucide-react';
import { apiClient } from '../api/client.ts';
import type { AuditEntry } from '../shared/types.ts';

interface AuditScreenProps {
  refreshKey?: number;
}

export const AuditScreen: React.FC<AuditScreenProps> = ({ refreshKey = 0 }) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');

  const loadAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getAuditLogs(150);
      setEntries(res.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch audit trail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAudit();
  }, [refreshKey]);

  const q = search.toLowerCase().trim();
  const filtered = entries.filter(
    (e) =>
      !q ||
      e.actorId.toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q) ||
      e.target.toLowerCase().includes(q) ||
      e.detail.toLowerCase().includes(q)
  );

  const outcomeStyle = (outcome: AuditEntry['outcome']) => {
    switch (outcome) {
      case 'succeeded':
      case 'allowed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'denied':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/35';
      case 'failed':
        return 'bg-red-500/15 text-red-400 border-red-500/40';
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
            Audit Trail
          </h1>
          <p className="font-mono text-xs text-slate-400 mt-0.5">
            Server-side RBAC decisions, authentication events, and Kubernetes mutation history
          </p>
        </div>

        <button
          onClick={() => void loadAudit()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900/70 border border-slate-800 text-xs font-mono text-slate-200 hover:border-[#06B6D4]/50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#4cd7f6] ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="glass-panel rounded p-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by actor, action, target, or outcome detail..."
            className="w-full rounded bg-slate-950/80 border border-slate-800 pl-8 pr-3 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#06B6D4]"
          />
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-2.5 font-mono text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="glass-panel rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#4cd7f6]" />
          <span className="font-display text-sm font-semibold text-[#dfe2ee]">
            Recorded Events ({filtered.length})
          </span>
        </div>

        <div className="overflow-x-auto micro-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#111827]/90 border-b border-slate-800/90 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                <th className="py-2.5 px-3 font-semibold">Actor / Role</th>
                <th className="py-2.5 px-3 font-semibold">Action</th>
                <th className="py-2.5 px-3 font-semibold">Target</th>
                <th className="py-2.5 px-3 font-semibold">Outcome</th>
                <th className="py-2.5 px-4 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No audit entries recorded yet.
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap tabular-nums">
                      {entry.timestamp.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="text-[#dfe2ee]">{entry.actorId}</span>
                      <span className="text-[10px] text-[#4cd7f6] ml-1.5 uppercase">
                        ({entry.actorRole})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-200 whitespace-nowrap">{entry.action}</td>
                    <td className="py-2.5 px-3 text-[#4cd7f6] whitespace-nowrap">{entry.target}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] uppercase ${outcomeStyle(
                          entry.outcome
                        )}`}
                      >
                        {entry.outcome}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 max-w-md truncate">{entry.detail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
