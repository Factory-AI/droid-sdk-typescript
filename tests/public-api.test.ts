import { describe, expect, it } from 'vitest';

import {
  ConnectionError,
  DroidClient,
  DroidMessageType,
  DroidSession,
  ProcessExitError,
  ProcessTransport,
  ProtocolEngine,
  createComputer,
  createSession,
  deleteComputer,
  getComputerByName,
  getComputerMetrics,
  listSessions,
  listMachineTemplates,
  getMachineTemplate,
  refreshComputer,
  restartComputer,
  resumeSession,
  retryInstallDeps,
  run,
  updateComputer,
} from '../src/index.js';
import * as publicApi from '../src/index.js';

describe('public API barrel', () => {
  it('exports the primary high-level SDK entry points', () => {
    expect(run).toBeTypeOf('function');
    expect(createSession).toBeTypeOf('function');
    expect(resumeSession).toBeTypeOf('function');
    expect(listSessions).toBeTypeOf('function');
    expect(listMachineTemplates).toBeTypeOf('function');
    expect(getMachineTemplate).toBeTypeOf('function');
    expect(createComputer).toBeTypeOf('function');
    expect(getComputerByName).toBeTypeOf('function');
    expect(updateComputer).toBeTypeOf('function');
    expect(deleteComputer).toBeTypeOf('function');
    expect(restartComputer).toBeTypeOf('function');
    expect(refreshComputer).toBeTypeOf('function');
    expect(getComputerMetrics).toBeTypeOf('function');
    expect(retryInstallDeps).toBeTypeOf('function');

    expect('query' in publicApi).toBe(false);
    expect(DroidSession.prototype.stream).toBeTypeOf('function');
    expect('DroidTurn' in publicApi).toBe(false);
  });

  it('exports the primary classes and error types', () => {
    expect(DroidSession).toBeTypeOf('function');
    expect(DroidClient).toBeTypeOf('function');
    expect(ProcessTransport).toBeTypeOf('function');
    expect(ProtocolEngine).toBeTypeOf('function');
    expect(ConnectionError).toBeTypeOf('function');
    expect(ProcessExitError).toBeTypeOf('function');
  });

  it('exports stable message type constants', () => {
    expect(DroidMessageType.Assistant).toBe('assistant');
    expect(DroidMessageType.ToolCall).toBe('tool_call');
    expect(DroidMessageType.AssistantTextDelta).toBe('assistant_text_delta');
    expect(DroidMessageType.ToolCallDelta).toBe('tool_call_delta');
    expect(DroidMessageType.TokenUsageUpdate).toBe('token_usage_update');
    expect(DroidMessageType.Result).toBe('result');
  });
});
