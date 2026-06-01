import { describe, expect, it } from 'vitest';

import { protocol } from '../src/index.js';
import * as publicApi from '../src/index.js';

const PRE_WIRING_PUBLIC_EXPORTS = [
  'SDK_TAG',
  'SDK_VERSION',
  'ProcessTransport',
  'dispatchNotification',
  'ProtocolEngine',
  'DroidClient',
  'convertNotificationToStreamMessage',
  'DroidMessageType',
  'StreamStateTracker',
  'run',
  'createSdkMcpServer',
  'tool',
  'SdkMcpServer',
  'createSession',
  'resumeSession',
  'DroidSession',
  'listSessions',
  'listMachineTemplates',
  'getMachineTemplate',
  'listComputers',
  'getComputer',
  'createComputer',
  'getComputerByName',
  'updateComputer',
  'deleteComputer',
  'restartComputer',
  'refreshComputer',
  'getComputerMetrics',
  'retryInstallDeps',
  'listRemoteSessions',
  'ComputerSchema',
  'ComputerListResponseSchema',
  'ComputerMetricSchema',
  'ComputerMetricsResponseSchema',
  'MachineTemplateBuildStatusSchema',
  'MachineTemplateSchema',
  'MachineTemplateListResponseSchema',
  'RefreshComputerResponseSchema',
  'RemoteSessionSchema',
  'RemoteSessionListResponseSchema',
  'DaemonClient',
  'connectDaemon',
  'DaemonConnection',
  'resolveWebSocketUrl',
  'ensureLocalDaemon',
  'DaemonSession',
  'WebSocketTransport',
  'MachineType',
];

describe('public API: `protocol` namespace', () => {
  it('is exported as an object from the package entry point', () => {
    expect(protocol).toBeTypeOf('object');
    expect(protocol).not.toBeNull();
  });

  it('exposes the nested `daemon` namespace with DaemonRequestSchema', () => {
    expect(protocol.daemon).toBeTypeOf('object');
    expect(protocol.daemon.DaemonRequestSchema).toBeDefined();
    expect(protocol.daemon.DaemonInitializeSessionRequestSchema).toBeDefined();
  });

  it('does not flatten daemon-namespaced schemas onto `protocol`', () => {
    expect(
      (protocol as Record<string, unknown>)['DaemonRequestSchema']
    ).toBeUndefined();
    expect(
      (protocol as Record<string, unknown>)[
        'DaemonInitializeSessionRequestSchema'
      ]
    ).toBeUndefined();
  });

  it('exposes representative flat schemas on the namespace', () => {
    expect(protocol.FactoryDroidMessageSchema).toBeDefined();
    expect(protocol.SessionTagSchema).toBeDefined();
    expect(protocol.HostIdSchema).toBeDefined();
    expect(protocol.ModelID).toBeDefined();
    expect(protocol.UserModelPolicySchema).toBeDefined();
  });

  it('exposes the `usage` sub-namespace with TokenUsageSchema', () => {
    expect(protocol.usage).toBeTypeOf('object');
    expect(protocol.usage.TokenUsageSchema).toBeDefined();
  });

  it('round-trips a parse through a namespace-exposed schema', () => {
    const parsed = protocol.usage.TokenUsageSchema.parse({
      inputTokens: 10,
      outputTokens: 20,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      thinkingTokens: 0,
    });
    expect(parsed.inputTokens).toBe(10);
    expect(parsed.outputTokens).toBe(20);
  });

  it('round-trips a parse through a flat namespace-exposed schema', () => {
    const tag = protocol.SessionTagSchema.parse({ name: 'feature/test' });
    expect(tag.name).toBe('feature/test');
  });
});

describe('public API: backward compatibility guard', () => {
  it('preserves all pre-wiring public exports', () => {
    const exported = publicApi as unknown as Record<string, unknown>;
    for (const name of PRE_WIRING_PUBLIC_EXPORTS) {
      expect(
        exported[name],
        `expected ${name} to remain exported`
      ).toBeDefined();
    }
  });

  it('still exports the new `protocol` namespace', () => {
    const exported = publicApi as unknown as Record<string, unknown>;
    expect(exported['protocol']).toBeTypeOf('object');
  });
});
