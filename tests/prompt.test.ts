import { describe, expect, it } from 'vitest';

import { prompt } from '../src/prompt.js';
import { DroidServerMethod, ReasoningEffort } from '../src/schemas/index.js';
import {
  InMemoryTransport,
  makeErrorResponse,
  makeSuccessResponse,
  sendDefaultStreamSequence,
  wireTransportSend,
} from './helpers.js';

function setupPromptResponder(
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
          deltas: ['Prompt ', 'result'],
          tokenUsageSessionId: sessionId,
        });
      });
    }
  });
}

describe('prompt()', () => {
  it('returns DroidResult from a one-shot prompt and closes the session', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();
    setupPromptResponder(transport, 'sess-prompt-success');

    const result = await prompt('Say hello', { transport });

    expect(result.text).toBe('Prompt result');
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.tokenUsage).not.toBeNull();
    expect(transport.isConnected).toBe(false);
  });

  it('passes session options and message attachments through', async () => {
    const transport = new InMemoryTransport();
    await transport.connect();
    setupPromptResponder(transport, 'sess-prompt-options');

    await prompt('Describe these inputs', {
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
              sessionId: 'sess-prompt-send-failure',
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

    await expect(prompt('This will fail', { transport })).rejects.toThrow(
      'send failed'
    );
    expect(transport.isConnected).toBe(false);
  });
});
