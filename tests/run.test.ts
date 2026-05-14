import { describe, expect, it } from 'vitest';

import { run } from '../src/run.js';
import {
  DroidErrorType,
  DroidServerMethod,
  DroidWorkingState,
  OutputFormatType,
  ReasoningEffort,
  SessionNotificationType,
} from '../src/schemas/index.js';
import {
  InMemoryTransport,
  makeErrorResponse,
  makeSessionNotification,
  makeSuccessResponse,
  sendDefaultStreamSequence,
  wireTransportSend,
} from './helpers.js';

function setupRunResponder(
  transport: InMemoryTransport,
  sessionId: string
): void {
  wireTransportSend(transport, ({ method, id }) => {
    if (method === DroidServerMethod.INITIALIZE_SESSION) {
      queueMicrotask(() => {
        transport.injectMessage(
          makeSuccessResponse(id, {
            sessionId,
            session: {},
            settings: { modelId: 'test-model', reasoningEffort: 'medium' },
            availableModels: [],
          })
        );
      });
      return;
    }

    if (method === DroidServerMethod.ADD_USER_MESSAGE) {
      queueMicrotask(() => {
        transport.injectMessage(makeSuccessResponse(id, {}));
        sendDefaultStreamSequence(transport, {
          deltas: ['Run ', 'result'],
          tokenUsageSessionId: sessionId,
        });
      });
    }
  });
}

describe('run()', () => {
  it('returns DroidResult from a one-shot prompt and closes the session', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();
    setupRunResponder(transport, 'sess-run-success');

    const result = await run('Say hello', { transport });

    expect(result.text).toBe('Run result');
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.tokenUsage).not.toBeNull();
    expect(transport.isConnected).toBe(false);
  });

  it('passes session options and message attachments through', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();
    setupRunResponder(transport, 'sess-run-options');

    await run('Describe these inputs', {
      transport,
      cwd: '/tmp/project',
      machineId: 'machine-1',
      modelId: 'model-1',
      reasoningEffort: ReasoningEffort.High,
      images: [{ type: 'base64', data: 'image-data', mediaType: 'image/png' }],
      files: [
        {
          type: 'base64',
          data: 'file-data',
          mediaType: 'application/pdf',
          name: 'input.pdf',
        },
      ],
    });

    const initMsg = transport.sentMessages.find(
      (message) =>
        (message as Record<string, unknown>)['method'] ===
        DroidServerMethod.INITIALIZE_SESSION
    ) as Record<string, unknown>;
    const initParams = initMsg['params'] as Record<string, unknown>;
    expect(initParams['cwd']).toBe('/tmp/project');
    expect(initParams['machineId']).toBe('machine-1');
    expect(initParams['modelId']).toBe('model-1');
    expect(initParams['reasoningEffort']).toBe(ReasoningEffort.High);

    const addMsg = transport.sentMessages.find(
      (message) =>
        (message as Record<string, unknown>)['method'] ===
        DroidServerMethod.ADD_USER_MESSAGE
    ) as Record<string, unknown>;
    const addParams = addMsg['params'] as Record<string, unknown>;
    expect(addParams['text']).toBe('Describe these inputs');
    expect(addParams['images']).toEqual([
      { type: 'base64', data: 'image-data', mediaType: 'image/png' },
    ]);
    expect(addParams['files']).toEqual([
      {
        type: 'base64',
        data: 'file-data',
        mediaType: 'application/pdf',
        name: 'input.pdf',
      },
    ]);
  });

  it('closes the session when send fails', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransportSend(transport, ({ method, id }) => {
      if (method === DroidServerMethod.INITIALIZE_SESSION) {
        queueMicrotask(() => {
          transport.injectMessage(
            makeSuccessResponse(id, {
              sessionId: 'sess-run-send-failure',
              session: {},
              settings: { modelId: 'test-model', reasoningEffort: 'medium' },
              availableModels: [],
            })
          );
        });
      } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
        queueMicrotask(() => {
          transport.injectMessage(makeErrorResponse(id, -32603, 'send failed'));
        });
      }
    });

    await expect(run('This will fail', { transport })).rejects.toThrow(
      'send failed'
    );
    expect(transport.isConnected).toBe(false);
  });

  it('reports error metadata when an error event is emitted', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransportSend(transport, ({ method, id }) => {
      if (method === DroidServerMethod.INITIALIZE_SESSION) {
        queueMicrotask(() => {
          transport.injectMessage(
            makeSuccessResponse(id, {
              sessionId: 'sess-run-error-metadata',
              session: {},
              settings: { modelId: 'test', reasoningEffort: 'medium' },
            })
          );
        });
      } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));
          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );
          transport.injectMessage(
            makeSessionNotification(SessionNotificationType.ERROR, {
              message: 'Something went wrong',
              errorType: DroidErrorType.ERROR,
              timestamp: '2026-05-02T00:00:00.000Z',
            })
          );
          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      }
    });

    const result = await run('Test error metadata', { transport });

    expect(result.success).toBe(false);
    expect(result.error).toMatchObject({
      type: 'error',
      message: 'Something went wrong',
      errorType: DroidErrorType.ERROR,
    });
    expect(result.sessionId).toBe('sess-run-error-metadata');
    expect(result.turnCount).toBe(1);
    expect(transport.isConnected).toBe(false);
  });

  it('passes outputFormat and aggregates structured output', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransportSend(transport, ({ method, id }) => {
      if (method === DroidServerMethod.INITIALIZE_SESSION) {
        queueMicrotask(() => {
          transport.injectMessage(
            makeSuccessResponse(id, {
              sessionId: 'sess-run-structured-output',
              session: {},
              settings: { modelId: 'test', reasoningEffort: 'medium' },
            })
          );
        });
      } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));
          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );
          transport.injectMessage(
            makeSessionNotification(SessionNotificationType.CREATE_MESSAGE, {
              message: {
                id: 'msg-structured',
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ name: 'Ada' }),
                  },
                ],
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            })
          );
          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      }
    });

    const outputFormat = {
      type: OutputFormatType.JsonSchema,
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    };

    const result = await run('Return a person', { transport, outputFormat });
    const addUserMessage = transport.sentMessages.find(
      (message) =>
        (message as Record<string, unknown>)['method'] ===
        DroidServerMethod.ADD_USER_MESSAGE
    ) as Record<string, unknown>;

    expect(
      (addUserMessage['params'] as Record<string, unknown>)['outputFormat']
    ).toEqual(outputFormat);
    expect(result.text).toEqual(JSON.stringify({ name: 'Ada' }));
    expect(result.structuredOutput).toEqual({ name: 'Ada' });
    expect(result.messages).toContainEqual({
      type: 'assistant',
      text: JSON.stringify({ name: 'Ada' }),
      message: expect.objectContaining({
        id: 'msg-structured',
        role: 'assistant',
      }),
    });
  });

  it('prefers backend structured output notifications', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransportSend(transport, ({ method, id }) => {
      if (method === DroidServerMethod.INITIALIZE_SESSION) {
        queueMicrotask(() => {
          transport.injectMessage(
            makeSuccessResponse(id, {
              sessionId: 'sess-run-structured-output-notification',
              session: {},
              settings: { modelId: 'test', reasoningEffort: 'medium' },
            })
          );
        });
      } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));
          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );
          transport.injectMessage(
            makeSessionNotification(SessionNotificationType.CREATE_MESSAGE, {
              message: {
                id: 'msg-structured',
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ name: 'text-fallback' }),
                  },
                ],
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            })
          );
          transport.injectMessage(
            makeSessionNotification(SessionNotificationType.STRUCTURED_OUTPUT, {
              messageId: 'msg-structured',
              structuredOutput: { name: 'Ada' },
              structuredOutputError: null,
            })
          );
          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      }
    });

    const result = await run('Return a person', {
      transport,
      outputFormat: {
        type: OutputFormatType.JsonSchema,
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
      },
    });

    expect(result.structuredOutput).toEqual({ name: 'Ada' });
    expect(result.structuredOutputError).toBeNull();
  });

  it('concatenates multiple text deltas', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();

    wireTransportSend(transport, ({ method, id }) => {
      if (method === DroidServerMethod.INITIALIZE_SESSION) {
        queueMicrotask(() => {
          transport.injectMessage(
            makeSuccessResponse(id, {
              sessionId: 'sess-run-concat',
              session: {},
              settings: { modelId: 'test', reasoningEffort: 'medium' },
            })
          );
        });
      } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));
          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.StreamingAssistantMessage }
            )
          );
          for (const textDelta of ['Hello ', 'beautiful ', 'world!']) {
            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.ASSISTANT_TEXT_DELTA,
                {
                  messageId: 'msg-1',
                  blockIndex: 0,
                  textDelta,
                }
              )
            );
          }
          transport.injectMessage(
            makeSessionNotification(
              SessionNotificationType.DROID_WORKING_STATE_CHANGED,
              { newState: DroidWorkingState.Idle }
            )
          );
        });
      }
    });

    const result = await run('Test', { transport });

    expect(result.text).toBe('Hello beautiful world!');
  });

  it('rejects when abortSignal is already aborted', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();
    setupRunResponder(transport, 'sess-run-pre-aborted');

    const controller = new AbortController();
    controller.abort(new Error('run aborted'));

    await expect(
      run('Should not send', { transport, abortSignal: controller.signal })
    ).rejects.toThrow();

    expect(
      transport.sentMessages.some(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.ADD_USER_MESSAGE
      )
    ).toBe(false);
    expect(transport.isConnected).toBe(false);
  });
});
