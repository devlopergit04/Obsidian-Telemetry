import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface PlatformPaths {
  platform: NodeJS.Platform;
  configDir: string;
  dataDir: string;
  logsDir: string;
  configFile: string;
  credentialsFile: string;
  stateFile: string;
  auditFile: string;
  pidFile: string;
  serverLogFile: string;
}

export function resolvePlatformPaths(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  homeDir: string = os.homedir()
): PlatformPaths {
  const customHome = env.OT_HOME?.trim();
  let configDir = env.OT_CONFIG_DIR?.trim() || '';
  let dataDir = env.OT_DATA_DIR?.trim() || '';

  if (customHome) {
    configDir = configDir || path.join(customHome, 'config');
    dataDir = dataDir || path.join(customHome, 'data');
  } else if (platform === 'win32') {
    const appData = env.APPDATA?.trim() || path.join(homeDir, 'AppData', 'Roaming');
    const localAppData = env.LOCALAPPDATA?.trim() || path.join(homeDir, 'AppData', 'Local');
    configDir = configDir || path.join(appData, 'Obsidian Telemetry');
    dataDir = dataDir || path.join(localAppData, 'Obsidian Telemetry');
  } else if (platform === 'darwin') {
    const appSupport = path.join(homeDir, 'Library', 'Application Support', 'Obsidian Telemetry');
    configDir = configDir || path.join(appSupport, 'config');
    dataDir = dataDir || appSupport;
  } else {
    const xdgConfig = env.XDG_CONFIG_HOME?.trim() || path.join(homeDir, '.config');
    const xdgData = env.XDG_DATA_HOME?.trim() || path.join(homeDir, '.local', 'share');
    configDir = configDir || path.join(xdgConfig, 'obsidian-telemetry');
    dataDir = dataDir || path.join(xdgData, 'obsidian-telemetry');
  }

  const logsDir = path.join(dataDir, 'logs');

  return {
    platform,
    configDir,
    dataDir,
    logsDir,
    configFile: path.join(configDir, 'config.json'),
    credentialsFile: path.join(configDir, 'credentials.json'),
    stateFile: path.join(dataDir, 'state.json'),
    auditFile: path.join(dataDir, 'audit.jsonl'),
    pidFile: path.join(dataDir, 'obsidian.pid'),
    serverLogFile: path.join(logsDir, 'server.log'),
  };
}

export function ensureDirSync(dirPath: string, mode = 0o700): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode });
  }
}

export function writeFileAtomicSync(filePath: string, content: string, mode?: number): void {
  ensureDirSync(path.dirname(filePath));
  const nonce = crypto.randomUUID().slice(0, 8);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${nonce}.tmp`;
  try {
    fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode });
    fs.renameSync(tmpPath, filePath);
    if (mode !== undefined && process.platform !== 'win32') {
      try {
        fs.chmodSync(filePath, mode);
      } catch {
        // Ignore chmod errors on filesystems that do not support POSIX modes
      }
    }
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // Ignore temp file cleanup errors
    }
    throw err;
  }
}

export function rotateLogIfNeededSync(
  logFilePath: string,
  maxBytes = 5 * 1024 * 1024,
  maxArchives = 3
): boolean {
  if (!fs.existsSync(logFilePath)) {
    return false;
  }
  try {
    const stat = fs.statSync(logFilePath);
    if (stat.size < maxBytes) {
      return false;
    }

    for (let idx = maxArchives; idx >= 1; idx -= 1) {
      const target = `${logFilePath}.${idx}`;
      if (idx === maxArchives && fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
      const prev = idx === 1 ? logFilePath : `${logFilePath}.${idx - 1}`;
      if (fs.existsSync(prev)) {
        fs.renameSync(prev, target);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function getReachableUrls(host: string, port: number): string[] {
  if (host !== '0.0.0.0' && host !== '::') {
    const displayHost = host === '127.0.0.1' ? 'localhost' : host;
    return [`http://${displayHost}:${port}`];
  }

  const urls = [`http://localhost:${port}`];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const info of entries) {
      if (info.family === 'IPv4' && !info.internal) {
        const candidate = `http://${info.address}:${port}`;
        if (!urls.includes(candidate)) {
          urls.push(candidate);
        }
      }
    }
  }
  return urls;
}
