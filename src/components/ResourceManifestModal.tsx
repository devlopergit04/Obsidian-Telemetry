import React, { useState } from 'react';
import { Check, Copy, FileCode2, X } from 'lucide-react';

interface ResourceManifestModalProps {
  open: boolean;
  title: string;
  yaml: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

export const ResourceManifestModal: React.FC<ResourceManifestModalProps> = ({
  open,
  title,
  yaml,
  loading,
  error,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = () => {
    if (!yaml) return;
    navigator.clipboard?.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manifest-viewer-title"
        className="relative w-full max-w-3xl glass-flyout rounded shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-[#4cd7f6]" />
            <h2
              id="manifest-viewer-title"
              className="font-display font-semibold text-sm text-[#dfe2ee]"
            >
              Live Kubernetes Manifest — {title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {yaml && (
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 font-mono text-[11px] text-[#4cd7f6] hover:border-[#06B6D4]"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copied ? 'Copied' : 'Copy YAML'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close manifest viewer"
              className="p-1 rounded text-slate-400 hover:text-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="h-72 flex items-center justify-center font-mono text-xs text-slate-400">
              Fetching live object definition from Kubernetes API...
            </div>
          ) : error ? (
            <div className="rounded border border-red-500/40 bg-red-500/10 p-4 font-mono text-xs text-red-300">
              {error}
            </div>
          ) : (
            <pre className="h-[60vh] overflow-auto micro-scroll rounded border border-slate-800 bg-[#070A0F] p-4 font-mono text-[11px] text-[#4cd7f6] leading-relaxed">
              {yaml}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
