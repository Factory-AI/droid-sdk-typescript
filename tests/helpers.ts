import {
  DroidClientMethod,
  DroidWorkingState,
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
  SessionNotificationType,
  ToolConfirmationOutcome,
} from '../src/schemas/index.js';
import type { DroidSession } from '../src/session.js';
import type { DroidMessage, DroidResultMessage } from '../src/stream.js';
import type {
  DroidClientTransport,
  ErrorCallback,
  MessageCallback,
} from '../src/types.js';

export type JsonRpcTestMessage = Record<string, unknown>;

export async function collectStreamText(
  session: DroidSession,
  prompt: string
): Promise<{ text: string; messages: DroidMessage[] }> {
  const messages: DroidMessage[] = [];
  let text = '';
  for await (const msg of session.stream(prompt)) {
    messages.push(msg);
    if (msg.type === 'assistant') {
      text += msg.text;
    } else if (msg.type === 'result' && text.length === 0) {
      text = msg.result;
    }
  }

  return {
    text,
    messages,
  };
}

export function findLastResult(
  messages: DroidMessage[]
): DroidResultMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const msg = messages[index];
    if (msg?.type === 'result') {
      return msg;
    }
  }

  return undefined;
}

export type TransportSendHandlerContext = {
  message: JsonRpcTestMessage;
  method: string;
  id: string;
  params: Record<string, unknown>;
};

export class InMemoryTransport implements DroidClientTransport {
  /** All messages passed to `send()`, in order. */
  readonly sentMessages: JsonRpcTestMessage[] = [];

  private messageHandler: MessageCallback | null = null;
  private errorHandler: ErrorCallback | null = null;
  private _isConnected = false;

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<void> {
    this._isConnected = true;
  }

  send(message: JsonRpcTestMessage): void {
    if (!this._isConnected) {
      throw new Error('InMemoryTransport is not connected');
    }
    this.sentMessages.push(message);
  }

  onMessage(callback: MessageCallback): void {
    this.messageHandler = callback;
  }

  onError(callback: ErrorCallback): void {
    this.errorHandler = callback;
  }

  async close(): Promise<void> {
    this._isConnected = false;
  }

  /**
   * Inject a message as if it were received from the droid process.
   * Fires the registered `onMessage` handler.
   */
  injectMessage(message: JsonRpcTestMessage): void {
    if (this.messageHandler) {
      this.messageHandler(message);
    }
  }

  /**
   * Inject an error as if the transport encountered a fault.
   * Fires the registered `onError` handler.
   */
  injectError(error: Error): void {
    if (this.errorHandler) {
      this.errorHandler(error);
    }
  }
}

export function makeSuccessResponse(
  id: string,
  result: JsonRpcTestMessage = {}
): JsonRpcTestMessage {
  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: 'response',
    id,
    result,
  };
}

export function makeErrorResponse(
  id: string | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcTestMessage {
  const error: JsonRpcTestMessage = { code, message };
  if (data !== undefined) {
    error['data'] = data;
  }

  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: 'response',
    id,
    error,
  };
}

export function makeNotification(
  method: string,
  params: Record<string, unknown> = {}
): JsonRpcTestMessage {
  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: 'notification',
    method,
    params,
  };
}

export function makeSessionNotification(
  notificationType: string,
  payload: Record<string, unknown> = {}
): JsonRpcTestMessage {
  return makeNotification(DroidClientMethod.SESSION_NOTIFICATION, {
    notification: {
      type: notificationType,
      ...payload,
    },
  });
}

export function makeServerRequest(
  id: string,
  method: string,
  params: Record<string, unknown> = {}
): JsonRpcTestMessage {
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

export function makePermissionRequestParams(options: {
  toolUseId: string;
  toolName: string;
  confirmationType: 'exec' | 'edit';
  input?: Record<string, unknown>;
  details: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    toolUses: [
      {
        toolUse: {
          type: 'tool_use',
          id: options.toolUseId,
          name: options.toolName,
          input: options.input ?? {},
        },
        confirmationType: options.confirmationType,
        details: options.details,
      },
    ],
    options: [
      {
        label: 'Proceed once',
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: 'Cancel',
        value: ToolConfirmationOutcome.Cancel,
      },
    ],
  };
}

export function getLastSentId(transport: InMemoryTransport): string {
  const lastMessage = transport.sentMessages[
    transport.sentMessages.length - 1
  ] as JsonRpcTestMessage;
  return lastMessage['id'] as string;
}

export function wireTransportSend(
  transport: InMemoryTransport,
  handler: (context: TransportSendHandlerContext) => void
): void {
  const originalSend = transport.send.bind(transport);
  transport.send = (message: JsonRpcTestMessage) => {
    originalSend(message);

    const method = String(message['method'] ?? '');
    const id = String(message['id'] ?? '');
    const params = (message['params'] as Record<string, unknown>) ?? {};

    handler({ message, method, id, params });
  };
}

export function sendDefaultStreamSequence(
  transport: InMemoryTransport,
  options?: {
    deltas?: string[];
    messageId?: string;
    tokenUsageSessionId?: string;
    tokenUsage?: Record<string, unknown>;
    initialState?: DroidWorkingState;
    finalState?: DroidWorkingState;
    includeTokenUsage?: boolean;
    structuredOutput?: Record<string, unknown> | null;
    structuredOutputError?: Record<string, unknown> | null;
    structuredOutputMessageId?: string;
  }
): void {
  const {
    deltas = ['Hello', ' world'],
    messageId = 'msg-1',
    tokenUsageSessionId = 'default',
    tokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 10,
      thinkingTokens: 5,
    },
    initialState = DroidWorkingState.StreamingAssistantMessage,
    finalState = DroidWorkingState.Idle,
    includeTokenUsage = true,
    structuredOutput,
    structuredOutputError,
    structuredOutputMessageId = messageId,
  } = options ?? {};

  transport.injectMessage(
    makeSessionNotification(
      SessionNotificationType.DROID_WORKING_STATE_CHANGED,
      { newState: initialState, messageId }
    )
  );

  for (const textDelta of deltas) {
    transport.injectMessage(
      makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
        messageId,
        blockIndex: 0,
        textDelta,
      })
    );
  }

  if (deltas.length > 0) {
    transport.injectMessage(
      makeSessionNotification(SessionNotificationType.CREATE_MESSAGE, {
        message: {
          id: messageId,
          role: 'assistant',
          createdAt: 1000,
          updatedAt: 1000,
          content: [{ type: 'text', text: deltas.join('') }],
        },
      })
    );
  }

  if (includeTokenUsage) {
    transport.injectMessage(
      makeSessionNotification(
        SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED,
        {
          sessionId: tokenUsageSessionId,
          tokenUsage,
        }
      )
    );
  }

  if (structuredOutput !== undefined || structuredOutputError !== undefined) {
    transport.injectMessage(
      makeSessionNotification(SessionNotificationType.STRUCTURED_OUTPUT, {
        messageId: structuredOutputMessageId,
        structuredOutput: structuredOutput ?? null,
        structuredOutputError: structuredOutputError ?? null,
      })
    );
  }

  transport.injectMessage(
    makeSessionNotification(
      SessionNotificationType.DROID_WORKING_STATE_CHANGED,
      { newState: finalState, messageId }
    )
  );
}
