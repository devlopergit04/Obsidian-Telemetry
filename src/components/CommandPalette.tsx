import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  Network,
  RotateCcw,
  Search,
  Server,
  Terminal,
  X,
} from 'lucide-react';
import { ClusterData, InspectorSelection, ScreenId } from '../types/telemetry';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  clusters: ClusterData[];
  activeCluster: ClusterData;
  onSelectScreen: (screen: ScreenId) => void;
  onSelectCluster: (clusterId: string) => void;
  onInspect: (selection: InspectorSelection, targetScreen?: ScreenId) => void;
  onResetWorkspace: () => void;
}

interface PaletteEntry {
  key: string;
  section: string;
  label: string;
  meta?: string;
  icon: React.ReactNode;
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  clusters,
  activeCluster,
  onSelectScreen,
  onSelectCluster,
  onInspect,
  onResetWorkspace,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const q = query.toLowerCase().trim();

  const entries: PaletteEntry[] = [
    ...[
      { id: ScreenId.OVERVIEW, label: 'Go to Cluster Overview', icon: <Activity className="w-4 h-4 text-[#4cd7f6]" /> },
      { id: ScreenId.NODES, label: 'Go to Nodes & Workloads', icon: <Server className="w-4 h-4 text-[#4cd7f6]" /> },
      { id: ScreenId.LOGS, label: 'Go to Live Log Stream', icon: <Terminal className="w-4 h-4 text-[#4cd7f6]" /> },
      { id: ScreenId.NETWORK, label: 'Go to Network Topology', icon: <Network className="w-4 h-4 text-[#4cd7f6]" /> },
      { id: ScreenId.INCIDENTS, label: 'Go to Incidents & Alerts', icon: <AlertOctagon className="w-4 h-4 text-[#4cd7f6]" /> },
    ]
      .filter((item) => item.label.toLowerCase().includes(q))
      .map((item) => ({
        key: `screen-${item.id}`,
        section: 'Views',
        label: item.label,
        icon: item.icon,
        action: () => {
          onSelectScreen(item.id);
          onClose();
        },
      })),
    ...clusters
      .filter((c) => c.name.toLowerCase().includes(q) || c.region.toLowerCase().includes(q))
      .map((c) => ({
        key: `cluster-${c.id}`,
        section: 'Switch Cluster',
        label: c.name,
        meta: c.region,
        icon: <Server className="w-3.5 h-3.5 text-emerald-400" />,
        action: () => {
          onSelectCluster(c.id);
          onClose();
        },
      })),
    ...activeCluster.nodes
      .filter(
        (n) =>
          n.hostname.toLowerCase().includes(q) ||
          n.ip.includes(q) ||
          n.zone.toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map((n) => ({
        key: `node-${n.id}`,
        section: 'Cluster Nodes',
        label: n.hostname,
        meta: n.ip,
        icon: <Server className="w-3.5 h-3.5 text-[#4cd7f6]" />,
        action: () => {
          onInspect({ kind: 'node', id: n.id }, ScreenId.NODES);
          onClose();
        },
      })),
    ...activeCluster.pods
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.namespace.toLowerCase().includes(q) ||
          p.ip.includes(q)
      )
      .slice(0, 5)
      .map((p) => ({
        key: `pod-${p.id}`,
        section: 'Pod Workloads',
        label: p.name,
        meta: p.namespace,
        icon: <Terminal className="w-3.5 h-3.5 text-slate-400" />,
        action: () => {
          onInspect({ kind: 'pod', id: p.id }, ScreenId.NODES);
          onClose();
        },
      })),
    ...('reset workspace defaults restore'.includes(q) || q === ''
      ? [
          {
            key: 'action-reset',
            section: 'Workspace',
            label: 'Reset Workspace to Default Cluster State',
            meta: 'localStorage',
            icon: <RotateCcw className="w-3.5 h-3.5 text-amber-400" />,
            action: () => {
              onResetWorkspace();
              onClose();
            },
          },
        ]
      : []),
  ];

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (entries.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % entries.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + entries.length) % entries.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      entries[activeIndex]?.action();
    }
  };

  let lastSection = '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={onClose} />
      <div
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-xl glass-flyout rounded shadow-2xl overflow-hidden glow-cyan-focus"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/80 bg-slate-950/70">
          <Search className="w-4 h-4 text-[#4cd7f6] shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to screen, cluster, node IP, or pod... (↑↓ Enter)"
            className="flex-1 bg-transparent font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Close command palette"
            className="p-1 rounded text-slate-400 hover:text-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[380px] overflow-y-auto micro-scroll p-2 space-y-1">
          {entries.length === 0 ? (
            <div className="py-8 text-center font-mono text-xs text-slate-500">
              No matching cluster resources found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            entries.map((entry, idx) => {
              const showHeader = entry.section !== lastSection;
              lastSection = entry.section;
              const isHighlighted = idx === activeIndex;

              return (
                <React.Fragment key={entry.key}>
                  {showHeader && (
                    <div className="px-2 pt-2 pb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400">
                      {entry.section}
                    </div>
                  )}
                  <button
                    onClick={entry.action}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-left text-xs font-mono transition-colors ${
                      isHighlighted
                        ? 'bg-[#1E293B] text-[#dfe2ee] border border-[#06B6D4]/40'
                        : 'text-slate-300 border border-transparent hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {entry.icon}
                      <span className="truncate">{entry.label}</span>
                    </div>
                    {entry.meta && (
                      <span className="text-[11px] text-[#4cd7f6] shrink-0 ml-2">
                        {entry.meta}
                      </span>
                    )}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
