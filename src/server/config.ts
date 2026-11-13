import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  AUTH_MODE: z.enum(['token', 'optional']).default('optional'),
  SESSION_SECRET: z.string().optional(),
  OBSIDIAN_ADMIN_TOKEN: z.string().optional(),
  OBSIDIAN_OPERATOR_TOKEN: z.string().optional(),
  OBSIDIAN_VIEWER_TOKEN: z.string().optional(),
  KUBE_MODE: z.enum(['auto', 'kubeconfig', 'incluster', 'token', 'disabled']).default('auto'),
  KUBECONFIG_PATH: z.string().optional(),
  KUBE_CONTEXT: z.string().optional(),
  K8S_API_SERVER: z.string().optional(),
  K8S_BEARER_TOKEN: z.string().optional(),
  K8S_SKIP_TLS_VERIFY: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  PROMETHEUS_URL: z.string().optional(),
  PROMETHEUS_BEARER_TOKEN: z.string().optional(),
  PROMETHEUS_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
  ENABLE_POD_EXEC: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  EXEC_TIMEOUT_MS: z.coerce.number().int().min(10000).max(1800000).default(300000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).default(240),
  ENABLE_DEMO_MODE: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
});

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  corsOrigins: string[];
  authMode: 'token' | 'optional';
  sessionSecret: string;
  adminToken: string;
  operatorToken: string;
  viewerToken: string;
  kubeMode: 'auto' | 'kubeconfig' | 'incluster' | 'token' | 'disabled';
  kubeconfigPath?: string;
  kubeContext?: string;
  k8sApiServer?: string;
  k8sBearerToken?: string;
  k8sSkipTlsVerify: boolean;
  prometheusUrl?: string;
  prometheusBearerToken?: string;
  prometheusTimeoutMs: number;
  enablePodExec: boolean;
  execTimeoutMs: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  enableDemoMode: boolean;
}

function isPlaceholder(val?: string): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  return trimmed.length === 0 || trimmed.startsWith('replace-with-');
}

export function loadConfig(envSource: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = EnvSchema.parse(envSource);

  const sessionSecret = !isPlaceholder(parsed.SESSION_SECRET)
    ? parsed.SESSION_SECRET!.trim()
    : crypto.randomBytes(32).toString('hex');

  const corsOrigins = parsed.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    corsOrigins,
    authMode: parsed.AUTH_MODE,
    sessionSecret,
    adminToken: !isPlaceholder(parsed.OBSIDIAN_ADMIN_TOKEN)
      ? parsed.OBSIDIAN_ADMIN_TOKEN!.trim()
      : '',
    operatorToken: !isPlaceholder(parsed.OBSIDIAN_OPERATOR_TOKEN)
      ? parsed.OBSIDIAN_OPERATOR_TOKEN!.trim()
      : '',
    viewerToken: !isPlaceholder(parsed.OBSIDIAN_VIEWER_TOKEN)
      ? parsed.OBSIDIAN_VIEWER_TOKEN!.trim()
      : '',
    kubeMode: parsed.KUBE_MODE,
    kubeconfigPath: parsed.KUBECONFIG_PATH?.trim() || undefined,
    kubeContext: parsed.KUBE_CONTEXT?.trim() || undefined,
    k8sApiServer: parsed.K8S_API_SERVER?.trim() || undefined,
    k8sBearerToken: parsed.K8S_BEARER_TOKEN?.trim() || undefined,
    k8sSkipTlsVerify: Boolean(parsed.K8S_SKIP_TLS_VERIFY),
    prometheusUrl: parsed.PROMETHEUS_URL?.trim().replace(/\/+$/, '') || undefined,
    prometheusBearerToken: parsed.PROMETHEUS_BEARER_TOKEN?.trim() || undefined,
    prometheusTimeoutMs: parsed.PROMETHEUS_TIMEOUT_MS,
    enablePodExec: Boolean(parsed.ENABLE_POD_EXEC),
    execTimeoutMs: parsed.EXEC_TIMEOUT_MS,
    rateLimitWindowMs: parsed.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    enableDemoMode: parsed.ENABLE_DEMO_MODE,
  };
}
