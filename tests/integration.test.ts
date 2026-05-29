/**
 * Integration tests verifying cross-layer behavior.
 *
 * These tests use InMemoryTransport to simulate the full stack
 * (transport → protocol → client → stream → session) without
 * spawning real processes.
 */

import { describe, expect, it } from 'vitest';

import { ProcessExitError, ConnectionError } from '../src/errors.js';
import {
  DroidClientMethod,
  DroidServerMethod,
  DroidWorkingState,
  SessionNotificationType,
  ToolConfirmationOutcome,
} from '../src/schemas/index.js';
import type {
  AskUserRequestParams,
  RequestPermissionRequestParams,
} from '../src/schemas/index.js';
import { createSession, resumeSession } from '../src/session.js';
import type { DroidMessage } from '../src/stream.js';
import {
  InMemoryTransport,
  collectStreamText,
  findLastResult,
  makePermissionRequestParams,
  makeServerRequest,
  makeSessionNotification,
  makeSuccessResponse,
  sendDefaultStreamSequence,
  wireTransportSend,
} from './helpers.js';

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
  wireTransportSend(transport, ({ method, id, params }) => {
    if (overrides?.[method]) {
      overrides[method](id, params);
      return;
    }

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
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));
        });
        break;
    }
  });
}

describe('Full session stream lifecycle (VAL-CROSS-001)', () => {
  it('session.stream() sends initializeSession + addUserMessage, receives streaming notifications, and yields Result', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-lifecycle', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Let me check that.',
              }
            )
          );

          transport.injectMessage(
            makeSessionNotification(SessionNotificationType.CREATE_MESSAGE, {
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

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.ExecutingTool }
            )
          );

          transport.injectMessage(
            makeSessionNotification(SessionNotificationType.TOOL_RESULT, {
              messageId: 'msg-2',
              toolUseId: 'tu-1',
              content: 'file contents here',
              isError: false,
            })
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-3',
                blockIndex: 0,
                textDelta: 'Done!',
              }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
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

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      cwd: '/tmp',
      transport,
    });
    const messages: DroidMessage[] = [];

    for await (const msg of session.stream('Fix the bug', {
      includePartialMessages: true,
    })) {
      messages.push(msg);
    }

    const sentMethods = transport.sentMessages.map(
      (m) => (m as Record<string, unknown>)['method']
    );
    expect(sentMethods[0]).toBe(DroidServerMethod.INITIALIZE_SESSION);
    expect(sentMethods[1]).toBe(DroidServerMethod.ADD_USER_MESSAGE);

    const types = messages.map((m) => m.type);

    expect(types).toContain('working_state_changed');
    expect(types).toContain('assistant_text_delta');
    expect(types).toContain('tool_call');
    expect(types).toContain('assistant');
    expect(types).toContain('tool_result');
    expect(types).toContain('token_usage_update');

    expect(types[types.length - 1]).toBe('result');

    const resultMessage = messages[messages.length - 1];
    expect(resultMessage.type).toBe('result');
    if (resultMessage.type === 'result') {
      expect(resultMessage.tokenUsage).not.toBeNull();
      expect(resultMessage.tokenUsage!.inputTokens).toBe(200);
      expect(resultMessage.tokenUsage!.outputTokens).toBe(100);
    }

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

    const toolUse = messages.find((m) => m.type === 'tool_call');
    expect(toolUse).toBeDefined();
    if (toolUse?.type === 'tool_call') {
      expect(toolUse.toolUse.name).toBe('read_file');
      expect(toolUse.toolUse.id).toBe('tu-1');
      expect(toolUse.toolUse.input).toEqual({ path: '/tmp/test.ts' });
    }

    const toolResult = messages.find((m) => m.type === 'tool_result');
    expect(toolResult).toBeDefined();
    if (toolResult?.type === 'tool_result') {
      expect(toolResult.toolUseId).toBe('tu-1');
      expect(toolResult.content).toBe('file contents here');
      expect(toolResult.isError).toBe(false);
    }

    expect(session.sessionId).toBe('sess-lifecycle');
    await session.close();
    expect(transport.isConnected).toBe(false);
  });
});

describe('Full session lifecycle (VAL-CROSS-002)', () => {
  it("createSession() → session.stream('first', { includePartialMessages: true }) → session.stream('second', { includePartialMessages: true }) → session.close()", async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let addUserMessageCount = 0;

    wireTransport(transport, 'sess-multi-turn', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        addUserMessageCount++;
        const turnIndex = addUserMessageCount;

        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: `msg-turn-${turnIndex}`,
                blockIndex: 0,
                textDelta: `Response to turn ${turnIndex}`,
              }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
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

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      cwd: '/tmp',
      transport,
    });
    expect(session.sessionId).toBe('sess-multi-turn');

    const streamMessages: DroidMessage[] = [];
    for await (const msg of session.stream('first message', {
      includePartialMessages: true,
    })) {
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
    expect(streamMessages[streamMessages.length - 1].type).toBe('result');

    const secondMessages: DroidMessage[] = [];
    for await (const msg of session.stream('second message', {
      includePartialMessages: true,
    })) {
      secondMessages.push(msg);
    }

    const secondTextDelta = secondMessages.find(
      (m) => m.type === 'assistant_text_delta'
    );
    expect(secondTextDelta).toBeDefined();
    if (secondTextDelta?.type === 'assistant_text_delta') {
      expect(secondTextDelta.text).toBe('Response to turn 2');
    }
    const resultMessage = findLastResult(secondMessages);
    expect(resultMessage?.type).toBe('result');
    if (resultMessage?.type === 'result') {
      expect(resultMessage.tokenUsage).not.toBeNull();
      expect(resultMessage.tokenUsage!.inputTokens).toBe(200);
      expect(resultMessage.tokenUsage!.outputTokens).toBe(100);
    }

    expect(addUserMessageCount).toBe(2);

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

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: `msg-${currentTurn}`,
                blockIndex: 0,
                textDelta: `Turn ${currentTurn}`,
              }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      cwd: '/tmp',
      transport,
    });

    const turn1Msgs: DroidMessage[] = [];
    for await (const msg of session.stream('turn 1', {
      includePartialMessages: true,
    })) {
      turn1Msgs.push(msg);
    }
    expect(turn1Msgs[turn1Msgs.length - 1].type).toBe('result');

    const turn2Msgs: DroidMessage[] = [];
    for await (const msg of session.stream('turn 2', {
      includePartialMessages: true,
    })) {
      turn2Msgs.push(msg);
    }
    expect(turn2Msgs[turn2Msgs.length - 1].type).toBe('result');

    const turn3Msgs: DroidMessage[] = [];
    for await (const msg of session.stream('turn 3', {
      includePartialMessages: true,
    })) {
      turn3Msgs.push(msg);
    }
    expect(turn3Msgs[turn3Msgs.length - 1].type).toBe('result');

    expect(turnCount).toBe(3);

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
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );
          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-resume',
                blockIndex: 0,
                textDelta: 'Resumed response',
              }
            )
          );
          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const session = await resumeSession('sess-resume', {
      apiKey: 'test-key',
      transport,
    });
    expect(session.sessionId).toBe('sess-resume');

    const sentMethods = transport.sentMessages.map(
      (m) => (m as Record<string, unknown>)['method']
    );
    expect(sentMethods).toContain(DroidServerMethod.LOAD_SESSION);
    expect(sentMethods).not.toContain(DroidServerMethod.INITIALIZE_SESSION);

    const result = await collectStreamText(session, 'continue');
    expect(result.text).toBe('Resumed response');
    expect(turnCount).toBe(1);

    await session.close();
  });
});

describe('Permission handler integration (VAL-CROSS-003)', () => {
  it('client receives permission request → handler invoked → outcome sent back → stream continues', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    const permissionRequests: RequestPermissionRequestParams[] = [];

    wireTransport(transport, 'sess-perm', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'I need to run a command.',
              }
            )
          );

          transport.injectMessage(
            makeServerRequest(
              'perm-req-001',
              DroidClientMethod.REQUEST_PERMISSION,
              makePermissionRequestParams({
                toolUseId: 'tu-exec-1',
                toolName: 'execute',
                confirmationType: 'exec',
                input: { command: 'npm test' },
                details: {
                  type: 'exec',
                  fullCommand: 'npm test',
                  command: 'npm test',
                },
              })
            )
          );

          setTimeout(() => {
            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.ExecutingTool }
              )
            );

            transport.injectMessage(
              makeSessionNotification(SessionNotificationType.TOOL_RESULT, {
                messageId: 'msg-perm',
                toolUseId: 'tu-exec-1',
                content: 'All tests passed',
                isError: false,
              })
            );

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.PERMISSION_RESOLVED,
                {
                  requestId: 'perm-req-001',
                  toolUseIds: ['tu-exec-1'],
                  selectedOption: ToolConfirmationOutcome.ProceedOnce,
                }
              )
            );

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage }
              )
            );

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.ASSISTANT_TEXT_DELTA,
                {
                  messageId: 'msg-2',
                  blockIndex: 0,
                  textDelta: 'Tests passed!',
                }
              )
            );

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          }, 30);
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      transport,
      permissionHandler: (params) => {
        permissionRequests.push(params);
        return ToolConfirmationOutcome.ProceedOnce;
      },
    });

    const messages: DroidMessage[] = [];
    for await (const msg of session.stream('Run the tests', {
      includePartialMessages: true,
    })) {
      messages.push(msg);
    }

    expect(permissionRequests.length).toBe(1);
    expect(permissionRequests[0].toolUses[0]?.toolUse.name).toBe('execute');
    expect(permissionRequests[0].toolUses[0]?.toolUse.input).toEqual({
      command: 'npm test',
    });

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

    const types = messages.map((m) => m.type);
    expect(types).toContain('assistant_text_delta');
    expect(types).toContain('tool_result');
    expect(types).toContain('permission_resolved');
    expect(types[types.length - 1]).toBe('result');

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

    await session.close();
  });

  it('handles two permission requests in a single turn', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    const handlerCalls: RequestPermissionRequestParams[] = [];

    wireTransport(transport, 'sess-multi-perm', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Need two permissions.',
              }
            )
          );

          transport.injectMessage(
            makeServerRequest(
              'perm-multi-1',
              DroidClientMethod.REQUEST_PERMISSION,
              makePermissionRequestParams({
                toolUseId: 'tu-1',
                toolName: 'execute',
                confirmationType: 'exec',
                input: { command: 'npm test' },
                details: {
                  type: 'exec',
                  fullCommand: 'npm test',
                  command: 'npm test',
                },
              })
            )
          );

          setTimeout(() => {
            transport.injectMessage(
              makeSessionNotification(SessionNotificationType.TOOL_RESULT, {
                messageId: 'msg-tr-1',
                toolUseId: 'tu-1',
                content: 'test output',
                isError: false,
              })
            );

            transport.injectMessage(
              makeServerRequest(
                'perm-multi-2',
                DroidClientMethod.REQUEST_PERMISSION,
                makePermissionRequestParams({
                  toolUseId: 'tu-2',
                  toolName: 'edit',
                  confirmationType: 'edit',
                  input: { path: '/tmp/file.ts' },
                  details: {
                    type: 'edit',
                    filePath: '/tmp/file.ts',
                    fileName: 'file.ts',
                  },
                })
              )
            );

            setTimeout(() => {
              transport.injectMessage(
                makeSessionNotification(SessionNotificationType.TOOL_RESULT, {
                  messageId: 'msg-tr-2',
                  toolUseId: 'tu-2',
                  content: 'edited',
                  isError: false,
                })
              );

              transport.injectMessage(
                makeSessionNotification(
                  SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                  { newState: DroidWorkingState.Idle }
                )
              );
            }, 20);
          }, 20);
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      transport,
      permissionHandler: (params) => {
        handlerCalls.push(params);
        return ToolConfirmationOutcome.ProceedOnce;
      },
    });

    const messages: DroidMessage[] = [];
    for await (const msg of session.stream('Do two things', {
      includePartialMessages: true,
    })) {
      messages.push(msg);
    }

    expect(handlerCalls.length).toBe(2);
    expect(handlerCalls[0].toolUses[0]?.toolUse.name).toBe('execute');
    expect(handlerCalls[1].toolUses[0]?.toolUse.name).toBe('edit');

    const permResponses = transport.sentMessages.filter(
      (m) =>
        (m as Record<string, unknown>)['type'] === 'response' &&
        ((m as Record<string, unknown>)['id'] === 'perm-multi-1' ||
          (m as Record<string, unknown>)['id'] === 'perm-multi-2')
    );
    expect(permResponses.length).toBe(2);

    const types = messages.map((m) => m.type);
    expect(types[types.length - 1]).toBe('result');

    await session.close();
  });

  it('permission handler returning Cancel prevents tool execution and stream completes', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-cancel-perm', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Need permission.',
              }
            )
          );

          transport.injectMessage(
            makeServerRequest(
              'perm-cancel-1',
              DroidClientMethod.REQUEST_PERMISSION,
              makePermissionRequestParams({
                toolUseId: 'tu-cancel-1',
                toolName: 'execute',
                confirmationType: 'exec',
                input: { command: 'rm -rf /' },
                details: {
                  type: 'exec',
                  fullCommand: 'rm -rf /',
                  command: 'rm -rf /',
                },
              })
            )
          );

          setTimeout(() => {
            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          }, 20);
        });
      },
    });

    let handlerCalled = false;

    const session = await createSession({
      apiKey: 'test-key',
      cwd: '/tmp',
      transport,
      permissionHandler: () => {
        handlerCalled = true;
        return ToolConfirmationOutcome.Cancel;
      },
    });

    const messages: DroidMessage[] = [];
    for await (const msg of session.stream('dangerous command', {
      includePartialMessages: true,
    })) {
      messages.push(msg);
    }

    expect(handlerCalled).toBe(true);

    const permResponse = transport.sentMessages.find(
      (m) =>
        (m as Record<string, unknown>)['type'] === 'response' &&
        (m as Record<string, unknown>)['id'] === 'perm-cancel-1'
    ) as Record<string, unknown>;
    expect(permResponse).toBeDefined();
    expect(
      (permResponse['result'] as Record<string, unknown>)['selectedOption']
    ).toBe(ToolConfirmationOutcome.Cancel);

    expect(messages[messages.length - 1].type).toBe('result');

    await session.close();
    expect(transport.isConnected).toBe(false);
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
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeServerRequest(
              'perm-sess-1',
              DroidClientMethod.REQUEST_PERMISSION,
              makePermissionRequestParams({
                toolUseId: 'tu-edit-session-1',
                toolName: 'edit',
                confirmationType: 'edit',
                input: { path: '/tmp/file.ts' },
                details: {
                  type: 'edit',
                  filePath: '/tmp/file.ts',
                  fileName: 'file.ts',
                },
              })
            )
          );

          setTimeout(() => {
            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.ASSISTANT_TEXT_DELTA,
                {
                  messageId: 'msg-1',
                  blockIndex: 0,
                  textDelta: 'Edited!',
                }
              )
            );
            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          }, 20);
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      cwd: '/tmp',
      transport,
      permissionHandler: () => {
        handlerCalled = true;
        return ToolConfirmationOutcome.ProceedOnce;
      },
    });

    const result = await collectStreamText(session, 'edit file');
    expect(handlerCalled).toBe(true);
    expect(result.text).toBe('Edited!');

    await session.close();
  });
});

describe('Ask-user handler integration (VAL-CROSS-004)', () => {
  it('client receives ask_user request → handler invoked → answers sent back → stream continues', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    const askUserRequests: AskUserRequestParams[] = [];

    wireTransport(transport, 'sess-ask', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'I have a question.',
              }
            )
          );

          transport.injectMessage(
            makeServerRequest('ask-req-001', DroidClientMethod.ASK_USER, {
              toolCallId: 'tool-ask-001',
              questions: [
                {
                  index: 0,
                  topic: 'Database',
                  question: 'Which database do you prefer?',
                  options: ['PostgreSQL', 'MySQL'],
                },
                {
                  index: 1,
                  topic: 'Testing',
                  question: 'Should I add tests?',
                  options: ['Yes', 'No'],
                },
              ],
            })
          );

          setTimeout(() => {
            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.ASSISTANT_TEXT_DELTA,
                {
                  messageId: 'msg-2',
                  blockIndex: 0,
                  textDelta: 'Got it, using PostgreSQL with tests.',
                }
              )
            );

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          }, 30);
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      transport,
      askUserHandler: (params) => {
        askUserRequests.push(params);
        return {
          cancelled: false,
          answers: [
            {
              index: 0,
              question: 'Which database do you prefer?',
              answer: 'PostgreSQL',
            },
            { index: 1, question: 'Should I add tests?', answer: 'Yes' },
          ],
        };
      },
    });

    const messages: DroidMessage[] = [];
    for await (const msg of session.stream('Set up the project', {
      includePartialMessages: true,
    })) {
      messages.push(msg);
    }

    expect(askUserRequests.length).toBe(1);
    expect(askUserRequests[0]?.questions).toBeDefined();

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
      {
        index: 0,
        question: 'Which database do you prefer?',
        answer: 'PostgreSQL',
      },
      { index: 1, question: 'Should I add tests?', answer: 'Yes' },
    ]);

    const types = messages.map((m) => m.type);
    expect(types).toContain('assistant_text_delta');
    expect(types[types.length - 1]).toBe('result');

    const textDeltas = messages.filter(
      (m) => m.type === 'assistant_text_delta'
    );
    expect(textDeltas.length).toBe(2);
    if (textDeltas[1].type === 'assistant_text_delta') {
      expect(textDeltas[1].text).toBe('Got it, using PostgreSQL with tests.');
    }

    await session.close();
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
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeServerRequest('ask-sess-1', DroidClientMethod.ASK_USER, {
              toolCallId: 'tool-ask-session-1',
              questions: [
                {
                  index: 0,
                  topic: 'Confirmation',
                  question: 'Confirm?',
                  options: ['Yes', 'No'],
                },
              ],
            })
          );

          setTimeout(() => {
            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.ASSISTANT_TEXT_DELTA,
                {
                  messageId: 'msg-1',
                  blockIndex: 0,
                  textDelta: 'Confirmed!',
                }
              )
            );
            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          }, 20);
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      cwd: '/tmp',
      transport,
      askUserHandler: () => {
        handlerCalled = true;
        return {
          cancelled: false,
          answers: [{ index: 0, question: 'Confirm?', answer: 'Yes' }],
        };
      },
    });

    const result = await collectStreamText(session, 'do it');
    expect(handlerCalled).toBe(true);
    expect(result.text).toBe('Confirmed!');

    await session.close();
  });
});

describe('Interrupt during active streaming (VAL-CROSS-005)', () => {
  it('interrupt during ExecutingTool state emits Result', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let interruptRequestSent = false;

    wireTransport(transport, 'sess-int-exec-tool', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Running tool...',
              }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.ExecutingTool }
            )
          );
        });
      },
      [DroidServerMethod.INTERRUPT_SESSION]: (id) => {
        interruptRequestSent = true;
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      cwd: '/tmp',
      transport,
    });

    const messages: DroidMessage[] = [];
    let didInterrupt = false;

    for await (const msg of session.stream('test', {
      includePartialMessages: true,
    })) {
      messages.push(msg);

      if (
        msg.type === 'working_state_changed' &&
        msg.state === DroidWorkingState.ExecutingTool &&
        !didInterrupt
      ) {
        didInterrupt = true;
        await session.interrupt();
      }
    }

    expect(interruptRequestSent).toBe(true);
    expect(didInterrupt).toBe(true);

    const types = messages.map((m) => m.type);
    expect(types[types.length - 1]).toBe('result');

    await session.close();
  });

  it('session is usable after interrupt — second turn works', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let addUserMessageCount = 0;

    wireTransport(transport, 'sess-reuse-after-int', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        addUserMessageCount++;
        const callIndex = addUserMessageCount;

        if (callIndex === 1) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage }
              )
            );

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.ASSISTANT_TEXT_DELTA,
                {
                  messageId: 'msg-1',
                  blockIndex: 0,
                  textDelta: 'Partial response',
                }
              )
            );
          });
        } else {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage }
              )
            );

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.ASSISTANT_TEXT_DELTA,
                {
                  messageId: 'msg-2',
                  blockIndex: 0,
                  textDelta: 'Full second response',
                }
              )
            );

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          });
        }
      },
      [DroidServerMethod.INTERRUPT_SESSION]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      cwd: '/tmp',
      transport,
    });

    const msgs1: DroidMessage[] = [];
    for await (const msg of session.stream('first', {
      includePartialMessages: true,
    })) {
      msgs1.push(msg);
      if (msg.type === 'assistant_text_delta') {
        await session.interrupt();
      }
    }
    expect(msgs1[msgs1.length - 1].type).toBe('result');

    const result = await collectStreamText(session, 'second');
    expect(result.text).toBe('Full second response');
    expect(result.messages.length).toBeGreaterThan(0);

    expect(addUserMessageCount).toBe(2);

    await session.close();
  });

  it('session.stream() active → interrupt() called → remaining messages yielded → Result', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let interruptSent = false;

    wireTransport(transport, 'sess-interrupt', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'First chunk. ',
              }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Second chunk. ',
              }
            )
          );
        });
      },
      [DroidServerMethod.INTERRUPT_SESSION]: (id) => {
        interruptSent = true;
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Final chunk after interrupt.',
              }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
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
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      cwd: '/tmp',
      transport,
    });

    const messages: DroidMessage[] = [];
    let didInterrupt = false;

    for await (const msg of session.stream('Write a long essay', {
      includePartialMessages: true,
    })) {
      messages.push(msg);

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

    expect(interruptSent).toBe(true);
    expect(didInterrupt).toBe(true);

    const types = messages.map((m) => m.type);
    expect(types.filter((t) => t === 'assistant_text_delta').length).toBe(3);
    expect(types[types.length - 1]).toBe('result');

    const textDeltas = messages.filter(
      (m) => m.type === 'assistant_text_delta'
    );
    if (textDeltas[2].type === 'assistant_text_delta') {
      expect(textDeltas[2].text).toBe('Final chunk after interrupt.');
    }

    const resultMessage = messages[messages.length - 1];
    if (resultMessage.type === 'result') {
      expect(resultMessage.tokenUsage).not.toBeNull();
      expect(resultMessage.tokenUsage!.inputTokens).toBe(50);
    }

    await session.close();
    expect(transport.isConnected).toBe(false);
  });
});

describe('Transport errors during supported session APIs (VAL-CROSS-006)', () => {
  it('process exits abnormally during initializeSession → ProcessExitError propagated as cause in ConnectionError', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-error-init', {
      [DroidServerMethod.INITIALIZE_SESSION]: () => {
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
      await createSession({ apiKey: 'test-key', transport });
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError).toBeInstanceOf(ConnectionError);
    expect(caughtError!.message).toContain('Transport error');
    expect(caughtError!.message).toContain('Process exited');

    expect(caughtError!.cause).toBeInstanceOf(ProcessExitError);
    const processError = caughtError!.cause as ProcessExitError;
    expect(processError.exitCode).toBe(1);
    expect(processError.signal).toBeNull();
  });

  it('process exits abnormally during addUserMessage → stream raises error with ProcessExitError cause', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-error-msg', {
      [DroidServerMethod.ADD_USER_MESSAGE]: () => {
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
    const session = await createSession({ apiKey: 'test-key', transport });

    try {
      for await (const _msg of session.stream('Do something', {
        includePartialMessages: true,
      })) {
        void _msg;
      }
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError).toBeInstanceOf(ConnectionError);
    expect(caughtError!.message).toContain('Transport error');

    expect(caughtError!.cause).toBeInstanceOf(ProcessExitError);
    const processError = caughtError!.cause as ProcessExitError;
    expect(processError.signal).toBe('SIGTERM');
    expect(processError.exitCode).toBeNull();
  });

  it('transport error during session creation propagates correctly (createSession)', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-err-create', {
      [DroidServerMethod.INITIALIZE_SESSION]: () => {
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
      await createSession({ apiKey: 'test-key', cwd: '/tmp', transport });
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
      await createSession({ apiKey: 'test-key', cwd: '/tmp', transport });
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError).toBeInstanceOf(ConnectionError);
    expect(caughtError!.message).toContain('Transport error');
  });

  it('transport error during session.stream() propagates as ConnectionError', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-err-send', {
      [DroidServerMethod.ADD_USER_MESSAGE]: () => {
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

    const session = await createSession({
      apiKey: 'test-key',
      cwd: '/tmp',
      transport,
    });

    let caughtError: Error | null = null;
    try {
      for await (const _msg of session.stream('trigger crash', {
        includePartialMessages: true,
      })) {
        void _msg;
      }
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError).toBeInstanceOf(ConnectionError);
    expect(caughtError!.message).toContain('Transport error');
  });
});

describe('Settings update notification flow (VAL-CROSS-007)', () => {
  it('updateSettings() sent → settings_updated notification arrives → SettingsUpdated message in stream', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-settings', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Working on it...',
              }
            )
          );

          transport.injectMessage(
            makeSessionNotification(SessionNotificationType.SETTINGS_UPDATED, {
              settings: {
                modelId: 'new-model',
                reasoningEffort: 'high',
              },
            })
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-2',
                blockIndex: 0,
                textDelta: 'Done!',
              }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
      [DroidServerMethod.UPDATE_SESSION_SETTINGS]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(SessionNotificationType.SETTINGS_UPDATED, {
              settings: {
                modelId: 'upgraded-model',
                reasoningEffort: 'max',
              },
            })
          );
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      cwd: '/tmp',
      transport,
    });

    const messages: DroidMessage[] = [];
    for await (const msg of session.stream('do work', {
      includePartialMessages: true,
    })) {
      messages.push(msg);
    }

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

    await new Promise((r) => {
      setTimeout(r, 20);
    });

    const sentUpdateSettings = transport.sentMessages.find(
      (m) =>
        (m as Record<string, unknown>)['method'] ===
        DroidServerMethod.UPDATE_SESSION_SETTINGS
    );
    expect(sentUpdateSettings).toBeDefined();

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

  it('permission handler receives full edit confirmation details', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let receivedDetails: RequestPermissionRequestParams | null = null;

    wireTransport(transport, 'sess-perm-details', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeServerRequest(
              'perm-detail-1',
              DroidClientMethod.REQUEST_PERMISSION,
              makePermissionRequestParams({
                toolUseId: 'tu-edit-details',
                toolName: 'edit',
                confirmationType: 'edit',
                details: {
                  type: 'edit',
                  filePath: '/src/main.ts',
                  fileName: 'main.ts',
                  oldContent: 'const x = 1;',
                  newContent: 'const x = 2;',
                },
              })
            )
          );

          setTimeout(() => {
            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          }, 20);
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      transport,
      permissionHandler: (params) => {
        receivedDetails = params;
        return ToolConfirmationOutcome.ProceedOnce;
      },
    });

    const messages: DroidMessage[] = [];
    for await (const msg of session.stream('Edit the file', {
      includePartialMessages: true,
    })) {
      messages.push(msg);
    }

    expect(receivedDetails).not.toBeNull();
    expect(receivedDetails).toMatchObject({
      toolUses: [
        {
          confirmationType: 'edit',
          details: {
            filePath: '/src/main.ts',
            fileName: 'main.ts',
            oldContent: 'const x = 1;',
            newContent: 'const x = 2;',
          },
        },
      ],
    });

    expect(messages[messages.length - 1].type).toBe('result');
    await session.close();
  });

  it('ask-user handler returning cancelled: true sends cancelled response and stream continues', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    let handlerCalled = false;

    wireTransport(transport, 'sess-ask-cancel', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeServerRequest('ask-cancel-1', DroidClientMethod.ASK_USER, {
              toolCallId: 'tool-ask-cancel-1',
              questions: [
                {
                  index: 0,
                  topic: 'DB',
                  question: 'Which database?',
                  options: ['PostgreSQL', 'MySQL'],
                },
              ],
            })
          );

          setTimeout(() => {
            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.ASSISTANT_TEXT_DELTA,
                {
                  messageId: 'msg-1',
                  blockIndex: 0,
                  textDelta: 'Understood, skipping.',
                }
              )
            );

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          }, 20);
        });
      },
    });

    const session = await createSession({
      apiKey: 'test-key',
      transport,
      askUserHandler: () => {
        handlerCalled = true;
        return { cancelled: true, answers: [] };
      },
    });

    const messages: DroidMessage[] = [];
    for await (const msg of session.stream('Set up DB', {
      includePartialMessages: true,
    })) {
      messages.push(msg);
    }

    expect(handlerCalled).toBe(true);

    const askResponse = transport.sentMessages.find(
      (m) =>
        (m as Record<string, unknown>)['type'] === 'response' &&
        (m as Record<string, unknown>)['id'] === 'ask-cancel-1'
    ) as Record<string, unknown>;
    expect(askResponse).toBeDefined();
    const result = askResponse['result'] as Record<string, unknown>;
    expect(result['cancelled']).toBe(true);
    expect(result['answers']).toEqual([]);

    expect(messages[messages.length - 1].type).toBe('result');
    await session.close();
  });

  it('settings_updated notification appears in session.stream()', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransport(transport, 'sess-settings-q', {
      [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );

          transport.injectMessage(
            makeSessionNotification(SessionNotificationType.SETTINGS_UPDATED, {
              settings: {
                modelId: 'auto-switched-model',
                reasoningEffort: 'medium',
              },
            })
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.ASSISTANT_TEXT_DELTA,
              {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Switched model.',
              }
            )
          );

          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      },
    });

    const session = await createSession({ apiKey: 'test-key', transport });
    const messages: DroidMessage[] = [];

    for await (const msg of session.stream('Do something', {
      includePartialMessages: true,
    })) {
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

    expect(types[types.length - 1]).toBe('result');
    await session.close();
  });
});
