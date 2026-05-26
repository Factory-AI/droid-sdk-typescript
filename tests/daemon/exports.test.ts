import { describe, expect, it } from 'vitest';

import * as sdk from '../../src/index.js';

describe('daemon public API exports', () => {
  it('exports DaemonClient class', () => {
    expect(typeof sdk.DaemonClient).toBe('function');
  });

  it('exports connectDaemon function', () => {
    expect(typeof sdk.connectDaemon).toBe('function');
  });

  it('exports DaemonConnection class', () => {
    expect(typeof sdk.DaemonConnection).toBe('function');
  });

  it('exports DaemonSession class', () => {
    expect(typeof sdk.DaemonSession).toBe('function');
  });

  it('exports WebSocketTransport class', () => {
    expect(typeof sdk.WebSocketTransport).toBe('function');
  });

  it('exports resolveWebSocketUrl function', () => {
    expect(typeof sdk.resolveWebSocketUrl).toBe('function');
  });

  it('exports MachineType enum', () => {
    expect(sdk.MachineType).toBeDefined();
    expect(sdk.MachineType.Ephemeral).toBe('ephemeral');
    expect(sdk.MachineType.Computer).toBe('computer');
    expect(sdk.MachineType.Local).toBe('local');
  });

  it('exports ensureLocalDaemon function', () => {
    expect(typeof sdk.ensureLocalDaemon).toBe('function');
  });

  it('exports resolveLocalAuthToken function', () => {
    expect(typeof sdk.resolveLocalAuthToken).toBe('function');
  });
});
