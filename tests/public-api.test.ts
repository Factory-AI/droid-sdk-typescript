import { describe, expect, it } from 'vitest';

import {
  ConnectionError,
  DroidClient,
  DroidMessageType,
  DroidSession,
  DroidTurn,
  ProcessExitError,
  ProcessTransport,
  ProtocolEngine,
  createSession,
  listSessions,
  resumeSession,
  run,
} from '../src/index.js';
import * as publicApi from '../src/index.js';

describe('public API barrel', () => {
  it('exports the primary high-level SDK entry points', () => {
    expect(run).toBeTypeOf('function');
    expect(createSession).toBeTypeOf('function');
    expect(resumeSession).toBeTypeOf('function');
    expect(listSessions).toBeTypeOf('function');
    expect('query' in publicApi).toBe(false);
    expect('stream' in DroidSession.prototype).toBe(false);
  });

  it('exports the primary classes and error types', () => {
    expect(DroidSession).toBeTypeOf('function');
    expect(DroidTurn).toBeTypeOf('function');
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
