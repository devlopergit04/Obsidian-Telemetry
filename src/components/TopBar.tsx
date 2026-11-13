import React from 'react';
import {
  Command,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
} from 'lucide-react';
import { ClusterData, ScreenId } from '../types/telemetry';

interface TopBarProps {
  cluster: ClusterData;
  activeScreen: ScreenId;
  isLive: boolean;
  onToggleLive: () => void;
  onOpenCommandPalette: () => void;
  onOpenDeployModal: () => void;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  onOpenMobileNav: () => void;
}

const SCREEN_TITLES: Record<ScreenId, string> = {
  [ScreenId.OVERVIEW]: 'Cluster Overview',
  [ScreenId.NODES]: 'Nodes & Workloads',
  [ScreenId.LOGS]: 'Live Log Stream',
  [ScreenId.NETWORK]: 'Network Topology',
  [ScreenId.INCIDENTS]: 'Incidents & Alerts',
};

export const TopBar: React.FC<TopBarProps> = ({
  cluster,
  activeScreen,
  isLive,
  onToggleLive,
  onOpenCommandPalette,
  onOpenDeployModal,
  drawerOpen,
  onToggleDrawer,
  onOpenMobileNav,
}) => {
  return (
    <header className="h-14 shrink-0 border-b border-slate-800/80 bg-[#0a0e16]/85 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between gap-4">
      {/* Left: Mobile Trigger + Contextual Breadcrumbs */}
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

      {/* Right: Stream Control + Command Palette + Primary Action + Drawer Toggle */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Live Telemetry Toggle */}
        <button
          onClick={onToggleLive}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono border transition-colors whitespace-nowrap shrink-0 ${
            isLive
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15'
              : 'bg-slate-900/70 text-slate-300 border-slate-800 hover:border-slate-700'
          }`}
          title={isLive ? 'Pause live telemetry stream' : 'Resume live telemetry stream'}
        >
          {isLive ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="telemetry-beacon-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
          ) : (
            <Play className="w-3 h-3 text-slate-400" />
          )}
          <span className="hidden sm:inline">{isLive ? 'LIVE STREAM' : 'PAUSED'}</span>
          {isLive && <Pause className="w-3 h-3 opacity-70 hidden sm:inline" />}
        </button>

        {/* Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-400 hover:text-slate-200 hover:border-[#06B6D4]/50 transition-colors whitespace-nowrap shrink-0"
        >
          <Command className="w-3.5 h-3.5 text-[#4cd7f6]" />
          <span>Search nodes, logs...</span>
          <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800/80 text-slate-300 border border-slate-700">
            ⌘K
          </kbd>
        </button>

        {/* Primary Action */}
        <button
          onClick={onOpenDeployModal}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[#06B6D4] text-[#0B0F17] font-medium text-xs hover:bg-[#22D3EE] hover:shadow-[0_0_12px_rgba(6,182,212,0.4)] transition-all whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Deploy Manifest</span>
        </button>

        {/* Inspector Drawer Toggle */}
        <button
          onClick={onToggleDrawer}
          aria-label={drawerOpen ? 'Hide telemetry inspector' : 'Show telemetry inspector'}
          title={drawerOpen ? 'Hide telemetry inspector' : 'Show telemetry inspector'}
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
