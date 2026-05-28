import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensureLocalDaemon,
  _resetDaemonStateForTesting,
} from '../../src/daemon/local.js';

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
