import React, { useState } from 'react';
import { Check, Download, Search, Trash2 } from 'lucide-react';
import { ClusterData, LogLevel } from '../types/telemetry';

interface LogsScreenProps {
  cluster: ClusterData;
  initialFilter: string;
  onClearLogs: () => void;
}

export const LogsScreen: React.FC<LogsScreenProps> = ({
  cluster,
  initialFilter,
  onClearLogs,
}) => {
  const [query, setQuery] = useState(initialFilter);
  const [enabledLevels, setEnabledLevels] = useState<LogLevel[]>([
    LogLevel.INFO,
    LogLevel.WARN,
    LogLevel.ERROR,
    LogLevel.TRACE,
  ]);
  const [selectedService, setSelectedService] = useState<string>('ALL');
  const [expandedLogIds, setExpandedLogIds] = useState<string[]>([]);

  const services = Array.from(new Set(cluster.logs.map((l) => l.service)));

  const toggleLevel = (lvl: LogLevel) => {
    setEnabledLevels((prev) =>
      prev.includes(lvl) ? prev.filter((item) => item !== lvl) : [...prev, lvl]
    );
  };

  const toggleExpandPayload = (id: string) => {
    setExpandedLogIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filteredLogs = cluster.logs.filter((entry) => {
    if (!enabledLevels.includes(entry.level)) return false;
    if (selectedService !== 'ALL' && entry.service !== selectedService) return false;
    const raw = query.trim();
    if (!raw) return true;
    const target = `${entry.message} ${entry.service} ${entry.pod} ${entry.nodeHostname} ${entry.traceId}`;
    try {
      const re = new RegExp(raw, 'i');
      return re.test(target);
    } catch {
      return target.toLowerCase().includes(raw.toLowerCase());
    }
  });

  const resetFilters = () => {
    setQuery('');
    setSelectedService('ALL');
    setEnabledLevels([LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.TRACE]);
  };

  const handleExportLogs = () => {
    const content = filteredLogs
      .map(
        (l) =>
          `${l.timestamp} [${l.level}] ${l.service} (${l.pod}) trace=${l.traceId} :: ${l.message}${
            l.payload ? ` payload=${l.payload}` : ''
          }`
      )
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cluster.name}-telemetry.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const levelStyles: Record<LogLevel, string> = {
    [LogLevel.INFO]: 'text-[#4cd7f6] bg-[#06B6D4]/10 border-[#06B6D4]/30',
    [LogLevel.WARN]: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    [LogLevel.ERROR]: 'text-red-400 bg-red-500/15 border-red-500/35',
    [LogLevel.TRACE]: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  };

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
            Live Log Stream
          </h1>
          <p className="font-mono text-xs text-slate-400 mt-0.5">
            Structured stdout/stderr &amp; kernel ring buffer · {filteredLogs.length} events shown
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900/70 border border-slate-800 text-xs font-mono text-slate-200 hover:border-[#06B6D4]/50 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[#4cd7f6]" />
            <span>Export .log</span>
          </button>
          <button
            onClick={onClearLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-500/40 text-xs font-mono text-red-400 hover:bg-red-500/15 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Buffer</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-panel rounded p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search message, trace ID, pod, or node hostname..."
            className="w-full rounded bg-slate-950/80 border border-slate-800 pl-8 pr-3 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#06B6D4]"
          />
        </div>

        <select
          value={selectedService}
          onChange={(e) => setSelectedService(e.target.value)}
          className="rounded bg-slate-950/80 border border-slate-800 px-3 py-1.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-[#06B6D4]"
        >
          <option value="ALL">All Services</option>
          {services.map((svc) => (
            <option key={svc} value={svc}>
              {svc}
            </option>
          ))}
        </select>

        {/* Severity Checkboxes */}
        <div className="flex items-center gap-3">
          {([LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.TRACE] as LogLevel[]).map(
            (lvl) => {
              const checked = enabledLevels.includes(lvl);
              return (
                <button
                  key={lvl}
                  onClick={() => toggleLevel(lvl)}
                  className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300 hover:text-white"
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-[2px] border flex items-center justify-center transition-colors ${
                      checked
                        ? 'bg-[#06B6D4] border-[#06B6D4] text-[#0B0F17]'
                        : 'border-slate-600 bg-slate-950/70'
                    }`}
                  >
                    {checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                  <span>{lvl}</span>
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Embedded #070A0F Terminal Console */}
      <div className="rounded border border-slate-800/90 bg-[#070A0F] overflow-hidden flex-1 min-h-[420px] flex flex-col">
        <div className="px-4 py-2 border-b border-slate-800/80 bg-[#0a0e16] flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
          <span>Journalctl / Containerd Stream · {cluster.name}</span>
          <span>UTF-8 · Tabular Timestamps</span>
        </div>

        <div className="flex-1 overflow-y-auto micro-scroll divide-y divide-slate-900/90 font-mono text-[12px]">
          {filteredLogs.length === 0 ? (
            <div className="py-14 text-center text-slate-500 text-xs space-y-3">
              <div>
                Log buffer is empty or filtered out. Adjust level toggles or clear search query.
              </div>
              {cluster.logs.length > 0 && (
                <button
                  onClick={resetFilters}
                  className="px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-[#4cd7f6] hover:border-[#06B6D4]/50"
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            filteredLogs.map((entry) => {
              const expanded = expandedLogIds.includes(entry.id);
              return (
                <div
                  key={entry.id}
                  onClick={() => entry.payload && toggleExpandPayload(entry.id)}
                  className={`px-4 py-2 transition-colors ${
                    entry.payload ? 'cursor-pointer hover:bg-slate-900/50' : 'hover:bg-slate-900/30'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-2.5 leading-5">
                    <span className="text-slate-500 text-[11px] shrink-0 tabular-nums">
                      {entry.timestamp.replace('T', ' ').replace('Z', '')}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded-[2px] border text-[10px] font-semibold shrink-0 ${levelStyles[entry.level]}`}
                    >
                      {entry.level}
                    </span>
                    <span className="text-[#4cd7f6] text-[11px] shrink-0">
                      {entry.service}
                    </span>
                    <span className="text-slate-500 text-[11px] shrink-0">
                      [{entry.traceId}]
                    </span>
                    <span className="text-[#dfe2ee] break-all flex-1 min-w-[240px]">
                      {entry.message}
                    </span>
                    {entry.payload && (
                      <span className="text-[10px] text-slate-400 border border-slate-800 px-1.5 rounded-[2px]">
                        {expanded ? 'hide json' : '+json'}
                      </span>
                    )}
                  </div>
                  {expanded && entry.payload && (
                    <pre className="mt-2 ml-6 rounded border border-slate-800 bg-[#0a0e16] p-2.5 text-[11px] text-emerald-300 overflow-x-auto micro-scroll">
                      {entry.payload}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
