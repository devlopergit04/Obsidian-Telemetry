import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { z } from 'zod';
import { type PlatformPaths, resolvePlatformPaths } from './platform.ts';
import { StateStore } from './services/stateStore.ts';

let dotenvLoaded = false;

const OptionalUrlSchema = z
  .string()
  .optional()
  .transform((v) => v?.trim() || undefined)
  .refine((v) => {
    if (!v) return true;
    try {
      const parsed = new URL(v);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'URL must be a valid http:// or https:// endpoint');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  OT_HOST: z.string().optional(),
  HOST: z.string().optional(),
  OT_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  CORS_ORIGIN: z.string().optional(),
  AUTH_MODE: z.enum(['token', 'optional']).optional(),
  SESSION_SECRET: z.string().optional(),
  OT_ADMIN_PASSWORD: z.string().optional(),
  OBSIDIAN_ADMIN_TOKEN: z.string().optional(),
  OBSIDIAN_OPERATOR_TOKEN: z.string().optional(),
  OBSIDIAN_VIEWER_TOKEN: z.string().optional(),
  KUBE_MODE: z.enum(['auto', 'kubeconfig', 'incluster', 'token', 'disabled']).optional(),
  KUBECONFIG_PATH: z.string().optional(),
  KUBE_CONTEXT: z.string().optional(),
  K8S_API_SERVER: OptionalUrlSchema,
  K8S_BEARER_TOKEN: z.string().optional(),
  K8S_SKIP_TLS_VERIFY: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  PROMETHEUS_URL: OptionalUrlSchema,
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
  host: string;
  port: number;
  corsOrigins: string[];
  corsOriginExplicit: boolean;
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
  paths: PlatformPaths;
  generatedAdminPassword?: string;
}

const KNOWN_PLACEHOLDER_PREFIXES = ['replace-with-', 'change-me-', 'changeme', 'example-', 'your-'];
const KNOWN_PLACEHOLDER_EXACT = new Set([
  'secret',
  'password',
  'admin',
  'token',
  'changeme',
  'change-me',
  'replace-me',
]);

export function isPlaceholder(val?: string): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (KNOWN_PLACEHOLDER_EXACT.has(lower)) return true;
  if (KNOWN_PLACEHOLDER_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return true;
  return false;
}

export function loadConfig(envSource: Record<string, string | undefined> = process.env): AppConfig {
  if (envSource === process.env && !dotenvLoaded) {
    dotenv.config({ quiet: true });
    dotenvLoaded = true;
  }
  const parsed = EnvSchema.parse(envSource);
  const paths = resolvePlatformPaths(envSource);

  const explicitSessionSecret = parsed.SESSION_SECRET?.trim();
  if (explicitSessionSecret && parsed.NODE_ENV === 'production') {
    if (isPlaceholder(explicitSessionSecret) || explicitSessionSecret.length < 32) {
      throw new Error(
        'Invalid SESSION_SECRET in production: must be at least 32 characters and not a known placeholder.'
      );
    }
  }

  for (const [envName, rawToken] of [
    ['OBSIDIAN_ADMIN_TOKEN', parsed.OBSIDIAN_ADMIN_TOKEN],
    ['OBSIDIAN_OPERATOR_TOKEN', parsed.OBSIDIAN_OPERATOR_TOKEN],
    ['OBSIDIAN_VIEWER_TOKEN', parsed.OBSIDIAN_VIEWER_TOKEN],
  ] as const) {
    const trimmed = rawToken?.trim();
    if (trimmed && parsed.NODE_ENV === 'production' && isPlaceholder(trimmed)) {
      throw new Error(
        `Invalid ${envName} in production: placeholder values are forbidden. Set a cryptographically random token or leave unset.`
      );
    }
  }

  const shouldPersist =
    parsed.NODE_ENV !== 'test' ||
    Boolean(envSource.OT_HOME || envSource.OT_CONFIG_DIR || envSource.OT_DATA_DIR);

  const store = shouldPersist ? new StateStore(paths) : null;
  const persistedConfig = store ? store.loadConfig() : { schemaVersion: 1 };

  const host = parsed.OT_HOST?.trim() || parsed.HOST?.trim() || persistedConfig.host || '0.0.0.0';

  const port = parsed.OT_PORT ?? parsed.PORT ?? persistedConfig.port ?? 1392;

  let sessionSecret =
    explicitSessionSecret && !isPlaceholder(explicitSessionSecret) ? explicitSessionSecret : '';
  let generatedAdminPassword: string | undefined;

  if (store) {
    const boot = store.ensureCredentials(parsed.OT_ADMIN_PASSWORD);
    if (!sessionSecret) {
      sessionSecret = boot.credentials.sessionSecret;
    }
    generatedAdminPassword = boot.generatedAdminPassword;
  } else if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
  }

  const corsOriginExplicit = Boolean(parsed.CORS_ORIGIN && parsed.CORS_ORIGIN.trim());
  const corsOrigins = corsOriginExplicit
    ? parsed
        .CORS_ORIGIN!.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [`http://localhost:${port}`, `http://127.0.0.1:${port}`];

  const authMode: 'token' | 'optional' =
    parsed.AUTH_MODE ??
    persistedConfig.authMode ??
    (parsed.NODE_ENV === 'production' ? 'token' : 'optional');

  const kubeMode = parsed.KUBE_MODE ?? persistedConfig.kubeMode ?? 'auto';

  const prometheusUrl =
    parsed.PROMETHEUS_URL?.replace(/\/+$/, '') ||
    persistedConfig.prometheusUrl?.trim().replace(/\/+$/, '') ||
    undefined;

  return {
    nodeEnv: parsed.NODE_ENV,
    host,
    port,
    corsOrigins,
    corsOriginExplicit,
    authMode,
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
    kubeMode,
    kubeconfigPath: parsed.KUBECONFIG_PATH?.trim() || undefined,
    kubeContext: parsed.KUBE_CONTEXT?.trim() || undefined,
    k8sApiServer: parsed.K8S_API_SERVER?.replace(/\/+$/, '') || undefined,
    k8sBearerToken: parsed.K8S_BEARER_TOKEN?.trim() || undefined,
    k8sSkipTlsVerify: Boolean(parsed.K8S_SKIP_TLS_VERIFY),
    prometheusUrl,
    prometheusBearerToken: parsed.PROMETHEUS_BEARER_TOKEN?.trim() || undefined,
    prometheusTimeoutMs: parsed.PROMETHEUS_TIMEOUT_MS,
    enablePodExec: Boolean(parsed.ENABLE_POD_EXEC) || Boolean(persistedConfig.enablePodExec),
    execTimeoutMs: parsed.EXEC_TIMEOUT_MS,
    rateLimitWindowMs: parsed.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    enableDemoMode: parsed.ENABLE_DEMO_MODE,
    paths,
    generatedAdminPassword,
  };
}
