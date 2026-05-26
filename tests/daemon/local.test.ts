import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensureLocalDaemon,
  resolveLocalAuthToken,
  _resetDaemonStateForTesting,
} from '../../src/daemon/local.js';

const IV_LENGTH = 16;
const ENCRYPTION_KEY_LENGTH = 32;

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

function makeFakeJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
    'base64url'
  );
  const payload = Buffer.from(
    JSON.stringify({ sub: 'user_test', exp })
  ).toString('base64url');
  return `${header}.${payload}.fake-signature`;
}

describe('resolveLocalAuthToken', () => {
  let tmpDir: string;
  let factoryDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'droid-sdk-local-'));
    factoryDir = path.join(tmpDir, '.factory-dev');
    fs.mkdirSync(factoryDir, { recursive: true });
    vi.stubEnv('FACTORY_HOME_OVERRIDE', tmpDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no credential files exist', async () => {
    expect(await resolveLocalAuthToken()).toBeNull();
  });

  it('returns null when credentials file exists but key file is missing', async () => {
    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.file'),
      'some-encrypted-data'
    );
    expect(await resolveLocalAuthToken()).toBeNull();
  });

  it('returns null when key file has wrong length', async () => {
    const shortKey = crypto.randomBytes(16);
    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.key'),
      shortKey.toString('base64')
    );
    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.file'),
      'some-encrypted-data'
    );
    expect(await resolveLocalAuthToken()).toBeNull();
  });

  it('returns non-expired access_token from valid credentials', async () => {
    const key = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = makeFakeJwt(futureExp);
    const credentials = JSON.stringify({
      access_token: token,
      refresh_token: 'refresh-token-xyz',
    });
    const encrypted = encryptAes256Gcm(credentials, key);

    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.key'),
      key.toString('base64')
    );
    fs.writeFileSync(path.join(factoryDir, 'auth.v2.file'), encrypted);

    expect(await resolveLocalAuthToken()).toBe(token);
  });

  it('returns null when decryption fails with wrong key', async () => {
    const realKey = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    const wrongKey = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const credentials = JSON.stringify({
      access_token: makeFakeJwt(futureExp),
    });
    const encrypted = encryptAes256Gcm(credentials, realKey);

    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.key'),
      wrongKey.toString('base64')
    );
    fs.writeFileSync(path.join(factoryDir, 'auth.v2.file'), encrypted);

    expect(await resolveLocalAuthToken()).toBeNull();
  });

  it('returns null when credentials JSON has no access_token', async () => {
    const key = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    const credentials = JSON.stringify({ refresh_token: 'refresh' });
    const encrypted = encryptAes256Gcm(credentials, key);

    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.key'),
      key.toString('base64')
    );
    fs.writeFileSync(path.join(factoryDir, 'auth.v2.file'), encrypted);

    expect(await resolveLocalAuthToken()).toBeNull();
  });

  it('returns null when encrypted data has invalid format', async () => {
    const key = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.key'),
      key.toString('base64')
    );
    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.file'),
      'not:valid:base64:format'
    );
    expect(await resolveLocalAuthToken()).toBeNull();
  });

  it('uses production directory when FACTORY_ENV is production', async () => {
    vi.stubEnv('FACTORY_ENV', 'production');
    const prodDir = path.join(tmpDir, '.factory');
    fs.mkdirSync(prodDir, { recursive: true });

    const key = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = makeFakeJwt(futureExp);
    const credentials = JSON.stringify({ access_token: token });
    const encrypted = encryptAes256Gcm(credentials, key);

    fs.writeFileSync(path.join(prodDir, 'auth.v2.key'), key.toString('base64'));
    fs.writeFileSync(path.join(prodDir, 'auth.v2.file'), encrypted);

    expect(await resolveLocalAuthToken()).toBe(token);
  });

  it('returns null for expired token with no refresh_token', async () => {
    const key = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    const credentials = JSON.stringify({
      access_token: makeFakeJwt(pastExp),
    });
    const encrypted = encryptAes256Gcm(credentials, key);

    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.key'),
      key.toString('base64')
    );
    fs.writeFileSync(path.join(factoryDir, 'auth.v2.file'), encrypted);

    expect(await resolveLocalAuthToken()).toBeNull();
  });
});

async function startTcpServer(host: string, port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeAllListeners('error');
      resolve(server);
    });
  });
}

async function closeTcpServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function isPortReachable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
  });
}

describe('ensureLocalDaemon', () => {
  let tmpDir: string;
  let factoryDir: string;

  beforeEach(() => {
    _resetDaemonStateForTesting();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'droid-sdk-daemon-'));
    factoryDir = path.join(tmpDir, '.factory-dev');
    fs.mkdirSync(factoryDir, { recursive: true });
    vi.stubEnv('FACTORY_HOME_OVERRIDE', tmpDir);
    // Point to a nonexistent binary so spawn attempts fail fast
    vi.stubEnv('FACTORY_DROID_BINARY', '/nonexistent/droid');
  });

  afterEach(() => {
    _resetDaemonStateForTesting();
    vi.unstubAllEnvs();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers daemon on the well-known dev port if reachable', async () => {
    const devPort = 41723;
    const alreadyRunning = await isPortReachable(devPort);

    let server: net.Server | undefined;
    if (!alreadyRunning) {
      server = await startTcpServer('127.0.0.1', devPort);
    }

    try {
      const result = await ensureLocalDaemon();
      expect(result.port).toBe(devPort);
    } finally {
      if (server) await closeTcpServer(server);
    }
  });

  it('discovers daemon on the well-known prod port if reachable', async () => {
    vi.stubEnv('FACTORY_ENV', 'production');
    const prodPort = 37643;
    const alreadyRunning = await isPortReachable(prodPort);

    let server: net.Server | undefined;
    if (!alreadyRunning) {
      server = await startTcpServer('127.0.0.1', prodPort);
    }

    try {
      const result = await ensureLocalDaemon();
      expect(result.port).toBe(prodPort);
    } finally {
      if (server) await closeTcpServer(server);
    }
  });

  it('discovers daemon via port file when well-known port is unavailable', async () => {
    // Use a high, unusual port range to avoid collisions with running daemons.
    // We set FACTORY_ENV to production so the well-known port is 37643,
    // then check if 37643 is free. If a real daemon is on 37643, the
    // well-known port discovery will take precedence (correct behavior),
    // so we skip the port-file-specific assertion in that case.
    vi.stubEnv('FACTORY_ENV', 'production');
    const wellKnownPort = 37643;
    const wellKnownRunning = await isPortReachable(wellKnownPort);

    const fakeServer = await startTcpServer('127.0.0.1', 0);
    const fakePort = (fakeServer.address() as net.AddressInfo).port;
    const prodDir = path.join(tmpDir, '.factory');
    fs.mkdirSync(prodDir, { recursive: true });
    fs.writeFileSync(path.join(prodDir, 'daemon.port'), String(fakePort));

    try {
      const result = await ensureLocalDaemon();
      if (wellKnownRunning) {
        expect(result.port).toBe(wellKnownPort);
      } else {
        expect(result.port).toBe(fakePort);
      }
    } finally {
      await closeTcpServer(fakeServer);
    }
  });

  it('returns cached target on repeat calls', async () => {
    // Start a fake server on a random port and put it in the port file
    const fakeServer = await startTcpServer('127.0.0.1', 0);
    const fakePort = (fakeServer.address() as net.AddressInfo).port;
    fs.writeFileSync(path.join(factoryDir, 'daemon.port'), String(fakePort));

    try {
      const r1 = await ensureLocalDaemon();
      const r2 = await ensureLocalDaemon();
      // Both calls should return the same port (either well-known or port file)
      expect(r1.port).toBe(r2.port);
    } finally {
      await closeTcpServer(fakeServer);
    }
  });

  it('deduplicates concurrent calls', async () => {
    const fakeServer = await startTcpServer('127.0.0.1', 0);
    const fakePort = (fakeServer.address() as net.AddressInfo).port;
    fs.writeFileSync(path.join(factoryDir, 'daemon.port'), String(fakePort));

    try {
      const [r1, r2, r3] = await Promise.all([
        ensureLocalDaemon(),
        ensureLocalDaemon(),
        ensureLocalDaemon(),
      ]);
      // All concurrent calls must return the same port
      expect(r1.port).toBe(r2.port);
      expect(r2.port).toBe(r3.port);
    } finally {
      await closeTcpServer(fakeServer);
    }
  });

  it('_resetDaemonStateForTesting clears cached state', async () => {
    // First call — discover via port file
    const server1 = await startTcpServer('127.0.0.1', 0);
    const port1 = (server1.address() as net.AddressInfo).port;
    fs.writeFileSync(path.join(factoryDir, 'daemon.port'), String(port1));

    const r1 = await ensureLocalDaemon();
    // r1 will be either well-known port or port1 — just record it
    const firstPort = r1.port;

    await closeTcpServer(server1);
    _resetDaemonStateForTesting();

    // Second call — different port file, should not return cached firstPort
    // (unless the well-known port is running, in which case both will be well-known)
    const server2 = await startTcpServer('127.0.0.1', 0);
    const port2 = (server2.address() as net.AddressInfo).port;
    fs.writeFileSync(path.join(factoryDir, 'daemon.port'), String(port2));

    try {
      const r2 = await ensureLocalDaemon();
      // After reset, the cache is cleared. The result should be a fresh discovery.
      // If well-known port is running, both will be well-known (fine).
      // If not, r2 should be port2 (not port1 from the old cache).
      const wellKnownRunning = await isPortReachable(41723);
      if (!wellKnownRunning) {
        expect(r2.port).toBe(port2);
        expect(r2.port).not.toBe(firstPort);
      } else {
        // Both resolve to well-known — that's correct behavior
        expect(r2.port).toBe(41723);
      }
    } finally {
      await closeTcpServer(server2);
    }
  });

  it('ignores stale port file when port is unreachable', async () => {
    fs.writeFileSync(path.join(factoryDir, 'daemon.port'), '59999');

    const wellKnownRunning = await isPortReachable(41723);

    if (wellKnownRunning) {
      // A daemon is running — ensureLocalDaemon discovers it (correct)
      const result = await ensureLocalDaemon();
      expect(result.port).toBe(41723);
    } else {
      // No daemon — spawn fails because binary is invalid
      await expect(ensureLocalDaemon()).rejects.toThrow(
        /Failed to start local droid daemon/
      );
    }
  });
});
