import { type ChildProcess, spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import { ConnectionError } from '../errors.js';
import { isRecord } from '../utils.js';

const SOCKET_TIMEOUT_MS = 2_000;
const STARTUP_POLL_INTERVAL_MS = 250;
const STARTUP_TIMEOUT_MS = 30_000;
const MAX_STARTUP_ATTEMPTS = 3;

const FACTORY_DIR_PRODUCTION = '.factory';
const FACTORY_DIR_DEVELOPMENT = '.factory-dev';

const AUTH_V2_FILE = 'auth.v2.file';
const AUTH_V2_KEY = 'auth.v2.key';
const ENCRYPTION_KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

type DaemonStartupResult = 'ready' | 'timeout' | 'exited';

let spawnedDaemonProcess: ChildProcess | null = null;

function getFactoryHome(): string {
  return process.env.FACTORY_HOME_OVERRIDE || os.homedir();
}

function getFactoryDirName(): string {
  const env = process.env.FACTORY_ENV?.toLowerCase();
  if (env === 'production') return FACTORY_DIR_PRODUCTION;
  return FACTORY_DIR_DEVELOPMENT;
}

function getFactoryDir(): string {
  return path.join(getFactoryHome(), getFactoryDirName());
}

function resolveExecPath(): string {
  const override = process.env.FACTORY_DROID_BINARY;
  if (override && override.trim().length > 0) {
    try {
      fs.accessSync(override, fs.constants.X_OK);
      return override;
    } catch {
      // Fall through to default
    }
  }
  return 'droid';
}

async function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
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
    const socket = net.createConnection({ host: '127.0.0.1', port });
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

/**
 * Spawn a local `droid daemon` process on an available port and wait for it
 * to become reachable.
 *
 * Returns `{ port }` on success. The daemon runs detached so it outlives the
 * SDK process.
 */
export async function ensureLocalDaemon(): Promise<{ port: number }> {
  const execPath = resolveExecPath();

  for (let attempt = 1; attempt <= MAX_STARTUP_ATTEMPTS; attempt++) {
    const port = await allocatePort();

    if (await isDaemonReachable(port)) {
      return { port };
    }

    const args = ['daemon', '--host', '127.0.0.1', '--port', String(port)];

    let stderrFd: number | undefined;
    try {
      const logsDir = path.join(getFactoryDir(), 'logs');
      fs.mkdirSync(logsDir, { recursive: true });
      stderrFd = fs.openSync(path.join(logsDir, 'daemon-stderr.log'), 'a');
    } catch {
      // Non-fatal
    }

    const child = spawn(execPath, args, {
      detached: false,
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

    child.once('exit', () => {
      if (spawnedDaemonProcess === child) {
        spawnedDaemonProcess = null;
      }
    });

    child.on('error', () => {
      if (spawnedDaemonProcess === child) {
        spawnedDaemonProcess = null;
      }
    });

    const result = await waitForDaemonReady(child, port);

    if (result === 'ready') {
      return { port };
    }

    // Clean up failed attempt
    if (spawnedDaemonProcess === child) {
      spawnedDaemonProcess = null;
    }
    if (result === 'timeout') {
      try {
        child.kill('SIGTERM');
      } catch {
        // Best effort
      }
    }
  }

  throw new ConnectionError(
    `Failed to start local droid daemon after ${MAX_STARTUP_ATTEMPTS} attempts. ` +
      'Ensure the `droid` CLI is installed and `droid auth login` has been run.'
  );
}

const WORKOS_API_BASE_URL = 'https://api.workos.com/user_management';
const DEV_WORKOS_CLIENT_ID = 'client_01HNM7927XNSKCJ4982Z5J3FFZ';
const PROD_WORKOS_CLIENT_ID = 'client_01J6GCE5BFHJ4GKPQNBAQ92T9P';

function encryptAes256Gcm(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString()
    );
    if (!isRecord(payload) || typeof payload.exp !== 'number') return true;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

function getWorkOSClientId(): string {
  const env = process.env.FACTORY_ENV?.toLowerCase();
  return env === 'production' ? PROD_WORKOS_CLIENT_ID : DEV_WORKOS_CLIENT_ID;
}

async function refreshToken(refreshTokenValue: string): Promise<{
  access_token: string;
  refresh_token: string;
} | null> {
  try {
    const response = await fetch(`${WORKOS_API_BASE_URL}/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshTokenValue,
        client_id: getWorkOSClientId(),
      }),
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (
      isRecord(data) &&
      typeof data.access_token === 'string' &&
      typeof data.refresh_token === 'string'
    ) {
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function decryptAes256Gcm(encryptedData: string, key: Buffer): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0]!, 'base64');
  const authTag = Buffer.from(parts[1]!, 'base64');
  const ciphertext = Buffer.from(parts[2]!, 'base64');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid IV or auth tag length');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function readCredentials(): {
  accessToken: string;
  refreshToken: string | null;
  encryptionKey: Buffer;
} | null {
  const factoryDir = getFactoryDir();

  const credentialsPath = path.join(factoryDir, AUTH_V2_FILE);
  let encryptedContent: string;
  try {
    encryptedContent = fs.readFileSync(credentialsPath, 'utf-8');
  } catch {
    return null;
  }

  const keyPath = path.join(factoryDir, AUTH_V2_KEY);
  let keyContent: string;
  try {
    keyContent = fs.readFileSync(keyPath, 'utf-8').trim();
  } catch {
    return null;
  }

  const key = Buffer.from(keyContent, 'base64');
  if (key.length !== ENCRYPTION_KEY_LENGTH) {
    return null;
  }

  try {
    const json = decryptAes256Gcm(encryptedContent, key);
    const credentials: unknown = JSON.parse(json);
    if (isRecord(credentials) && typeof credentials.access_token === 'string') {
      const rt =
        typeof credentials.refresh_token === 'string'
          ? credentials.refresh_token
          : null;
      return {
        accessToken: credentials.access_token,
        refreshToken: rt,
        encryptionKey: key,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function saveCredentials(
  accessToken: string,
  refreshTokenValue: string,
  encryptionKey: Buffer
): void {
  const factoryDir = getFactoryDir();
  const credentialsPath = path.join(factoryDir, AUTH_V2_FILE);
  const json = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshTokenValue,
  });
  try {
    fs.writeFileSync(credentialsPath, encryptAes256Gcm(json, encryptionKey), {
      mode: 0o600,
    });
  } catch {
    // Non-fatal — we still have a valid token in memory
  }
}

/**
 * Read the stored Factory auth token from the local credential store.
 *
 * Reads `~/.factory/auth.v2.file` (encrypted with the key in
 * `~/.factory/auth.v2.key`), decrypts, and returns the `access_token`.
 * If the token is expired, attempts to refresh it using the stored
 * `refresh_token` and saves the new credentials back to disk.
 *
 * This mirrors the `CredentialsStorage.loadFromKeyfileV2()` + token
 * refresh path in `@factory/runtime/auth` without importing the full
 * auth stack.
 */
export async function resolveLocalAuthToken(): Promise<string | null> {
  const creds = readCredentials();
  if (!creds) return null;

  if (!isTokenExpired(creds.accessToken)) {
    return creds.accessToken;
  }

  // Token expired — try to refresh
  if (!creds.refreshToken) return null;
  const refreshed = await refreshToken(creds.refreshToken);
  if (!refreshed) return null;

  saveCredentials(
    refreshed.access_token,
    refreshed.refresh_token,
    creds.encryptionKey
  );
  return refreshed.access_token;
}
