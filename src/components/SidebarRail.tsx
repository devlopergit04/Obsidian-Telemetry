import React from 'react';
import {
  Activity,
  AlertOctagon,
  ChevronLeft,
  ChevronRight,
  FileText,
  Network,
  Server,
  Terminal,
  X,
} from 'lucide-react';
import type { ClusterSummary, ScreenId } from '../shared/types.ts';

interface SidebarRailProps {
  activeScreen: ScreenId;
  onSelectScreen: (screen: ScreenId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  clusters: ClusterSummary[];
  activeCluster: ClusterSummary;
  onSelectContext: (contextName: string) => void;
  openIncidentsCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const SidebarRail: React.FC<SidebarRailProps> = ({
  activeScreen,
  onSelectScreen,
  collapsed,
  onToggleCollapse,
  clusters,
  activeCluster,
  onSelectContext,
  openIncidentsCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const navItems: {
    id: ScreenId;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      id: 'overview',
      label: 'Cluster Overview',
      icon: <Activity className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'nodes',
      label: 'Nodes & Workloads',
      icon: <Server className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'logs',
      label: 'Container Logs',
      icon: <Terminal className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'network',
      label: 'Services & Ingress',
      icon: <Network className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'incidents',
      label: 'Incidents & PromQL',
      icon: <AlertOctagon className="w-4 h-4 shrink-0" />,
      badge: openIncidentsCount > 0 ? openIncidentsCount : undefined,
    },
    {
      id: 'audit',
      label: 'Audit Trail',
      icon: <FileText className="w-4 h-4 shrink-0" />,
    },
  ];

  const railContent = (isMobile = false) => {
    const isMini = collapsed && !isMobile;

    return (
      <div className="flex flex-col h-full bg-[#0a0e16]/95 border-r border-slate-800/80 select-none">
        <div
          className={`h-14 flex items-center border-b border-slate-800/80 shrink-0 ${
            isMini ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded bg-[#06B6D4]/15 border border-[#06B6D4]/40 flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 text-[#22D3EE]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="12 2 21 7 21 17 12 22 3 17 3 7" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            {!isMini && (
              <span className="font-display font-semibold text-sm tracking-tight text-[#dfe2ee] whitespace-nowrap truncate">
                Obsidian Telemetry
              </span>
            )}
          </div>
          {isMobile ? (
            <button
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            !isMini && (
              <button
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
                className="p-1.5 rounded text-slate-400 hover:text-[#4cd7f6] hover:bg-slate-800/70 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )
          )}
        </div>

        {/* Kubernetes Context Switcher */}
        <div className={`border-b border-slate-800/80 ${isMini ? 'p-2' : 'p-3'}`}>
          {!isMini && (
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400 mb-2 px-1">
              Kubernetes Context
            </div>
          )}
          <div className="space-y-1">
            {clusters.map((c) => {
              const isActive = c.id === activeCluster.id;
              const statusDotColor =
                c.kubernetesStatus === 'connected'
                  ? 'bg-emerald-400'
                  : c.kubernetesStatus === 'error'
                    ? 'bg-red-400'
                    : 'bg-slate-500';

              return (
                <button
                  key={c.id}
                  onClick={() => {
                    onSelectContext(c.contextName);
                    if (isMobile) onCloseMobile();
                  }}
                  title={`${c.name} (${c.kubernetesStatus})`}
                  className={`w-full flex items-center rounded transition-colors text-left ${
                    isMini ? 'justify-center py-2 px-1' : 'justify-between px-2.5 py-2'
                  } ${
                    isActive
                      ? 'bg-[#1E293B] text-[#dfe2ee] border border-[#06B6D4]/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotColor}`} />
                    {!isMini && <span className="font-mono text-xs truncate">{c.name}</span>}
                  </div>
                  {!isMini && (
                    <span className="font-mono text-[10px] text-slate-400 shrink-0 ml-1 uppercase">
                      {c.connectionMode}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <nav className={`flex-1 overflow-y-auto micro-scroll ${isMini ? 'p-2' : 'p-3'} space-y-1`}>
          {!isMini && (
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-400 mb-2 px-1">
              Observability Views
            </div>
          )}
          {navItems.map((item) => {
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectScreen(item.id);
                  if (isMobile) onCloseMobile();
                }}
                title={item.label}
                className={`w-full flex items-center rounded transition-all whitespace-nowrap ${
                  isMini ? 'justify-center py-2.5 px-2 relative' : 'justify-between px-2.5 py-2'
                } ${
                  isActive
                    ? 'bg-[#1E293B] text-[#4cd7f6] border border-[#06B6D4]/35 glow-cyan-focus'
                    : 'text-slate-300 hover:text-[#dfe2ee] hover:bg-slate-900/70 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={isActive ? 'text-[#22D3EE]' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  {!isMini && (
                    <span className="text-[13px] font-medium truncate">{item.label}</span>
                  )}
                </div>
                {item.badge !== undefined && !isMini && (
                  <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 tabular-nums">
                    {item.badge}
                  </span>
                )}
                {item.badge !== undefined && isMini && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-400" />
                )}
              </button>
            );
          })}
        </nav>

        {!isMobile && isMini && (
          <div className="p-2 border-t border-slate-800/80 flex justify-center">
            <button
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              className="p-2 rounded text-slate-400 hover:text-[#4cd7f6] hover:bg-slate-800/70 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {!isMini && (
          <div className="p-3 border-t border-slate-800/80 bg-[#070A0F]/60 text-[11px] font-mono text-slate-400 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span>API Server</span>
              <span className="text-slate-200 truncate">{activeCluster.serverDisplay}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Kubernetes</span>
              <span
                className={
                  activeCluster.kubernetesStatus === 'connected'
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }
              >
                {activeCluster.kubernetesStatus}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Prometheus</span>
              <span
                className={
                  activeCluster.prometheusStatus === 'connected'
                    ? 'text-emerald-400'
                    : activeCluster.prometheusStatus === 'demo'
                      ? 'text-[#4cd7f6]'
                      : 'text-slate-400'
                }
              >
                {activeCluster.prometheusStatus}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <aside
        className={`hidden lg:block shrink-0 transition-[width] duration-200 ease-out ${
          collapsed ? 'w-[64px]' : 'w-[240px]'
        }`}
      >
        {railContent(false)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={onCloseMobile} />
          <div className="relative w-[260px] max-w-[80vw] h-full z-10">{railContent(true)}</div>
        </div>
      )}
    </>
  );
};
