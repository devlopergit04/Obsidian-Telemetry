import React, { useState } from 'react';
import { Rocket, X } from 'lucide-react';
import { ClusterData } from '../types/telemetry';

interface ManifestModalProps {
  open: boolean;
  onClose: () => void;
  cluster: ClusterData;
  onDeployPod: (spec: {
    name: string;
    namespace: string;
    image: string;
    nodeId: string;
    cpuLimitMillicores: number;
    memoryLimitMiB: number;
  }) => void;
}

export const ManifestModal: React.FC<ManifestModalProps> = ({
  open,
  onClose,
  cluster,
  onDeployPod,
}) => {
  const [name, setName] = useState('edge-cache-worker');
  const [namespace, setNamespace] = useState('payments-prod');
  const [image, setImage] = useState('ghcr.io/obsidian/edge-cache:1.4.2');
  const [nodeId, setNodeId] = useState(cluster.nodes[0]?.id || '');
  const [cpuLimit, setCpuLimit] = useState(1000);
  const [memLimit, setMemLimit] = useState(2048);

  if (!open) return null;

  const selectedNode = cluster.nodes.find((n) => n.id === nodeId) || cluster.nodes[0];

  const yamlPreview = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name || 'workload'}
  namespace: ${namespace || 'default'}
spec:
  replicas: 1
  template:
    spec:
      nodeName: ${selectedNode?.hostname || 'auto'}
      containers:
        - name: ${name || 'workload'}
          image: ${image}
          resources:
            limits:
              cpu: "${cpuLimit}m"
              memory: "${memLimit}Mi"`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedNode) return;
    const suffix = Math.random().toString(36).slice(2, 7);
    onDeployPod({
      name: `${name.trim().toLowerCase().replace(/\s+/g, '-')}-${suffix}`,
      namespace: namespace.trim() || 'default',
      image: image.trim() || 'nginx:1.27-alpine',
      nodeId: selectedNode.id,
      cpuLimitMillicores: cpuLimit,
      memoryLimitMiB: memLimit,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-2xl glass-flyout rounded shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div>
            <h2 className="font-display font-semibold text-sm text-[#dfe2ee]">
              Deploy Workload Manifest
            </h2>
            <p className="font-mono text-[11px] text-slate-400">
              Target cluster: {cluster.name} ({cluster.region})
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1">
                Workload Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded bg-slate-950/80 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
                required
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1">
                Namespace
              </label>
              <input
                type="text"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                className="w-full rounded bg-slate-950/80 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1">
                Container Image
              </label>
              <input
                type="text"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                className="w-full rounded bg-slate-950/80 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1">
                Target Node
              </label>
              <select
                value={selectedNode?.id || ''}
                onChange={(e) => setNodeId(e.target.value)}
                className="w-full rounded bg-slate-950/80 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
              >
                {cluster.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.ip} · {n.zone} ({n.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1">
                  CPU Limit (m)
                </label>
                <input
                  type="number"
                  min={100}
                  max={8000}
                  step={100}
                  value={cpuLimit}
                  onChange={(e) => setCpuLimit(Number(e.target.value))}
                  className="w-full rounded bg-slate-950/80 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1">
                  Mem Limit (Mi)
                </label>
                <input
                  type="number"
                  min={128}
                  max={16384}
                  step={128}
                  value={memLimit}
                  onChange={(e) => setMemLimit(Number(e.target.value))}
                  className="w-full rounded bg-slate-950/80 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1">
              Generated YAML Preview
            </div>
            <pre className="flex-1 rounded border border-slate-800 bg-[#070A0F] p-3 font-mono text-[11px] text-[#4cd7f6] overflow-auto micro-scroll leading-relaxed">
              {yamlPreview}
            </pre>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded bg-slate-900/70 border border-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#06B6D4] text-[#0B0F17] text-xs font-medium hover:bg-[#22D3EE] hover:shadow-[0_0_12px_rgba(6,182,212,0.4)] transition-all"
              >
                <Rocket className="w-3.5 h-3.5" />
                <span>Apply Manifest</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
