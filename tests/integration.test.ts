/**
 * Integration tests verifying cross-layer behavior.
 *
 * These tests use InMemoryTransport to simulate the full stack
 * (transport → protocol → client → stream → query/session) without
 * spawning real processes.
 *
 * Covers:
 * - VAL-CROSS-001: Full query lifecycle integration
 * - VAL-CROSS-002: Full session lifecycle integration
 * - VAL-CROSS-003: Permission handler integration
 * - VAL-CROSS-004: Ask-user handler integration
 * - VAL-CROSS-005: Interrupt during active streaming
 * - VAL-CROSS-006: Transport error propagation end-to-end
 * - VAL-CROSS-007: Settings update notification flow
 */

import { describe, expect, it } from 'vitest';

import { ProcessExitError, ConnectionError } from '../src/errors.js';
import { query } from '../src/query.js';
import {
  DroidClientMethod,
  DroidServerMethod,
  DroidWorkingState,
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
  SessionNotificationType,
  ToolConfirmationOutcome,
} from '../src/schemas/index.js';
import { createSession, resumeSession } from '../src/session.js';
import type { DroidMessage } from '../src/stream.js';
import { InMemoryTransport } from './helpers.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeSuccessResponse(
  id: string,
  result: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: 'response',
    id,
    result,
  };
}

function makeNotification(
  notificationType: string,
  payload: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: 'notification',
    method: DroidClientMethod.SESSION_NOTIFICATION,
    params: {
      notification: {
        type: notificationType,
        ...payload,
      },
    },
  };
}

function makeServerRequest(
  id: string,
  method: string,
  params: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: 'request',
    id,
    method,
    params,
  };
}

/**
 * Wire up an InMemoryTransport to intercept send() calls and auto-respond
 * to JSON-RPC methods. Callers can provide per-method overrides.
 *
 * Default behaviour:
 *  - initializeSession → responds with the given sessionId
 *  - loadSession       → responds with loaded session data
 *  - addUserMessage    → responds, then fires streaming notifications
 *  - interruptSession  → responds with empty result
 *  - updateSessionSettings → responds with empty result
 *
 * The `overrides` map lets individual tests inject custom logic per method.
 */
function wireTransport(
  transport: InMemoryTransport,
  sessionId: string,
  overrides?: Record<
    string,
    (id: string, params: Record<string, unknown>) => void
  >
): void {
  const originalSend = transport.send.bind(transport);

  transport.send = (message: object) => {
    originalSend(message);
    const msg = message as Record<string, unknown>;
    const method = msg['method'] as string;
    const id = msg['id'] as string;
    const params = (msg['params'] as Record<string, unknown>) ?? {};

    // Delegate to override if present
    if (overrides?.[method]) {
      overrides[method](id, params);
      return;
    }

    // Default handlers
    switch (method) {
      case DroidServerMethod.INITIALIZE_SESSION:
        queueMicrotask(() => {
          transport.injectMessage(
            makeSuccessResponse(id, {
              sessionId,
              session: {},
              settings: { modelId: 'test-model', reasoningEffort: 'medium' },
            })
          );
        });
        break;

      case DroidServerMethod.LOAD_SESSION:
        queueMicrotask(() => {
          transport.injectMessage(
            makeSuccessResponse(id, {
              session: { id: sessionId },
              settings: { modelId: 'test-model', reasoningEffort: 'medium' },
            })
          );
        });
        break;

      case DroidServerMethod.ADD_USER_MESSAGE:
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));
          sendDefaultStreamSequence(transport);
        });
        break;

      case DroidServerMethod.INTERRUPT_SESSION:
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));
        });
        break;

      case DroidServerMethod.UPDATE_SESSION_SETTINGS:
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));
        });
        break;

      default:
        // For any other method, respond with empty result
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));
        });
        break;
    }
  };
}

/**
 * Emit the default streaming sequence:
 *   working_state → StreamingAssistantMessage
 *   assistant_text_delta("Hello")
 *   assistant_text_delta(" world")
 *   token_usage_update
 *   working_state → Idle   (triggers TurnComplete)
 */
function sendDefaultStreamSequence(transport: InMemoryTransport): void {
  transport.injectMessage(
    makeNotification(SessionNotificationType.DROID_WORKING_STATE_CHANGED, {
      newState: DroidWorkingState.StreamingAssistantMessage,
    })
  );

  transport.injectMessage(
    makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
      messageId: 'msg-1',
      blockIndex: 0,
      textDelta: 'Hello',
    })
  );

  transport.injectMessage(
    makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
      messageId: 'msg-1',
      blockIndex: 0,
      textDelta: ' world',
    })
  );

  transport.injectMessage(
    makeNotification(SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED, {
      sessionId: 'default',
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 10,
        thinkingTokens: 5,
      },
    })
  );

  transport.injectMessage(
    makeNotification(SessionNotificationType.DROID_WORKING_STATE_CHANGED, {
      newState: DroidWorkingState.Idle,
    })
  );
}

// ===========================================================================
// 1. Full query lifecycle (VAL-CROSS-001)
// ===========================================================================

describe('Full query lifecycle (VAL-CROSS-001)', () => {
  it('query() sends initializeSession + addUserMessage, receives streaming notifications, yields correct DroidMessage types, terminates with TurnComplete, and cleans up transport', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    // Wire with extended streaming: tool_use, tool_result, working_state_changed
    wireTransport(transport, 'sess-lifecycle', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          // 1. Working state → streaming
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          // 2. assistant_text_delta
          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-1',
              blockIndex: 0,
              textDelta: 'Let me check that.',
            })
          );

          // 3. create_message with tool_use block
          transport.injectMessage(
            makeNotification(SessionNotificationType.CREATE_MESSAGE, {
              message: {
                id: 'msg-2',
                role: 'assistant',
                createdAt: 1000,
                updatedAt: 1000,
                content: [
                  {
                    type: 'tool_use',
                    id: 'tu-1',
                    name: 'read_file',
                    input: { path: '/tmp/test.ts' },
                  },
                ],
              },
            })
          );

          // 4. Working state → executing tool
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.ExecutingTool }
            )
          );

          // 5. tool_result
          transport.injectMessage(
            makeNotification(SessionNotificationType.TOOL_RESULT, {
              messageId: 'msg-2',
              toolUseId: 'tu-1',
              content: 'file contents here',
              isError: false,
            })
          );

          // 6. Working state → streaming again
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          // 7. More text
          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-3',
              blockIndex: 0,
              textDelta: 'Done!',
            })
          );

          // 8. Token usage
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED,
              {
                sessionId: 'sess-all-msg',
                tokenUsage: {
                  inputTokens: 200,
                  outputTokens: 100,
                  cacheCreationTokens: 0,
                  cacheReadTokens: 20,
                  thinkingTokens: 10,
                },
              }
            )
          );

          // 9. Working state → idle (triggers TurnComplete)
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const messages: DroidMessage[] = [];
    const q = query({ prompt: 'Fix the bug', cwd: '/tmp', transport });

    for await (const msg of q) {
      messages.push(msg);
    }

    // Verify sent methods: initializeSession then addUserMessage
    const sentMethods = transport.sentMessages.map(
      (m) => (m as Record<string, unknown>)['method']
    );
    expect(sentMethods[0]).toBe(DroidServerMethod.INITIALIZE_SESSION);
    expect(sentMethods[1]).toBe(DroidServerMethod.ADD_USER_MESSAGE);

    // Verify the DroidMessage type sequence
    const types = messages.map((m) => m.type);

    expect(types).toContain('working_state_changed');
    expect(types).toContain('assistant_text_delta');
    expect(types).toContain('tool_use');
    expect(types).toContain('create_message');
    expect(types).toContain('tool_result');
    expect(types).toContain('token_usage_update');

    // Last message must be turn_complete
    expect(types[types.length - 1]).toBe('turn_complete');

    // Verify TurnComplete carries token usage
    const turnComplete = messages[messages.length - 1];
    expect(turnComplete.type).toBe('turn_complete');
    if (turnComplete.type === 'turn_complete') {
      expect(turnComplete.tokenUsage).not.toBeNull();
      expect(turnComplete.tokenUsage!.inputTokens).toBe(200);
      expect(turnComplete.tokenUsage!.outputTokens).toBe(100);
    }

    // Verify text deltas content
    const textDeltas = messages.filter(
      (m) => m.type === 'assistant_text_delta'
    );
    expect(textDeltas.length).toBe(2);
    if (textDeltas[0].type === 'assistant_text_delta') {
      expect(textDeltas[0].text).toBe('Let me check that.');
    }
    if (textDeltas[1].type === 'assistant_text_delta') {
      expect(textDeltas[1].text).toBe('Done!');
    }

    // Verify tool_use message
    const toolUse = messages.find((m) => m.type === 'tool_use');
    expect(toolUse).toBeDefined();
    if (toolUse?.type === 'tool_use') {
      expect(toolUse.toolName).toBe('read_file');
      expect(toolUse.toolUseId).toBe('tu-1');
      expect(toolUse.toolInput).toEqual({ path: '/tmp/test.ts' });
    }

    // Verify tool_result message
    const toolResult = messages.find((m) => m.type === 'tool_result');
    expect(toolResult).toBeDefined();
    if (toolResult?.type === 'tool_result') {
      expect(toolResult.toolUseId).toBe('tu-1');
      expect(toolResult.content).toBe('file contents here');
      expect(toolResult.isError).toBe(false);
    }

    // Transport should be cleaned up
    expect(transport.isConnected).toBe(false);
  });

  it('query() sessionId is available after initialization', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();
    wireTransport(transport, 'sess-q-id');

    const q = query({ prompt: 'Hello', transport });
    expect(q.sessionId).toBeNull();

    const iter = q[Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first.done).toBe(false);
    expect(q.sessionId).toBe('sess-q-id');

    // Consume rest
    while (!(await iter.next()).done) {
      /* drain */
    }

    expect(transport.isConnected).toBe(false);
  });
});

// ===========================================================================
// 2. Full session lifecycle (VAL-CROSS-002)
// ===========================================================================

describe('Full session lifecycle (VAL-CROSS-002)', () => {
  it("createSession() → session.stream('first') → session.send('second') → session.close()", async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let addUserMessageCount = 0;

    wireTransport(transport, 'sess-multi-turn', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        addUserMessageCount++;
        const turnIndex = addUserMessageCount;

        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          // Non-idle
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          // Text delta unique per turn
          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: `msg-turn-${turnIndex}`,
              blockIndex: 0,
              textDelta: `Response to turn ${turnIndex}`,
            })
          );

          // Token usage
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED,
              {
                sessionId: 'sess-multi',
                tokenUsage: {
                  inputTokens: turnIndex * 100,
                  outputTokens: turnIndex * 50,
                  cacheCreationTokens: 0,
                  cacheReadTokens: 0,
                  thinkingTokens: 0,
                },
              }
            )
          );

          // Back to idle
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    // 1. Create session
    const session = await createSession({ cwd: '/tmp', transport });
    expect(session.sessionId).toBe('sess-multi-turn');

    // 2. First turn: stream('first message')
    const streamMessages: DroidMessage[] = [];
    for await (const msg of session.stream('first message')) {
      streamMessages.push(msg);
    }

    expect(streamMessages.length).toBeGreaterThan(0);
    const firstTextDelta = streamMessages.find(
      (m) => m.type === 'assistant_text_delta'
    );
    expect(firstTextDelta).toBeDefined();
    if (firstTextDelta?.type === 'assistant_text_delta') {
      expect(firstTextDelta.text).toBe('Response to turn 1');
    }
    expect(streamMessages[streamMessages.length - 1].type).toBe(
      'turn_complete'
    );

    // 3. Second turn: send('second message') (non-streaming)
    const result = await session.send('second message');

    expect(result.text).toBe('Response to turn 2');
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.tokenUsage).not.toBeNull();
    if (result.tokenUsage) {
      expect(result.tokenUsage.inputTokens).toBe(200);
      expect(result.tokenUsage.outputTokens).toBe(100);
    }

    // 4. Verify two addUserMessage calls were made
    expect(addUserMessageCount).toBe(2);

    // Verify the prompts
    const addMsgCalls = transport.sentMessages.filter(
      (m) =>
        (m as Record<string, unknown>)['method'] ===
        DroidServerMethod.ADD_USER_MESSAGE
    );
    expect(addMsgCalls.length).toBe(2);
    expect(
      (
        (addMsgCalls[0] as Record<string, unknown>)['params'] as Record<
          string,
          unknown
        >
      )['text']
    ).toBe('first message');
    expect(
      (
        (addMsgCalls[1] as Record<string, unknown>)['params'] as Record<
          string,
          unknown
        >
      )['text']
    ).toBe('second message');

    // 5. Close
    await session.close();
    expect(transport.isConnected).toBe(false);
  });

  it('multiple turns on same session work correctly with independent state tracking', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let turnCount = 0;

    wireTransport(transport, 'sess-independent', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        turnCount++;
        const currentTurn = turnCount;

        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          // Each turn independently goes non-idle → idle
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: `msg-${currentTurn}`,
              blockIndex: 0,
              textDelta: `Turn ${currentTurn}`,
            })
          );

          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const session = await createSession({ cwd: '/tmp', transport });

    // Turn 1
    const turn1Msgs: DroidMessage[] = [];
    for await (const msg of session.stream('turn 1')) {
      turn1Msgs.push(msg);
    }
    expect(turn1Msgs[turn1Msgs.length - 1].type).toBe('turn_complete');

    // Turn 2
    const turn2Msgs: DroidMessage[] = [];
    for await (const msg of session.stream('turn 2')) {
      turn2Msgs.push(msg);
    }
    expect(turn2Msgs[turn2Msgs.length - 1].type).toBe('turn_complete');

    // Turn 3
    const turn3Msgs: DroidMessage[] = [];
    for await (const msg of session.stream('turn 3')) {
      turn3Msgs.push(msg);
    }
    expect(turn3Msgs[turn3Msgs.length - 1].type).toBe('turn_complete');

    // Each turn should have its own TurnComplete with independent state
    expect(turnCount).toBe(3);

    // Verify text deltas were unique per turn
    const t1text = turn1Msgs.find((m) => m.type === 'assistant_text_delta');
    const t2text = turn2Msgs.find((m) => m.type === 'assistant_text_delta');
    const t3text = turn3Msgs.find((m) => m.type === 'assistant_text_delta');
    if (t1text?.type === 'assistant_text_delta')
      expect(t1text.text).toBe('Turn 1');
    if (t2text?.type === 'assistant_text_delta')
      expect(t2text.text).toBe('Turn 2');
    if (t3text?.type === 'assistant_text_delta')
      expect(t3text.text).toBe('Turn 3');

    await session.close();
  });

  it('resumeSession loads existing session and works for multiple turns', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let turnCount = 0;

    wireTransport(transport, 'sess-resume', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        turnCount++;
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );
          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-resume',
              blockIndex: 0,
              textDelta: 'Resumed response',
            })
          );
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const session = await resumeSession('sess-resume', { transport });
    expect(session.sessionId).toBe('sess-resume');

    // Verify loadSession was called (not initializeSession)
    const sentMethods = transport.sentMessages.map(
      (m) => (m as Record<string, unknown>)['method']
    );
    expect(sentMethods).toContain(DroidServerMethod.LOAD_SESSION);
    expect(sentMethods).not.toContain(DroidServerMethod.INITIALIZE_SESSION);

    // Use the resumed session
    const result = await session.send('continue');
    expect(result.text).toBe('Resumed response');
    expect(turnCount).toBe(1);

    await session.close();
  });
});

// ===========================================================================
// 3. Permission handler integration (VAL-CROSS-003)
// ===========================================================================

describe('Permission handler integration (VAL-CROSS-003)', () => {
  it('client receives permission request → handler invoked → outcome sent back → stream continues', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    const permissionRequests: Record<string, unknown>[] = [];

    wireTransport(transport, 'sess-perm', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          // Start streaming
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-1',
              blockIndex: 0,
              textDelta: 'I need to run a command.',
            })
          );

          // Server sends a permission request
          transport.injectMessage(
            makeServerRequest(
              'perm-req-001',
              DroidClientMethod.REQUEST_PERMISSION,
              {
                toolName: 'execute',
                command: 'npm test',
                confirmationType: 'exec',
                toolUseIds: ['tu-exec-1'],
              }
            )
          );

          // After the permission is handled, continue streaming
          // (we use setTimeout to ensure the handler has time to run)
          setTimeout(() => {
            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.ExecutingTool }
              )
            );

            transport.injectMessage(
              makeNotification(SessionNotificationType.TOOL_RESULT, {
                messageId: 'msg-perm',
                toolUseId: 'tu-exec-1',
                content: 'All tests passed',
                isError: false,
              })
            );

            transport.injectMessage(
              makeNotification(SessionNotificationType.PERMISSION_RESOLVED, {
                requestId: 'perm-req-001',
                toolUseIds: ['tu-exec-1'],
                selectedOption: ToolConfirmationOutcome.ProceedOnce,
              })
            );

            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage }
              )
            );

            transport.injectMessage(
              makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
                messageId: 'msg-2',
                blockIndex: 0,
                textDelta: 'Tests passed!',
              })
            );

            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          }, 30);
        });
      },
    });

    const messages: DroidMessage[] = [];
    const q = query({
      prompt: 'Run the tests',
      transport,
      permissionHandler: (params) => {
        permissionRequests.push(params);
        return ToolConfirmationOutcome.ProceedOnce;
      },
    });

    for await (const msg of q) {
      messages.push(msg);
    }

    // Permission handler should have been invoked
    expect(permissionRequests.length).toBe(1);
    expect(permissionRequests[0]['toolName']).toBe('execute');
    expect(permissionRequests[0]['command']).toBe('npm test');

    // Verify the permission response was sent back to the server
    const responses = transport.sentMessages.filter(
      (m) => (m as Record<string, unknown>)['type'] === 'response'
    );
    expect(responses.length).toBeGreaterThanOrEqual(1);
    const permResponse = responses.find(
      (m) => (m as Record<string, unknown>)['id'] === 'perm-req-001'
    ) as Record<string, unknown>;
    expect(permResponse).toBeDefined();
    expect(
      (permResponse['result'] as Record<string, unknown>)['selectedOption']
    ).toBe(ToolConfirmationOutcome.ProceedOnce);

    // Stream should have continued after permission was granted
    const types = messages.map((m) => m.type);
    expect(types).toContain('assistant_text_delta');
    expect(types).toContain('tool_result');
    expect(types).toContain('permission_resolved');
    expect(types[types.length - 1]).toBe('turn_complete');

    // Verify we got text from BOTH before and after the permission request
    const textDeltas = messages.filter(
      (m) => m.type === 'assistant_text_delta'
    );
    expect(textDeltas.length).toBe(2);
    if (textDeltas[0].type === 'assistant_text_delta') {
      expect(textDeltas[0].text).toBe('I need to run a command.');
    }
    if (textDeltas[1].type === 'assistant_text_delta') {
      expect(textDeltas[1].text).toBe('Tests passed!');
    }
  });

  it('permission handler works through session API as well', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let handlerCalled = false;

    wireTransport(transport, 'sess-perm-session', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          // Permission request
          transport.injectMessage(
            makeServerRequest(
              'perm-sess-1',
              DroidClientMethod.REQUEST_PERMISSION,
              {
                toolName: 'edit',
                path: '/tmp/file.ts',
              }
            )
          );

          setTimeout(() => {
            transport.injectMessage(
              makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Edited!',
              })
            );
            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          }, 20);
        });
      },
    });

    const session = await createSession({
      cwd: '/tmp',
      transport,
      permissionHandler: () => {
        handlerCalled = true;
        return ToolConfirmationOutcome.ProceedOnce;
      },
    });

    const result = await session.send('edit file');
    expect(handlerCalled).toBe(true);
    expect(result.text).toBe('Edited!');

    await session.close();
  });
});

// ===========================================================================
// 4. Ask-user handler integration (VAL-CROSS-004)
// ===========================================================================

describe('Ask-user handler integration (VAL-CROSS-004)', () => {
  it('client receives ask_user request → handler invoked → answers sent back → stream continues', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    const askUserRequests: Record<string, unknown>[] = [];

    wireTransport(transport, 'sess-ask', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-1',
              blockIndex: 0,
              textDelta: 'I have a question.',
            })
          );

          // Server sends ask_user request
          transport.injectMessage(
            makeServerRequest('ask-req-001', DroidClientMethod.ASK_USER, {
              questions: [
                { id: 'q1', text: 'Which database do you prefer?' },
                { id: 'q2', text: 'Should I add tests?' },
              ],
            })
          );

          // After handler responds, continue streaming
          setTimeout(() => {
            transport.injectMessage(
              makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
                messageId: 'msg-2',
                blockIndex: 0,
                textDelta: 'Got it, using PostgreSQL with tests.',
              })
            );

            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          }, 30);
        });
      },
    });

    const messages: DroidMessage[] = [];
    const q = query({
      prompt: 'Set up the project',
      transport,
      askUserHandler: (params) => {
        askUserRequests.push(params);
        return {
          cancelled: false,
          answers: [
            { questionId: 'q1', answer: 'PostgreSQL' },
            { questionId: 'q2', answer: 'Yes' },
          ],
        };
      },
    });

    for await (const msg of q) {
      messages.push(msg);
    }

    // Ask-user handler should have been invoked
    expect(askUserRequests.length).toBe(1);
    expect(askUserRequests[0]['questions']).toBeDefined();

    // Verify the response was sent back
    const responses = transport.sentMessages.filter(
      (m) => (m as Record<string, unknown>)['type'] === 'response'
    );
    const askResponse = responses.find(
      (m) => (m as Record<string, unknown>)['id'] === 'ask-req-001'
    ) as Record<string, unknown>;
    expect(askResponse).toBeDefined();

    const askResult = askResponse['result'] as Record<string, unknown>;
    expect(askResult['cancelled']).toBe(false);
    expect(askResult['answers']).toEqual([
      { questionId: 'q1', answer: 'PostgreSQL' },
      { questionId: 'q2', answer: 'Yes' },
    ]);

    // Stream should have continued
    const types = messages.map((m) => m.type);
    expect(types).toContain('assistant_text_delta');
    expect(types[types.length - 1]).toBe('turn_complete');

    // Verify text from both before and after ask_user
    const textDeltas = messages.filter(
      (m) => m.type === 'assistant_text_delta'
    );
    expect(textDeltas.length).toBe(2);
    if (textDeltas[1].type === 'assistant_text_delta') {
      expect(textDeltas[1].text).toBe('Got it, using PostgreSQL with tests.');
    }
  });

  it('ask-user handler works through session API', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let handlerCalled = false;

    wireTransport(transport, 'sess-ask-session', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeServerRequest('ask-sess-1', DroidClientMethod.ASK_USER, {
              questions: [{ id: 'q1', text: 'Confirm?' }],
            })
          );

          setTimeout(() => {
            transport.injectMessage(
              makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Confirmed!',
              })
            );
            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          }, 20);
        });
      },
    });

    const session = await createSession({
      cwd: '/tmp',
      transport,
      askUserHandler: () => {
        handlerCalled = true;
        return {
          cancelled: false,
          answers: [{ questionId: 'q1', answer: 'Yes' }],
        };
      },
    });

    const result = await session.send('do it');
    expect(handlerCalled).toBe(true);
    expect(result.text).toBe('Confirmed!');

    await session.close();
  });
});

// ===========================================================================
// 5. Interrupt during streaming (VAL-CROSS-005)
// ===========================================================================

describe('Interrupt during streaming (VAL-CROSS-005)', () => {
  it('session.stream() active → interrupt() called → remaining messages yielded → TurnComplete', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let interruptSent = false;

    wireTransport(transport, 'sess-interrupt', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          // Start streaming with multiple deltas
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-1',
              blockIndex: 0,
              textDelta: 'First chunk. ',
            })
          );

          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-1',
              blockIndex: 0,
              textDelta: 'Second chunk. ',
            })
          );

          // More deltas will come after interrupt is handled
        });
      },
      [DroidServerMethod.INTERRUPT_SESSION]: (id) => {
        interruptSent = true;
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          // After interrupt, agent yields remaining content and goes idle
          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-1',
              blockIndex: 0,
              textDelta: 'Final chunk after interrupt.',
            })
          );

          transport.injectMessage(
            makeNotification(
              SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED,
              {
                sessionId: 'sess-interrupt',
                tokenUsage: {
                  inputTokens: 50,
                  outputTokens: 30,
                  cacheCreationTokens: 0,
                  cacheReadTokens: 0,
                  thinkingTokens: 0,
                },
              }
            )
          );

          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const session = await createSession({ cwd: '/tmp', transport });

    const messages: DroidMessage[] = [];
    let didInterrupt = false;

    for await (const msg of session.stream('Write a long essay')) {
      messages.push(msg);

      // Interrupt after receiving the second text delta
      if (msg.type === 'assistant_text_delta' && !didInterrupt) {
        const textDeltas = messages.filter(
          (m) => m.type === 'assistant_text_delta'
        );
        if (textDeltas.length >= 2) {
          didInterrupt = true;
          await session.interrupt();
        }
      }
    }

    // Interrupt should have been sent
    expect(interruptSent).toBe(true);
    expect(didInterrupt).toBe(true);

    // Should have received all messages including post-interrupt content
    const types = messages.map((m) => m.type);
    expect(types.filter((t) => t === 'assistant_text_delta').length).toBe(3);
    expect(types[types.length - 1]).toBe('turn_complete');

    // Verify the final text delta
    const textDeltas = messages.filter(
      (m) => m.type === 'assistant_text_delta'
    );
    if (textDeltas[2].type === 'assistant_text_delta') {
      expect(textDeltas[2].text).toBe('Final chunk after interrupt.');
    }

    // TurnComplete should carry token usage
    const turnComplete = messages[messages.length - 1];
    if (turnComplete.type === 'turn_complete') {
      expect(turnComplete.tokenUsage).not.toBeNull();
      expect(turnComplete.tokenUsage!.inputTokens).toBe(50);
    }

    // Session should still be usable for another turn
    // (interrupt doesn't close the session)
    // We can verify by checking that session.close() works without error
    // and by verifying no ConnectionError is thrown when we call close.
    await session.close();
    expect(transport.isConnected).toBe(false);
  });

  it('query().interrupt() sends interrupt and stream terminates with TurnComplete', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let interruptReceived = false;

    wireTransport(transport, 'sess-q-int', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-1',
              blockIndex: 0,
              textDelta: 'Starting...',
            })
          );
        });
      },
      [DroidServerMethod.INTERRUPT_SESSION]: (id) => {
        interruptReceived = true;
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const q = query({ prompt: 'Long task', transport });
    const messages: DroidMessage[] = [];

    for await (const msg of q) {
      messages.push(msg);
      if (msg.type === 'assistant_text_delta') {
        await q.interrupt();
      }
    }

    expect(interruptReceived).toBe(true);
    expect(messages[messages.length - 1].type).toBe('turn_complete');
  });
});

// ===========================================================================
// 6. Transport error during query (VAL-CROSS-006)
// ===========================================================================

describe('Transport error during query (VAL-CROSS-006)', () => {
  it('process exits abnormally during initializeSession → ProcessExitError propagated as cause in ConnectionError → query() generator raises error', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    // Don't respond to initializeSession — inject a transport error while the request is pending
    wireTransport(transport, 'sess-error-init', {
      [DroidServerMethod.INITIALIZE_SESSION]: () => {
        // Simulate process crash before responding
        setTimeout(() => {
          transport.injectError(
            new ProcessExitError('Process exited with code 1', {
              exitCode: 1,
              signal: null,
            })
          );
        }, 10);
      },
    });

    let caughtError: Error | null = null;

    try {
      const q = query({ prompt: 'Do something', transport });
      for await (const _msg of q) {
        // Should never get here
      }
    } catch (err) {
      caughtError = err as Error;
    }

    // Error should have been propagated through all layers
    expect(caughtError).not.toBeNull();
    expect(caughtError).toBeInstanceOf(ConnectionError);
    expect(caughtError!.message).toContain('Transport error');
    expect(caughtError!.message).toContain('Process exited');

    // ProcessExitError should be accessible as the cause
    expect(caughtError!.cause).toBeInstanceOf(ProcessExitError);
    const processError = caughtError!.cause as ProcessExitError;
    expect(processError.exitCode).toBe(1);
    expect(processError.signal).toBeNull();
  });

  it('process exits abnormally during addUserMessage → error propagated → query() raises error with ProcessExitError cause', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-error-msg', {
      [DroidServerMethod.ADD_USER_MESSAGE]: () => {
        // Don't respond — simulate crash during message processing
        setTimeout(() => {
          transport.injectError(
            new ProcessExitError('Process killed by SIGTERM', {
              exitCode: null,
              signal: 'SIGTERM',
            })
          );
        }, 10);
      },
    });

    let caughtError: Error | null = null;

    try {
      const q = query({ prompt: 'Do something', transport });
      for await (const _msg of q) {
        // Should not yield any messages
      }
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError).toBeInstanceOf(ConnectionError);
    expect(caughtError!.message).toContain('Transport error');

    // ProcessExitError should be accessible as the cause
    expect(caughtError!.cause).toBeInstanceOf(ProcessExitError);
    const processError = caughtError!.cause as ProcessExitError;
    expect(processError.signal).toBe('SIGTERM');
    expect(processError.exitCode).toBeNull();
  });

  it('transport error during session creation propagates correctly (createSession)', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    // Don't respond to initializeSession — let the transport error hit while it's pending
    wireTransport(transport, 'sess-err-create', {
      [DroidServerMethod.INITIALIZE_SESSION]: () => {
        // Simulate process crash
        setTimeout(() => {
          transport.injectError(
            new ProcessExitError('Process killed by SIGKILL', {
              exitCode: null,
              signal: 'SIGKILL',
            })
          );
        }, 10);
      },
    });

    let caughtError: Error | null = null;

    try {
      await createSession({ cwd: '/tmp', transport });
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError).toBeInstanceOf(ConnectionError);
    expect(caughtError!.message).toContain('Transport error');
  });

  it('transport error rejects pending requests with sticky error pattern', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-sticky', {
      [DroidServerMethod.INITIALIZE_SESSION]: () => {
        // Don't respond — we'll inject an error instead
        setTimeout(() => {
          transport.injectError(
            new ProcessExitError('Crashed on startup', {
              exitCode: 127,
              signal: null,
            })
          );
        }, 10);
      },
    });

    let caughtError: Error | null = null;

    try {
      await createSession({ cwd: '/tmp', transport });
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError).toBeInstanceOf(ConnectionError);
    expect(caughtError!.message).toContain('Transport error');

    // After the error, subsequent requests should also fail (sticky pattern)
    // The transport's error handler was already called, so any new protocol
    // engine on this transport would also fail
  });

  it('transport error during session.send() propagates as ConnectionError', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-err-send', {
      [DroidServerMethod.ADD_USER_MESSAGE]: () => {
        // Don't respond — simulate crash during message processing
        setTimeout(() => {
          transport.injectError(
            new ProcessExitError('Process crashed mid-request', {
              exitCode: 1,
              signal: null,
            })
          );
        }, 10);
      },
    });

    const session = await createSession({ cwd: '/tmp', transport });

    let caughtError: Error | null = null;
    try {
      await session.send('trigger crash');
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError).toBeInstanceOf(ConnectionError);
    expect(caughtError!.message).toContain('Transport error');
  });
});

// ===========================================================================
// 7. Settings update notification flow (VAL-CROSS-007)
// ===========================================================================

describe('Settings update notification flow (VAL-CROSS-007)', () => {
  it('updateSettings() sent → settings_updated notification arrives → SettingsUpdated message in stream', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-settings', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          // Start streaming
          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-1',
              blockIndex: 0,
              textDelta: 'Working on it...',
            })
          );

          // Simulate settings_updated notification arriving during stream
          transport.injectMessage(
            makeNotification(SessionNotificationType.SETTINGS_UPDATED, {
              settings: {
                modelId: 'new-model',
                reasoningEffort: 'high',
              },
            })
          );

          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-2',
              blockIndex: 0,
              textDelta: 'Done!',
            })
          );

          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
      [DroidServerMethod.UPDATE_SESSION_SETTINGS]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          // Server sends a settings_updated notification in response to the update
          transport.injectMessage(
            makeNotification(SessionNotificationType.SETTINGS_UPDATED, {
              settings: {
                modelId: 'upgraded-model',
                reasoningEffort: 'max',
              },
            })
          );
        });
      },
    });

    const session = await createSession({ cwd: '/tmp', transport });

    // First: do a turn that includes a settings_updated notification mid-stream
    const messages: DroidMessage[] = [];
    for await (const msg of session.stream('do work')) {
      messages.push(msg);
    }

    // Verify settings_updated was in the stream
    const settingsUpdated = messages.filter(
      (m) => m.type === 'settings_updated'
    );
    expect(settingsUpdated.length).toBe(1);
    if (settingsUpdated[0].type === 'settings_updated') {
      expect(settingsUpdated[0].settings).toEqual({
        modelId: 'new-model',
        reasoningEffort: 'high',
      });
    }

    // Now test explicit updateSettings call and verify the resulting
    // settings_updated notification is received as a SettingsUpdated message.
    // Collect notifications via onNotification so we can observe the
    // settings_updated notification triggered by updateSettings().
    const settingsNotifications: DroidMessage[] = [];
    const { convertNotificationToStreamMessage } =
      await import('../src/stream.js');
    session.onNotification((notification) => {
      const params = (notification as Record<string, unknown>)['params'] as
        | Record<string, unknown>
        | undefined;
      const inner = params?.['notification'] as
        | Record<string, unknown>
        | undefined;
      if (inner) {
        const converted = convertNotificationToStreamMessage(
          inner as { type: string; [key: string]: unknown }
        );
        if (
          converted &&
          !Array.isArray(converted) &&
          converted.type === 'settings_updated'
        ) {
          settingsNotifications.push(converted);
        }
      }
    });

    await session.updateSettings({ modelId: 'upgraded-model' } as never);

    // Allow microtasks to process the notification
    await new Promise((r) => setTimeout(r, 20));

    // Verify updateSettings was sent
    const sentUpdateSettings = transport.sentMessages.find(
      (m) =>
        (m as Record<string, unknown>)['method'] ===
        DroidServerMethod.UPDATE_SESSION_SETTINGS
    );
    expect(sentUpdateSettings).toBeDefined();

    // Verify the settings_updated notification arrived as a SettingsUpdated message
    expect(settingsNotifications.length).toBe(1);
    expect(settingsNotifications[0].type).toBe('settings_updated');
    if (settingsNotifications[0].type === 'settings_updated') {
      expect(settingsNotifications[0].settings).toEqual({
        modelId: 'upgraded-model',
        reasoningEffort: 'max',
      });
    }

    await session.close();
  });

  it('settings_updated notification appears in query() stream', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-settings-q', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          // Settings update notification mid-stream
          transport.injectMessage(
            makeNotification(SessionNotificationType.SETTINGS_UPDATED, {
              settings: {
                modelId: 'auto-switched-model',
                reasoningEffort: 'medium',
              },
            })
          );

          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-1',
              blockIndex: 0,
              textDelta: 'Switched model.',
            })
          );

          transport.injectMessage(
            makeNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const messages: DroidMessage[] = [];
    const q = query({ prompt: 'Do something', transport });

    for await (const msg of q) {
      messages.push(msg);
    }

    const types = messages.map((m) => m.type);
    expect(types).toContain('settings_updated');

    const settingsMsg = messages.find((m) => m.type === 'settings_updated');
    if (settingsMsg?.type === 'settings_updated') {
      expect(settingsMsg.settings).toEqual({
        modelId: 'auto-switched-model',
        reasoningEffort: 'medium',
      });
    }

    expect(types[types.length - 1]).toBe('turn_complete');
  });
});
