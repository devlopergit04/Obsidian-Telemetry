import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return { hasError: true, message: err.message || 'Unexpected rendering error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen obsidian-grid-floor flex items-center justify-center p-6">
          <div className="glass-panel rounded max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h1 className="font-display text-base font-semibold text-[#dfe2ee]">
                Console Rendering Fault
              </h1>
            </div>
            <p className="font-mono text-xs text-slate-300 leading-relaxed">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded bg-[#06B6D4] text-[#0B0F17] text-xs font-medium hover:bg-[#22D3EE]"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Reload Console</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
