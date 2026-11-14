#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../server/config.ts';
import {
  ensureDirSync,
  getReachableUrls,
  resolvePlatformPaths,
  rotateLogIfNeededSync,
} from '../server/platform.ts';
import { StateStore } from '../server/services/stateStore.ts';

interface CliOptions {
  command: string;
  targetArg?: string;
  host?: string;
  port?: string;
  password?: string;
  foreground: boolean;
  yes: boolean;
}

function parseCli(argv: string[]): CliOptions {
  const args = [...argv];
  let command = 'start';
  let commandExplicit = false;
  let targetArg: string | undefined;
  let host: string | undefined;
  let port: string | undefined;
  let password: string | undefined;
  let foreground = false;
  let yes = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      command = 'help';
      commandExplicit = true;
    } else if (arg === '--version' || arg === '-v') {
      command = 'version';
      commandExplicit = true;
    } else if (arg === '--foreground' || arg === '-f') {
      foreground = true;
    } else if (arg === '--yes' || arg === '-y') {
      yes = true;
    } else if ((arg === '--port' || arg === '-p') && args[i + 1]) {
      port = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--port=')) {
      port = arg.slice('--port='.length);
    } else if ((arg === '--host' || arg === '-H') && args[i + 1]) {
      host = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--host=')) {
      host = arg.slice('--host='.length);
    } else if (arg === '--password' && args[i + 1]) {
      password = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--password=')) {
      password = arg.slice('--password='.length);
    } else if (!arg.startsWith('-') && !commandExplicit) {
      command = arg;
      commandExplicit = true;
    } else if (!arg.startsWith('-') && commandExplicit && !targetArg) {
      targetArg = arg;
    } else {
      console.error(`Unknown option or argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return { command, targetArg, host, port, password, foreground, yes };
}

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, '..'),
    path.resolve(currentDir, '..', '..'),
    path.resolve(currentDir, '..', '..', '..'),
    process.cwd(),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
  }
  return process.cwd();
}

function readPackageMeta(packageRoot: string): { name: string; version: string } {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      name?: string;
      version?: string;
    };
    return {
      name: raw.name || 'obsidian-telemetry',
      version: raw.version || '1.0.0',
    };
  } catch {
    return { name: 'obsidian-telemetry', version: '1.0.0' };
  }
}

function printHelp(): void {
  console.log(`Obsidian Telemetry CLI

Usage:
  ot [command] [options]

Commands:
  start                 Start Obsidian Telemetry (default when running 'ot')
  stop                  Stop the running Obsidian Telemetry service
  restart               Restart Obsidian Telemetry
  status                Show service status, listening address, and dashboard URL
  update                Update Obsidian Telemetry to the latest release
  uninstall             Stop service and remove Obsidian Telemetry managed files
  backup [file]         Export config, credentials, triage state, and audit trail (SHA-256 verified)
  restore <file>        Restore Obsidian Telemetry state from a verified backup file
  passwd [username]     Reset or update a local account password (default user: admin)

Options:
  -p, --port <port>     HTTP listening port (default: 1392, or OT_PORT)
  -H, --host <host>     Listening bind address (default: 0.0.0.0, or OT_HOST)
  -f, --foreground      Run server attached to current terminal
  -y, --yes             Skip interactive confirmation prompts (for uninstall)
  --password <value>    Supply password non-interactively for 'ot passwd'
  -v, --version         Print version
  -h, --help            Show help`);
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

async function probeHealth(host: string, port: number): Promise<{ ok: boolean; service?: string }> {
  const connectHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`http://${connectHost}:${port}/api/health`, {
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { service?: string };
    return { ok: body.service === 'obsidian-telemetry', service: body.service };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function isPortOccupied(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    tester.once('listening', () => {
      tester.close(() => resolve(false));
    });
    tester.listen(port, host);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printRunningBanner(opts: {
  host: string;
  port: number;
  authMode: string;
  pid?: number;
  generatedAdminPassword?: string;
  credentialsFile?: string;
}): void {
  const urls = getReachableUrls(opts.host, opts.port);
  const primaryUrl = urls[0] || `http://localhost:${opts.port}`;

  console.log('Obsidian Telemetry\n');
  console.log('Status: Running');
  if (opts.pid) {
    console.log(`PID: ${opts.pid}`);
  }
  console.log(`Host: ${opts.host}`);
  console.log(`Port: ${opts.port}\n`);
  console.log(`Dashboard: ${primaryUrl}`);
  if (urls.length > 1) {
    for (const extraUrl of urls.slice(1)) {
      console.log(`Network:   ${extraUrl}`);
    }
  }
  console.log(`Auth Mode: ${opts.authMode}`);

  if (opts.generatedAdminPassword && opts.credentialsFile) {
    console.log('');
    console.log('Initial Administrator Credentials (shown once):');
    console.log('  Username: admin');
    console.log(`  Password: ${opts.generatedAdminPassword}`);
    console.log(`  Stored:   ${opts.credentialsFile}`);
    console.log('  Change this password after signing in via the Session panel.');
  }
}

function buildCliEnv(opts?: { host?: string; port?: string }): Record<string, string | undefined> {
  const envOverrides: Record<string, string | undefined> = {
    ...process.env,
    NODE_ENV: 'production',
    OT_MANAGED: '1',
  };
  delete envOverrides.PORT;
  if (opts?.port) envOverrides.OT_PORT = opts.port;
  if (opts?.host) envOverrides.OT_HOST = opts.host;
  return envOverrides;
}

async function cmdStart(opts: CliOptions, packageRoot: string): Promise<number> {
  const envOverrides = buildCliEnv({ host: opts.host, port: opts.port });

  const config = loadConfig(envOverrides);
  const store = new StateStore(config.paths);
  const existingPid = store.readPid();

  if (existingPid && isProcessAlive(existingPid.pid)) {
    const health = await probeHealth(existingPid.host, existingPid.port);
    if (health.ok) {
      printRunningBanner({
        host: existingPid.host,
        port: existingPid.port,
        authMode: config.authMode,
        pid: existingPid.pid,
      });
      return 0;
    }
  } else if (existingPid) {
    store.clearPid();
  }

  const occupied = await isPortOccupied(config.host, config.port);
  if (occupied) {
    const health = await probeHealth(config.host, config.port);
    if (health.ok) {
      printRunningBanner({
        host: config.host,
        port: config.port,
        authMode: config.authMode,
      });
      return 0;
    }
    console.error(
      `Error: Port ${config.port} on ${config.host} is already in use by another process. Stop the conflicting service or start with OT_PORT=<port> / --port <port>.`
    );
    return 1;
  }

  const compiledServer = path.join(packageRoot, 'dist-server', 'server.js');
  const tsServer = path.join(packageRoot, 'server.ts');
  const distIndex = path.join(packageRoot, 'dist', 'index.html');

  if (!fs.existsSync(distIndex)) {
    console.error(
      `Error: Frontend production bundle missing at ${distIndex}. Reinstall obsidian-telemetry or run 'npm run build'.`
    );
    return 1;
  }

  const useCompiled = fs.existsSync(compiledServer);
  const entry = useCompiled ? compiledServer : tsServer;

  if (opts.foreground) {
    const childArgs = useCompiled
      ? [entry, '--host', config.host, '--port', String(config.port)]
      : ['--import', 'tsx', entry, '--host', config.host, '--port', String(config.port)];

    const result = spawnSync(process.execPath, childArgs, {
      stdio: 'inherit',
      env: {
        ...envOverrides,
        OT_HOST: config.host,
        OT_PORT: String(config.port),
      },
    });
    return result.status ?? 0;
  }

  ensureDirSync(config.paths.logsDir);
  rotateLogIfNeededSync(config.paths.serverLogFile);
  const logFd = fs.openSync(config.paths.serverLogFile, 'a', 0o600);
  const spawnArgs = useCompiled
    ? [entry, '--host', config.host, '--port', String(config.port)]
    : ['--import', 'tsx', entry, '--host', config.host, '--port', String(config.port)];

  const child = spawn(process.execPath, spawnArgs, {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
    env: {
      ...envOverrides,
      OT_HOST: config.host,
      OT_PORT: String(config.port),
    },
  });
  fs.closeSync(logFd);

  if (!child.pid) {
    console.error('Error: Failed to spawn Obsidian Telemetry background process.');
    return 1;
  }
  child.unref();

  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const health = await probeHealth(config.host, config.port);
    if (health.ok) {
      printRunningBanner({
        host: config.host,
        port: config.port,
        authMode: config.authMode,
        pid: child.pid,
        generatedAdminPassword: config.generatedAdminPassword,
        credentialsFile: config.paths.credentialsFile,
      });
      return 0;
    }
    if (!isProcessAlive(child.pid)) {
      console.error(
        `Error: Obsidian Telemetry failed to start. Check logs at ${config.paths.serverLogFile}`
      );
      return 1;
    }
    await delay(150);
  }

  console.error(
    `Error: Timed out waiting for Obsidian Telemetry to listen on ${config.host}:${config.port}. Check logs at ${config.paths.serverLogFile}`
  );
  return 1;
}

async function cmdStop(): Promise<number> {
  const paths = resolvePlatformPaths(process.env);
  const store = new StateStore(paths);
  const pidInfo = store.readPid();

  if (!pidInfo) {
    console.log('Obsidian Telemetry\n\nStatus: Stopped');
    return 0;
  }

  if (!isProcessAlive(pidInfo.pid)) {
    store.clearPid();
    console.log('Obsidian Telemetry\n\nStatus: Stopped (cleaned stale PID metadata)');
    return 0;
  }

  try {
    process.kill(pidInfo.pid, 'SIGTERM');
  } catch (err) {
    console.error(
      `Failed to terminate PID ${pidInfo.pid}: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pidInfo.pid)) {
      store.clearPid();
      console.log(`Obsidian Telemetry stopped (PID ${pidInfo.pid}).`);
      return 0;
    }
    await delay(120);
  }

  try {
    process.kill(pidInfo.pid, 'SIGKILL');
    await delay(300);
  } catch {
    // Ignore if already exited
  }
  store.clearPid();
  console.log(`Obsidian Telemetry stopped forcefully (PID ${pidInfo.pid}).`);
  return 0;
}

async function cmdStatus(): Promise<number> {
  const config = loadConfig(buildCliEnv());
  const store = new StateStore(config.paths);
  const pidInfo = store.readPid();

  if (pidInfo && isProcessAlive(pidInfo.pid)) {
    const health = await probeHealth(pidInfo.host, pidInfo.port);
    if (health.ok) {
      printRunningBanner({
        host: pidInfo.host,
        port: pidInfo.port,
        authMode: config.authMode,
        pid: pidInfo.pid,
      });
      return 0;
    }
  } else if (pidInfo) {
    store.clearPid();
  }

  const healthAtDefault = await probeHealth(config.host, config.port);
  if (healthAtDefault.ok) {
    printRunningBanner({
      host: config.host,
      port: config.port,
      authMode: config.authMode,
    });
    return 0;
  }

  console.log('Obsidian Telemetry\n');
  console.log('Status: Stopped');
  console.log(`Configured Host: ${config.host}`);
  console.log(`Configured Port: ${config.port}`);
  return 1;
}

function detectInstallPrefix(packageRoot: string): string | null {
  const normalized = path.normalize(packageRoot);
  const posixSuffix = path.join('lib', 'node_modules', 'obsidian-telemetry');
  const winSuffix = path.join('node_modules', 'obsidian-telemetry');
  if (normalized.endsWith(posixSuffix)) {
    return normalized.slice(0, -posixSuffix.length - 1);
  }
  if (normalized.endsWith(winSuffix)) {
    return normalized.slice(0, -winSuffix.length - 1);
  }
  return null;
}

function getNpmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

async function cmdUpdate(packageRoot: string, opts: CliOptions): Promise<number> {
  const paths = resolvePlatformPaths(process.env);
  const store = new StateStore(paths);
  const prevPid = store.readPid();
  const wasRunning = Boolean(prevPid && isProcessAlive(prevPid.pid));

  // Stop running process before overwriting package files (prevents Windows EBUSY/EPERM locks)
  if (wasRunning) {
    console.log('Stopping running Obsidian Telemetry service before update...');
    await cmdStop();
  }

  const spec = process.env.OT_NPM_SPEC?.trim() || 'obsidian-telemetry@latest';
  const prefix = process.env.OT_INSTALL_PREFIX?.trim() || detectInstallPrefix(packageRoot);
  const npmArgs = ['install', '-g', '--no-fund', '--no-audit', spec];
  if (prefix) {
    npmArgs.push('--prefix', prefix);
  }

  console.log(`Updating Obsidian Telemetry from ${spec}...`);
  const res = spawnSync(getNpmCommand(), npmArgs, {
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    console.error('Update failed. Check network access and npm permissions.');
    if (wasRunning) {
      console.log('Restoring previous Obsidian Telemetry service...');
      await cmdStart(opts, packageRoot);
    }
    return res.status ?? 1;
  }

  if (wasRunning) {
    console.log('Starting updated Obsidian Telemetry release...');
    return cmdStart(opts, packageRoot);
  }

  console.log('Obsidian Telemetry updated cleanly.');
  return 0;
}

async function confirmPrompt(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return false;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(`${question} [y/N]: `);
    return ['y', 'yes'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

async function cmdBackup(opts: CliOptions): Promise<number> {
  const paths = resolvePlatformPaths(process.env);
  const store = new StateStore(paths);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.resolve(
    opts.targetArg || path.join(process.cwd(), `obsidian-telemetry-backup-${timestamp}.json`)
  );
  const bundle = store.exportBackup(outPath);
  console.log(`Backup written: ${outPath}`);
  console.log(`Created:        ${bundle.createdAt}`);
  console.log(`SHA-256:        ${bundle.checksumSha256}`);
  return 0;
}

async function cmdRestore(opts: CliOptions): Promise<number> {
  if (!opts.targetArg) {
    console.error('Error: Specify a backup file path. Usage: ot restore <backup-file.json>');
    return 1;
  }
  const inputPath = path.resolve(opts.targetArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Backup file not found: ${inputPath}`);
    return 1;
  }

  const paths = resolvePlatformPaths(process.env);
  const store = new StateStore(paths);
  const prevPid = store.readPid();
  const wasRunning = Boolean(prevPid && isProcessAlive(prevPid.pid));

  if (wasRunning) {
    console.log('Stopping running Obsidian Telemetry before restore...');
    await cmdStop();
  }

  const bundle = store.importBackup(inputPath);
  console.log(`Restored backup created at ${bundle.createdAt} (SHA-256 verified).`);

  if (wasRunning) {
    const packageRoot = resolvePackageRoot();
    return cmdStart(opts, packageRoot);
  }
  return 0;
}

async function cmdPasswd(opts: CliOptions): Promise<number> {
  const username = (opts.targetArg || 'admin').trim().toLowerCase();
  if (!username) {
    console.error('Error: Invalid username.');
    return 1;
  }

  let newPassword = opts.password?.trim() || '';
  if (!newPassword) {
    if (!process.stdin.isTTY) {
      console.error(
        'Error: Provide --password <new-password> when running ot passwd non-interactively.'
      );
      return 1;
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      newPassword = (await rl.question(`New password for '${username}' (min 8 chars): `)).trim();
    } finally {
      rl.close();
    }
  }

  if (newPassword.length < 8) {
    console.error('Error: Password must be at least 8 characters long.');
    return 1;
  }

  const paths = resolvePlatformPaths(process.env);
  const store = new StateStore(paths);
  store.ensureCredentials();
  store.setUserPassword(username, newPassword);
  console.log(`Updated password hash for '${username}' in ${paths.credentialsFile}`);
  return 0;
}

async function cmdUninstall(packageRoot: string, opts: CliOptions): Promise<number> {
  const paths = resolvePlatformPaths(process.env);
  if (!opts.yes) {
    if (!process.stdin.isTTY) {
      console.error('Uninstall aborted in non-interactive terminal. Re-run with --yes to confirm.');
      return 1;
    }
    const ok = await confirmPrompt(
      `Stop service and remove Obsidian Telemetry config/data directories (${paths.configDir}, ${paths.dataDir})?`
    );
    if (!ok) {
      console.log('Uninstall cancelled.');
      return 0;
    }
  }

  await cmdStop();

  const targetsToRemove = new Set<string>([paths.configDir, paths.dataDir]);
  for (const dir of targetsToRemove) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`Removed ${dir}`);
    }
  }

  const customHome = process.env.OT_HOME?.trim();
  if (customHome && fs.existsSync(customHome)) {
    try {
      if (fs.readdirSync(customHome).length === 0) {
        fs.rmdirSync(customHome);
        console.log(`Removed empty ${customHome}`);
      }
    } catch {
      // Leave customHome untouched if non-empty or inaccessible
    }
  }

  const shimPath = path.join(process.env.HOME || '', '.local', 'bin', 'ot');
  if (process.platform !== 'win32' && shimPath && fs.existsSync(shimPath)) {
    try {
      const stat = fs.lstatSync(shimPath);
      if (stat.isSymbolicLink() || stat.isFile()) {
        const content = stat.isSymbolicLink()
          ? fs.readlinkSync(shimPath)
          : fs.readFileSync(shimPath, 'utf8');
        if (content.includes('obsidian-telemetry') || content.includes('Obsidian')) {
          fs.unlinkSync(shimPath);
          console.log(`Removed CLI shim ${shimPath}`);
        }
      }
    } catch {
      // Ignore shim removal errors
    }
  }

  const installPrefix = detectInstallPrefix(packageRoot);
  if (installPrefix) {
    console.log('Removing obsidian-telemetry package...');
    spawnSync(
      getNpmCommand(),
      ['uninstall', '-g', 'obsidian-telemetry', '--prefix', installPrefix],
      {
        stdio: 'inherit',
      }
    );
  }

  console.log('Obsidian Telemetry uninstalled.');
  return 0;
}

async function main(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const packageRoot = resolvePackageRoot();
  const meta = readPackageMeta(packageRoot);

  switch (opts.command) {
    case 'help':
      printHelp();
      process.exit(0);
    case 'version':
      console.log(`${meta.name} v${meta.version}`);
      process.exit(0);
    case 'start':
      process.exit(await cmdStart(opts, packageRoot));
    case 'stop':
      process.exit(await cmdStop());
    case 'restart': {
      await cmdStop();
      process.exit(await cmdStart(opts, packageRoot));
    }
    case 'status':
      process.exit(await cmdStatus());
    case 'update':
      process.exit(await cmdUpdate(packageRoot, opts));
    case 'backup':
      process.exit(await cmdBackup(opts));
    case 'restore':
      process.exit(await cmdRestore(opts));
    case 'passwd':
      process.exit(await cmdPasswd(opts));
    case 'uninstall':
      process.exit(await cmdUninstall(packageRoot, opts));
    default:
      console.error(`Unknown command: ${opts.command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('CLI error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
