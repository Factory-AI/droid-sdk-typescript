import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import { ConnectionError } from '../errors.js';

const SOCKET_TIMEOUT_MS = 2_000;
const STARTUP_POLL_INTERVAL_MS = 250;
const STARTUP_TIMEOUT_MS = 30_000;
const MAX_STARTUP_ATTEMPTS = 3;

const FACTORY_DIR = '.factory';

const DEFAULT_PORT = 37643;
const DAEMON_PORT_FILE = 'daemon.port';
const DEFAULT_HOST = '127.0.0.1';

type DaemonStartupResult = 'ready' | 'timeout' | 'exited';

let spawnedDaemonProcess: ChildProcess | null = null;
let daemonTarget: { host: string; port: number } | null = null;
let daemonEnsureInflight: Promise<{ port: number }> | null = null;

function getFactoryHome(): string {
  return process.env.FACTORY_HOME_OVERRIDE || os.homedir();
}

function getFactoryDirName(): string {
  return FACTORY_DIR;
}

function getFactoryDir(): string {
  return path.join(getFactoryHome(), getFactoryDirName());
}

function getSdkDir(): string {
  return path.join(getFactoryDir(), 'sdk');
}

function getDefaultDaemonPort(): number {
  return DEFAULT_PORT;
}

function resolveExecPath(): string {
  const override = process.env.FACTORY_DROID_BINARY?.trim();
  if (override && override.length > 0) {
    if (override.includes('/') || override.includes('\\')) {
      // Absolute or relative path — validate it exists before using
      try {
        fs.accessSync(override, fs.constants.X_OK);
        return override;
      } catch {
        // Fall through to default
      }
    } else {
      // Bare command name — return as-is and let spawn() resolve via PATH
      return override;
    }
  }
  return 'droid';
}

async function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, DEFAULT_HOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to determine dynamic port'));
        return;
      }
      const port = address.port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

async function isDaemonReachable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: DEFAULT_HOST, port });
    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };
    const fail = () => {
      cleanup();
      resolve(false);
    };
    socket.setTimeout(SOCKET_TIMEOUT_MS, fail);
    socket.once('error', fail);
    socket.once('connect', () => {
      cleanup();
      resolve(true);
    });
  });
}

async function waitForDaemonReady(
  child: ChildProcess,
  port: number,
  timeoutMs: number = STARTUP_TIMEOUT_MS
): Promise<DaemonStartupResult> {
  return new Promise((resolve) => {
    let settled = false;
    let exited = false;
    const deadline = Date.now() + timeoutMs;

    const settle = (result: DaemonStartupResult) => {
      if (settled) return;
      settled = true;
      child.removeListener('exit', onExit);
      child.removeListener('error', onExit);
      resolve(result);
    };

    const onExit = () => {
      exited = true;
      settle('exited');
    };

    child.once('exit', onExit);
    child.once('error', onExit);

    const poll = async () => {
      while (!exited && !settled) {
        if (await isDaemonReachable(port)) {
          settle('ready');
          return;
        }
        if (Date.now() >= deadline) {
          settle('timeout');
          return;
        }
        await new Promise<void>((r) => setTimeout(r, STARTUP_POLL_INTERVAL_MS));
      }
    };

    void poll();
  });
}

function readPortFile(): number | null {
  try {
    const portPath = path.join(getSdkDir(), DAEMON_PORT_FILE);
    const content = fs.readFileSync(portPath, 'utf-8').trim();
    const port = parseInt(content, 10);
    if (Number.isFinite(port) && port > 0 && port < 65536) {
      return port;
    }
    return null;
  } catch {
    return null;
  }
}

function writePortFile(port: number): void {
  try {
    const sdkDir = getSdkDir();
    fs.mkdirSync(sdkDir, { recursive: true });
    fs.writeFileSync(path.join(sdkDir, DAEMON_PORT_FILE), String(port), {
      mode: 0o600,
    });
  } catch {
    // Non-fatal
  }
}

function cacheTarget(port: number): { port: number } {
  daemonTarget = { host: DEFAULT_HOST, port };
  return { port };
}

function clearSpawnedDaemonProcess(child: ChildProcess): void {
  if (spawnedDaemonProcess === child) {
    spawnedDaemonProcess = null;
  }
}

async function spawnDaemon(
  execPath: string,
  port: number
): Promise<DaemonStartupResult> {
  const args = ['daemon', '--host', DEFAULT_HOST, '--port', String(port)];

  let stderrFd: number | undefined;
  try {
    const logsDir = path.join(getSdkDir(), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    stderrFd = fs.openSync(path.join(logsDir, 'daemon-stderr.log'), 'a');
  } catch {
    // Non-fatal
  }

  const child = spawn(execPath, args, {
    detached: true,
    stdio: ['ignore', 'ignore', stderrFd ?? 'ignore'],
    cwd: os.homedir(),
    env: { ...process.env },
  });

  if (stderrFd !== undefined) {
    try {
      fs.closeSync(stderrFd);
    } catch {
      // Ignore
    }
  }

  spawnedDaemonProcess = child;

  // Allow the Node process to exit without waiting for the daemon.
  // The daemon is a long-lived server that should outlive the SDK.
  child.unref();

  child.once('exit', () => {
    clearSpawnedDaemonProcess(child);
  });

  child.on('error', () => {
    clearSpawnedDaemonProcess(child);
  });

  const result = await waitForDaemonReady(child, port);

  if (result !== 'ready') {
    clearSpawnedDaemonProcess(child);
    if (result === 'timeout') {
      try {
        child.kill('SIGTERM');
      } catch {
        // Best effort
      }
    }
  }

  return result;
}

/**
 * Core implementation — called at most once per inflight window.
 *
 * Discovery order:
 * 1. Well-known port (37643)
 * 2. Port file (~/.factory/sdk/daemon.port)
 * 3. Spawn new daemon (prefer well-known port, fallback to random)
 */
async function _ensureLocalDaemon(): Promise<{ port: number }> {
  const execPath = resolveExecPath();

  // 1. Probe well-known port
  const wellKnownPort = getDefaultDaemonPort();
  if (await isDaemonReachable(wellKnownPort)) {
    return cacheTarget(wellKnownPort);
  }

  // 2. Probe port file
  const portFilePort = readPortFile();
  if (portFilePort !== null && portFilePort !== wellKnownPort) {
    if (await isDaemonReachable(portFilePort)) {
      return cacheTarget(portFilePort);
    }
  }

  // 3. Spawn — first attempt on the well-known port
  const firstResult = await spawnDaemon(execPath, wellKnownPort);
  if (firstResult === 'ready') {
    writePortFile(wellKnownPort);
    return cacheTarget(wellKnownPort);
  }

  // Retry on random ports
  for (let attempt = 2; attempt <= MAX_STARTUP_ATTEMPTS; attempt++) {
    const port = await allocatePort();
    const result = await spawnDaemon(execPath, port);
    if (result === 'ready') {
      writePortFile(port);
      return cacheTarget(port);
    }
  }

  throw new ConnectionError(
    `Failed to start local droid daemon after ${MAX_STARTUP_ATTEMPTS} attempts. ` +
      'Ensure the `droid` CLI is installed and `droid auth login` has been run.'
  );
}

/**
 * Ensure a local `droid daemon` process is running and reachable.
 *
 * Discovery order:
 * 1. Cached target from a previous call in this process
 * 2. Well-known port (37643)
 * 3. Port file (`~/.factory/sdk/daemon.port`)
 * 4. Spawn new daemon (prefer well-known port, fallback to random)
 *
 * Concurrent calls are deduplicated — all callers join the same
 * spawn attempt.
 */
export async function ensureLocalDaemon(): Promise<{ port: number }> {
  // Fast path: cached target still reachable
  if (daemonTarget) {
    if (await isDaemonReachable(daemonTarget.port)) {
      return { port: daemonTarget.port };
    }
    daemonTarget = null;
  }

  // Deduplicate concurrent calls
  if (!daemonEnsureInflight) {
    daemonEnsureInflight = _ensureLocalDaemon().finally(() => {
      daemonEnsureInflight = null;
    });
  }

  return daemonEnsureInflight;
}

/** Resets module-level state between tests. Not intended for production use. */
export function _resetDaemonStateForTesting(): void {
  daemonEnsureInflight = null;
  daemonTarget = null;
  spawnedDaemonProcess = null;
}
