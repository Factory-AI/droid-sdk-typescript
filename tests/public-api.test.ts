import { describe, expect, it } from 'vitest';

import {
  ConnectionError,
  DroidClient,
  DroidMessageType,
  DroidSession,
  ProcessExitError,
  ProcessTransport,
  ProtocolEngine,
  createSession,
  listSessions,
  query,
  resumeSession,
  run,
} from '../src/index.js';

describe('public API barrel', () => {
  it('exports the primary high-level SDK entry points', () => {
    expect(query).toBeTypeOf('function');
    expect(run).toBeTypeOf('function');
    expect(createSession).toBeTypeOf('function');
    expect(resumeSession).toBeTypeOf('function');
    expect(listSessions).toBeTypeOf('function');
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
    expect(DroidMessageType.AssistantTextDelta).toBe('assistant_text_delta');
    expect(DroidMessageType.ToolUse).toBe('tool_use');
    expect(DroidMessageType.TokenUsageUpdate).toBe('token_usage_update');
    expect(DroidMessageType.TurnComplete).toBe('turn_complete');
  });
});
