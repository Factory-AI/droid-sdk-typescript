import { describe, expect, it } from 'vitest';

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
});
