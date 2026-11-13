import React from 'react';
import { Command, KeyRound, Menu, PanelRightClose, PanelRightOpen, RefreshCw } from 'lucide-react';
import type { AuthSession, ClusterSummary, DataSourceMode, ScreenId } from '../shared/types.ts';

interface TopBarProps {
  cluster: ClusterSummary;
  sourceMode: DataSourceMode;
  activeScreen: ScreenId;
  session: AuthSession;
  mode: 'live' | 'demo';
  onToggleMode: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onOpenCommandPalette: () => void;
  onOpenAuthModal: () => void;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  onOpenMobileNav: () => void;
}

const SCREEN_TITLES: Record<ScreenId, string> = {
  overview: 'Cluster Overview',
  nodes: 'Nodes & Workloads',
  logs: 'Container Logs',
  network: 'Services & Ingress',
  incidents: 'Incidents & PromQL',
  audit: 'Audit Trail',
};

export const TopBar: React.FC<TopBarProps> = ({
  cluster,
  sourceMode,
  activeScreen,
  session,
  mode,
  onToggleMode,
  onRefresh,
  refreshing,
  onOpenCommandPalette,
  onOpenAuthModal,
  drawerOpen,
  onToggleDrawer,
  onOpenMobileNav,
}) => {
  const modePill =
    sourceMode === 'live'
      ? { label: 'LIVE INFRA', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' }
      : sourceMode === 'demo'
        ? { label: 'DEMO DATA', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' }
        : { label: 'DISCONNECTED', cls: 'bg-slate-800/80 text-slate-300 border-slate-700' };

  return (
    <header className="h-14 shrink-0 border-b border-slate-800/80 bg-[#0a0e16]/85 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 rounded border border-slate-800 bg-slate-900/70 text-slate-300 hover:text-[#4cd7f6] hover:border-[#06B6D4]/40 transition-colors"
        >
          <Menu className="w-4 h-4" />
        </button>

        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
          <span className="hidden sm:inline text-slate-400 font-mono text-xs whitespace-nowrap">
            Clusters
          </span>
          <span className="hidden sm:inline text-slate-600 font-mono text-xs">/</span>
          <span className="font-mono text-xs text-slate-200 whitespace-nowrap truncate max-w-[140px] sm:max-w-none">
            {cluster.name}
          </span>
          <span className="text-slate-600 font-mono text-xs">/</span>
          <span className="font-display font-semibold text-sm text-[#dfe2ee] whitespace-nowrap truncate">
            {SCREEN_TITLES[activeScreen]}
          </span>
        </nav>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-full border font-mono text-[10px] uppercase tracking-[0.06em] whitespace-nowrap ${modePill.cls}`}
        >
          {modePill.label}
        </span>

        {session.demoModeEnabled && (
          <button
            onClick={onToggleMode}
            className="px-2.5 py-1.5 rounded bg-slate-900/80 border border-slate-700 font-mono text-[11px] text-slate-200 hover:border-[#06B6D4]/50 transition-colors whitespace-nowrap"
          >
            {mode === 'demo' ? 'Switch to Live' : 'Demo Mode'}
          </button>
        )}

        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-400 hover:text-slate-200 hover:border-[#06B6D4]/50 transition-colors whitespace-nowrap shrink-0"
        >
          <Command className="w-3.5 h-3.5 text-[#4cd7f6]" />
          <span>Search</span>
          <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800/80 text-slate-300 border border-slate-700">
            ⌘K
          </kbd>
        </button>

        <button
          onClick={onOpenAuthModal}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-mono transition-colors whitespace-nowrap shrink-0 ${
            session.authenticated
              ? 'bg-[#1E293B] border-[#06B6D4]/40 text-[#4cd7f6]'
              : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span className="uppercase">{session.role}</span>
        </button>

        <button
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh cluster snapshot"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#06B6D4] text-[#0B0F17] font-medium text-xs hover:bg-[#22D3EE] transition-all whitespace-nowrap shrink-0 disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        <button
          onClick={onToggleDrawer}
          aria-label={drawerOpen ? 'Hide telemetry inspector' : 'Show telemetry inspector'}
          className={`p-2 rounded border transition-colors shrink-0 ${
            drawerOpen
              ? 'bg-[#1E293B] border-[#06B6D4]/40 text-[#4cd7f6]'
              : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          {drawerOpen ? (
            <PanelRightClose className="w-4 h-4" />
          ) : (
            <PanelRightOpen className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  );
};
