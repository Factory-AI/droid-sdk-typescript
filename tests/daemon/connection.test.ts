import { describe, expect, it, vi } from 'vitest';

import * as api from '../../src/api.js';
import { resolveWebSocketUrl, MachineType } from '../../src/daemon/index.js';

describe('resolveWebSocketUrl', () => {
  it('uses url option directly when provided', () => {
    const url = resolveWebSocketUrl({
      apiKey: 'k',
      url: 'wss://custom.host:1234',
    });
    expect(url).toBe('wss://custom.host:1234');
  });

  it('resolves ephemeral machine to sandbox WebSocket URL', () => {
    const url = resolveWebSocketUrl({
      apiKey: 'k',
      machine: {
        type: MachineType.Ephemeral,
        sandboxId: 'abc123',
        workspaceId: 'ws-1',
      },
    });
    expect(url).toBe('wss://37643-abc123.e2b.app');
  });

  it('uses custom daemonPort for ephemeral machines', () => {
    const url = resolveWebSocketUrl({
      apiKey: 'k',
      machine: {
        type: MachineType.Ephemeral,
        sandboxId: 'abc123',
        workspaceId: 'ws-1',
      },
      daemonPort: 41723,
    });
    expect(url).toBe('wss://41723-abc123.e2b.app');
  });

  it('resolves computer machine to relay URL', () => {
    const url = resolveWebSocketUrl({
      apiKey: 'k',
      machine: {
        type: MachineType.Computer,
        computerId: 'my-desktop',
      },
    });
    expect(url).toBe('wss://relay.factory.ai/v0/computer/my-desktop/client');
  });

  it('uses custom relayBaseUrl for computer machines', () => {
    const url = resolveWebSocketUrl({
      apiKey: 'k',
      machine: {
        type: MachineType.Computer,
        computerId: 'my-desktop',
      },
      relayBaseUrl: 'wss://custom-relay.example.com',
    });
    expect(url).toBe(
      'wss://custom-relay.example.com/v0/computer/my-desktop/client'
    );
  });

  it('prefers url over machine when both provided', () => {
    const url = resolveWebSocketUrl({
      apiKey: 'k',
      url: 'wss://override.host',
      machine: {
        type: MachineType.Ephemeral,
        sandboxId: 'abc123',
        workspaceId: 'ws-1',
      },
    });
    expect(url).toBe('wss://override.host');
  });

  it('defaults to local daemon URL when no machine or url is provided', () => {
    const url = resolveWebSocketUrl({ apiKey: 'k' });
    expect(url).toBe('ws://127.0.0.1:37643');
  });

  it('resolves MachineType.Local to localhost', () => {
    const url = resolveWebSocketUrl({
      apiKey: 'k',
      machine: { type: MachineType.Local },
    });
    expect(url).toBe('ws://127.0.0.1:37643');
  });

  it('uses _localPort for local daemon when provided', () => {
    const url = resolveWebSocketUrl({ apiKey: 'k', _localPort: 55555 });
    expect(url).toBe('ws://127.0.0.1:55555');
  });

  it('uses custom daemonPort for local machine', () => {
    const url = resolveWebSocketUrl({
      apiKey: 'k',
      machine: { type: MachineType.Local },
      daemonPort: 41723,
    });
    expect(url).toBe('ws://127.0.0.1:41723');
  });

  it('resolves ephemeral with sandboxId to sandbox URL', () => {
    const url = resolveWebSocketUrl({
      apiKey: 'k',
      machine: {
        type: MachineType.Ephemeral,
        workspaceId: 'ws-1',
        sandboxId: 'sb-xyz',
      },
    });
    expect(url).toBe('wss://37643-sb-xyz.e2b.app');
  });
});

describe('connectDaemon — auto-provisioning', () => {
  it('calls createSandbox when ephemeral machine has no sandboxId', async () => {
    const createSandboxSpy = vi
      .spyOn(api, 'createSandbox')
      .mockResolvedValue({ sandboxId: 'sb-auto-123' });

    // connectDaemon will provision, then fail on WebSocket connect.
    // We set connectionTimeoutMs low to avoid test timeout.
    try {
      const { connectDaemon } = await import(
        '../../src/daemon/connection.js'
      );
      await connectDaemon({
        apiKey: 'fk-test-key',
        machine: {
          type: MachineType.Ephemeral,
          workspaceId: 'ws-test-001',
        },
        maxRetries: 0,
      });
    } catch {
      // Expected — WebSocket connection will fail without a real server
    }

    expect(createSandboxSpy).toHaveBeenCalledOnce();
    expect(createSandboxSpy).toHaveBeenCalledWith({
      apiKey: 'fk-test-key',
      baseUrl: undefined,
      workspaceId: 'ws-test-001',
    });

    createSandboxSpy.mockRestore();
  }, 15_000);

  it('skips createSandbox when ephemeral machine has sandboxId', async () => {
    const createSandboxSpy = vi
      .spyOn(api, 'createSandbox')
      .mockResolvedValue({ sandboxId: 'sb-should-not-call' });

    try {
      const { connectDaemon } = await import(
        '../../src/daemon/connection.js'
      );
      await connectDaemon({
        apiKey: 'fk-test-key',
        machine: {
          type: MachineType.Ephemeral,
          workspaceId: 'ws-test-001',
          sandboxId: 'sb-existing',
        },
        maxRetries: 0,
      });
    } catch {
      // Expected — WebSocket connection will fail
    }

    expect(createSandboxSpy).not.toHaveBeenCalled();

    createSandboxSpy.mockRestore();
  }, 15_000);

  it('forwards baseUrl to createSandbox', async () => {
    const createSandboxSpy = vi
      .spyOn(api, 'createSandbox')
      .mockResolvedValue({ sandboxId: 'sb-auto-456' });

    try {
      const { connectDaemon } = await import(
        '../../src/daemon/connection.js'
      );
      await connectDaemon({
        apiKey: 'fk-test-key',
        machine: {
          type: MachineType.Ephemeral,
          workspaceId: 'ws-test-002',
        },
        baseUrl: 'https://api.eu.factory.ai',
        maxRetries: 0,
      });
    } catch {
      // Expected — WebSocket connection will fail
    }

    expect(createSandboxSpy).toHaveBeenCalledWith({
      apiKey: 'fk-test-key',
      baseUrl: 'https://api.eu.factory.ai',
      workspaceId: 'ws-test-002',
    });

    createSandboxSpy.mockRestore();
  }, 15_000);
});
