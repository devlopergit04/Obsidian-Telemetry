import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Radio, RefreshCw, Search, Terminal } from 'lucide-react';
import { apiClient } from '../api/client.ts';
import type { ClusterSnapshot } from '../shared/types.ts';

interface LogsScreenProps {
  snapshot: ClusterSnapshot;
  initialTarget?: { namespace: string; pod: string } | null;
}

export const LogsScreen: React.FC<LogsScreenProps> = ({ snapshot, initialTarget }) => {
  const [selectedNs, setSelectedNs] = useState<string>(
    () => initialTarget?.namespace || snapshot.pods[0]?.namespace || snapshot.namespaces[0] || ''
  );
  const [selectedPod, setSelectedPod] = useState<string>(
    () => initialTarget?.pod || snapshot.pods[0]?.name || ''
  );
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [tailLines, setTailLines] = useState<number>(250);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [rawLogs, setRawLogs] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [followLive, setFollowLive] = useState<boolean>(false);
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'streaming' | 'error'>('idle');
  const wsRef = useRef<WebSocket | null>(null);

  const podsInNamespace = useMemo(
    () => snapshot.pods.filter((p) => !selectedNs || p.namespace === selectedNs),
    [snapshot.pods, selectedNs]
  );

  const activePodObj = useMemo(
    () => snapshot.pods.find((p) => p.namespace === selectedNs && p.name === selectedPod) || null,
    [snapshot.pods, selectedNs, selectedPod]
  );

  useEffect(() => {
    if (initialTarget) {
      setSelectedNs(initialTarget.namespace);
      setSelectedPod(initialTarget.pod);
      setSelectedContainer('');
    }
  }, [initialTarget]);

  useEffect(() => {
    if (!selectedNs && snapshot.pods.length > 0) {
      setSelectedNs(snapshot.pods[0].namespace);
      setSelectedPod(snapshot.pods[0].name);
      return;
    }
    if (selectedNs && podsInNamespace.length > 0) {
      const stillExists = podsInNamespace.some((p) => p.name === selectedPod);
      if (!stillExists) {
        setSelectedPod(podsInNamespace[0].name);
        setSelectedContainer('');
      }
    }
  }, [selectedNs, selectedPod, podsInNamespace, snapshot.pods]);

  useEffect(() => {
    if (activePodObj && activePodObj.containers.length > 0) {
      const exists = activePodObj.containers.some((c) => c.name === selectedContainer);
      if (!exists) {
        setSelectedContainer(activePodObj.containers[0].name);
      }
    } else {
      setSelectedContainer('');
    }
  }, [activePodObj, selectedContainer]);

  const fetchLogs = async () => {
    if (!selectedNs || !selectedPod) {
      setRawLogs('');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getPodLogs({
        namespace: selectedNs,
        pod: selectedPod,
        container: selectedContainer || undefined,
        tailLines,
        mode: snapshot.sourceMode === 'demo' ? 'demo' : 'live',
        context: snapshot.cluster.contextName,
      });
      setRawLogs(res.logs);
    } catch (err) {
      setRawLogs('');
      setError(err instanceof Error ? err.message : 'Failed to fetch container logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (followLive) return;
    void fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedNs,
    selectedPod,
    selectedContainer,
    tailLines,
    snapshot.sourceMode,
    snapshot.cluster.contextName,
  ]);

  useEffect(() => {
    wsRef.current?.close();
    wsRef.current = null;

    if (!followLive || snapshot.sourceMode !== 'live' || !selectedNs || !selectedPod) {
      setWsStatus('idle');
      return;
    }

    setWsStatus('connecting');
    setError(null);
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const qs = new URLSearchParams({
      namespace: selectedNs,
      pod: selectedPod,
      context: snapshot.cluster.contextName,
    });
    if (selectedContainer) qs.set('container', selectedContainer);

    const ws = new WebSocket(`${proto}//${window.location.host}/ws/logs?${qs.toString()}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('streaming');
      setRawLogs('');
    };

    ws.onmessage = (evt) => {
      try {
        const frame = JSON.parse(String(evt.data)) as {
          type: string;
          data?: string;
          message?: string;
        };
        if (frame.type === 'log' && frame.data) {
          setRawLogs((prev) => {
            const combined = prev + frame.data!;
            const lines = combined.split('\n');
            return lines.length > 1000 ? lines.slice(-1000).join('\n') : combined;
          });
        } else if (frame.type === 'error' && frame.message) {
          setWsStatus('error');
          setError(frame.message);
        }
      } catch {
        // Ignore malformed frames
      }
    };

    ws.onerror = () => {
      setWsStatus('error');
      setError('WebSocket log stream encountered a connection error.');
    };

    ws.onclose = () => {
      setWsStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
    };

    return () => {
      ws.close();
    };
  }, [
    followLive,
    snapshot.sourceMode,
    snapshot.cluster.contextName,
    selectedNs,
    selectedPod,
    selectedContainer,
  ]);

  const logLines = useMemo(() => {
    const lines = rawLogs ? rawLogs.split('\n').filter((line) => line.length > 0) : [];
    const rawQuery = searchQuery.trim();
    if (!rawQuery) return lines;
    try {
      const re = new RegExp(rawQuery, 'i');
      return lines.filter((line) => re.test(line));
    } catch {
      const lower = rawQuery.toLowerCase();
      return lines.filter((line) => line.toLowerCase().includes(lower));
    }
  }, [rawLogs, searchQuery]);

  const handleExportLogs = () => {
    const blob = new Blob([logLines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedNs || 'cluster'}-${selectedPod || 'logs'}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (snapshot.sourceMode === 'disconnected' && snapshot.pods.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
            Container Logs
          </h1>
          <p className="font-mono text-xs text-slate-400 mt-0.5">
            No Kubernetes cluster is connected.
          </p>
        </div>
        <div className="glass-panel rounded p-8 text-center font-mono text-xs text-slate-400">
          Connect a Kubernetes cluster via <code className="text-[#4cd7f6]">KUBECONFIG_PATH</code>{' '}
          or <code className="text-[#4cd7f6]">K8S_API_SERVER</code> to inspect and stream pod logs.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[#dfe2ee]">
            Container Logs
          </h1>
          <p className="font-mono text-xs text-slate-400 mt-0.5">
            Kubernetes pod stdout/stderr · {logLines.length} lines shown
            {snapshot.sourceMode === 'demo' ? ' · Synthetic demo stream' : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {snapshot.sourceMode === 'live' && (
            <button
              onClick={() => setFollowLive((p) => !p)}
              disabled={!selectedPod || !snapshot.rbac.canReadLogs}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-mono transition-colors disabled:opacity-45 ${
                followLive
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-[#06B6D4]/50'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${wsStatus === 'streaming' ? 'animate-pulse' : ''}`} />
              <span>{followLive ? 'Stop Tail' : 'Follow Stream'}</span>
            </button>
          )}
          <button
            onClick={() => void fetchLogs()}
            disabled={loading || !selectedPod || followLive}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900/70 border border-slate-800 text-xs font-mono text-slate-200 hover:border-[#06B6D4]/50 disabled:opacity-45"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#4cd7f6] ${loading ? 'animate-spin' : ''}`} />
            <span>Fetch</span>
          </button>
          <button
            onClick={handleExportLogs}
            disabled={logLines.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900/70 border border-slate-800 text-xs font-mono text-slate-200 hover:border-[#06B6D4]/50 disabled:opacity-45"
          >
            <Download className="w-3.5 h-3.5 text-[#4cd7f6]" />
            <span>Export .log</span>
          </button>
        </div>
      </div>

      {/* Pod / Container Selector & Filter Bar */}
      <div className="glass-panel rounded p-3 flex flex-wrap items-center gap-3">
        <select
          value={selectedNs}
          onChange={(e) => {
            setSelectedNs(e.target.value);
            setSelectedPod('');
            setSelectedContainer('');
          }}
          aria-label="Select namespace"
          className="rounded bg-slate-950/80 border border-slate-800 px-3 py-1.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-[#06B6D4]"
        >
          {snapshot.namespaces.map((ns) => (
            <option key={ns} value={ns}>
              ns/{ns}
            </option>
          ))}
        </select>

        <select
          value={selectedPod}
          onChange={(e) => {
            setSelectedPod(e.target.value);
            setSelectedContainer('');
          }}
          aria-label="Select pod"
          className="rounded bg-slate-950/80 border border-slate-800 px-3 py-1.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-[#06B6D4] max-w-[260px]"
        >
          {podsInNamespace.length === 0 ? (
            <option value="">No pods in namespace</option>
          ) : (
            podsInNamespace.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))
          )}
        </select>

        <select
          value={selectedContainer}
          onChange={(e) => setSelectedContainer(e.target.value)}
          aria-label="Select container"
          className="rounded bg-slate-950/80 border border-slate-800 px-3 py-1.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-[#06B6D4]"
        >
          {activePodObj?.containers.length ? (
            activePodObj.containers.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))
          ) : (
            <option value="">default container</option>
          )}
        </select>

        <select
          value={tailLines}
          onChange={(e) => setTailLines(Number(e.target.value))}
          aria-label="Tail lines"
          className="rounded bg-slate-950/80 border border-slate-800 px-3 py-1.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-[#06B6D4]"
        >
          <option value={100}>Last 100 lines</option>
          <option value={250}>Last 250 lines</option>
          <option value={500}>Last 500 lines</option>
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter lines (substring or RegExp)..."
            className="w-full rounded bg-slate-950/80 border border-slate-800 pl-8 pr-3 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#06B6D4]"
          />
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-2.5 font-mono text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Embedded Terminal Log Viewer */}
      <div className="rounded border border-slate-800/90 bg-[#070A0F] overflow-hidden flex-1 min-h-[420px] flex flex-col">
        <div className="px-4 py-2 border-b border-slate-800/80 bg-[#0a0e16] flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
          <span className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-[#4cd7f6]" />
            <span>
              {selectedNs && selectedPod
                ? `${selectedNs}/${selectedPod}${selectedContainer ? ` (${selectedContainer})` : ''}`
                : 'No Pod Selected'}
            </span>
          </span>
          <span>
            {followLive
              ? wsStatus === 'streaming'
                ? 'WS STREAMING'
                : wsStatus.toUpperCase()
              : `TAIL ${tailLines}`}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto micro-scroll p-3 font-mono text-[12px] space-y-0.5">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Reading container logs from Kubernetes API...
            </div>
          ) : logLines.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              {selectedPod
                ? 'No log output returned for the selected container and filter.'
                : 'Select a pod to view its container logs.'}
            </div>
          ) : (
            logLines.map((line, idx) => {
              const lower = line.toLowerCase();
              const isError =
                lower.includes('error') || lower.includes('fatal') || lower.includes('panic');
              const isWarn = !isError && lower.includes('warn');
              return (
                <div
                  key={`${idx}-${line.slice(0, 24)}`}
                  className={`px-2 py-0.5 rounded-xs whitespace-pre-wrap break-all leading-5 ${
                    isError
                      ? 'text-red-300 bg-red-500/5'
                      : isWarn
                        ? 'text-amber-300'
                        : 'text-slate-200 hover:bg-slate-900/50'
                  }`}
                >
                  <span className="text-slate-600 select-none mr-3 tabular-nums">
                    {String(idx + 1).padStart(3, ' ')}
                  </span>
                  {line}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
