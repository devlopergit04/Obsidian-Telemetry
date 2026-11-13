import React from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';

export interface ConfirmActionRequest {
  title: string;
  description: string;
  target: string;
  destructive?: boolean;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

interface ConfirmActionModalProps {
  request: ConfirmActionRequest | null;
  busy: boolean;
  onCancel: () => void;
  onExecute: () => void;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  request,
  busy,
  onCancel,
  onExecute,
}) => {
  if (!request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-action-title"
        className={`relative w-full max-w-md glass-flyout rounded shadow-2xl overflow-hidden ${
          request.destructive ? 'glow-critical' : 'glow-cyan-focus'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            {request.destructive ? (
              <ShieldAlert className="w-4 h-4 text-red-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            )}
            <h2
              id="confirm-action-title"
              className="font-display font-semibold text-sm text-[#dfe2ee]"
            >
              {request.title}
            </h2>
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            aria-label="Cancel action"
            className="p-1 rounded text-slate-400 hover:text-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded border border-slate-800 bg-[#070A0F] px-3 py-2 font-mono text-xs text-[#4cd7f6] break-all">
            {request.target}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{request.description}</p>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2 rounded bg-slate-900/70 border border-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onExecute}
              disabled={busy}
              className={`px-4 py-2 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                request.destructive
                  ? 'bg-red-500 text-white hover:bg-red-400'
                  : 'bg-[#06B6D4] text-[#0B0F17] hover:bg-[#22D3EE]'
              }`}
            >
              {busy ? 'Executing...' : request.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
