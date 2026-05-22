import { describe, expect, it } from 'vitest';

import { resolveWebSocketUrl, MachineType } from '../../src/daemon/index.js';
import type { ConnectDaemonOptions } from '../../src/daemon/index.js';
import { ConnectionError } from '../../src/errors.js';

describe('resolveWebSocketUrl', () => {
  it('uses url option directly when provided', () => {
    const url = resolveWebSocketUrl({ url: 'wss://custom.host:1234' });
    expect(url).toBe('wss://custom.host:1234');
  });

  it('resolves ephemeral machine to sandbox WebSocket URL', () => {
    const url = resolveWebSocketUrl({
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
      machine: {
        type: MachineType.Computer,
        computerId: 'my-desktop',
      },
    });
    expect(url).toBe('wss://relay.factory.ai/v0/computer/my-desktop/client');
  });

  it('uses custom relayBaseUrl for computer machines', () => {
    const url = resolveWebSocketUrl({
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
      url: 'wss://override.host',
      machine: {
        type: MachineType.Ephemeral,
        sandboxId: 'abc123',
        workspaceId: 'ws-1',
      },
    });
    expect(url).toBe('wss://override.host');
  });

  it('throws when neither url nor machine is provided', () => {
    expect(() => resolveWebSocketUrl({})).toThrow(ConnectionError);
    expect(() => resolveWebSocketUrl({})).toThrow(
      /Either machine or url must be provided/
    );
  });

  it('throws for empty options', () => {
    const options: ConnectDaemonOptions = {};
    expect(() => resolveWebSocketUrl(options)).toThrow(ConnectionError);
  });
});
