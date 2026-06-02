import { describe, expect, it } from 'vitest';

import {
  CliRequestOrNotificationSchema,
  RequestPermissionRequestParamsSchema,
} from '../src/protocol/cli.js';
import {
  ClientRequestSchema,
  InitializeSessionRequestParamsSchema,
} from '../src/protocol/client.js';
import {
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
} from '../src/protocol/constants.js';
import {
  CronCreateToolInputSchema,
  CronDeleteToolInputSchema,
  CronListToolInputSchema,
} from '../src/protocol/crons.js';
import { ManagedCustomModelSchema } from '../src/protocol/custom-models.js';
import {
  DroidClientMethod,
  DroidLoopStatus,
  DroidServerMethod,
  JsonRpcErrorCode,
  JsonRpcMessageType,
  MessageContentBlockType,
  MessageRole,
  ModelProvider,
  ReasoningEffort,
  SessionPlatform,
} from '../src/protocol/enums.js';
import { HostIdSchema } from '../src/protocol/host.js';
import {
  JsonRpcBaseRequestSchema,
  JsonRpcBaseResponseSuccessSchema,
  JsonRpcMessageSchema,
} from '../src/protocol/json-rpc.js';
import { LoopStateSchema } from '../src/protocol/loop.js';
import {
  ContentBlockSchema,
  FactoryDroidMessageSchema,
  ToolUseSchema,
} from '../src/protocol/messages.js';
import { MissionModelSettingsSchema } from '../src/protocol/model-settings.js';
import { SessionSourceSchema } from '../src/protocol/session-source.js';
import { SessionTagSchema, TokenUsageSchema } from '../src/protocol/session.js';

const envelope = {
  jsonrpc: JSONRPC_VERSION,
  factoryApiVersion: LEGACY_FACTORY_API_VERSION,
  factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
};

describe('protocol/json-rpc', () => {
  it('parses a valid JSON-RPC request envelope', () => {
    const message = {
      ...envelope,
      type: 'request',
      id: 'req-1',
      method: 'droid.initialize_session',
      params: { foo: 'bar' },
    };
    expect(JsonRpcBaseRequestSchema.parse(message)).toMatchObject({
      type: 'request',
      id: 'req-1',
      method: 'droid.initialize_session',
    });
    expect(JsonRpcMessageSchema.parse(message).type).toBe(
      JsonRpcMessageType.Request
    );
  });

  it('parses a valid JSON-RPC success response', () => {
    const message = {
      ...envelope,
      type: 'response',
      id: 'req-1',
      result: { ok: true },
    };
    expect(JsonRpcBaseResponseSuccessSchema.parse(message).id).toBe('req-1');
  });

  it('rejects an envelope missing the legacy api version', () => {
    const message = {
      jsonrpc: JSONRPC_VERSION,
      type: 'request',
      id: 'req-1',
      method: 'x',
    };
    expect(() => JsonRpcBaseRequestSchema.parse(message)).toThrow();
  });

  it('exposes the standard JSON-RPC error codes', () => {
    expect(JsonRpcErrorCode.INVALID_PARAMS).toBe(-32602);
  });
});

describe('protocol/messages', () => {
  it('parses a tool_use content block', () => {
    const block = {
      type: MessageContentBlockType.ToolUse,
      id: 'tool-1',
      input: { path: '/tmp/x' },
      name: 'Read',
    };
    expect(ToolUseSchema.parse(block).name).toBe('Read');
    expect(ContentBlockSchema.parse(block).type).toBe(
      MessageContentBlockType.ToolUse
    );
  });

  it('rejects a content block with an unknown type', () => {
    expect(() => ContentBlockSchema.parse({ type: 'nope', id: 'x' })).toThrow();
  });
});

describe('protocol/host + session + loop', () => {
  it('validates a host id as a uuid', () => {
    expect(() =>
      HostIdSchema.parse('123e4567-e89b-12d3-a456-426614174000')
    ).not.toThrow();
    expect(() => HostIdSchema.parse('not-a-uuid')).toThrow();
  });

  it('parses a session tag', () => {
    expect(SessionTagSchema.parse({ name: 'mission' }).name).toBe('mission');
    expect(() => SessionTagSchema.parse({ name: '' })).toThrow();
  });

  it('parses token usage', () => {
    const usage = TokenUsageSchema.parse({
      inputTokens: 1,
      outputTokens: 2,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      thinkingTokens: 0,
    });
    expect(usage.inputTokens).toBe(1);
  });

  it('parses a loop state', () => {
    const state = LoopStateSchema.parse({
      loopId: 'loop-1',
      status: DroidLoopStatus.Waiting,
      intervalMs: 5_000,
      iteration: 0,
      startedAt: 0,
      updatedAt: 0,
      nextRunAt: null,
      isDue: false,
    });
    expect(state.status).toBe(DroidLoopStatus.Waiting);
  });

  it('rejects a loop interval below the minimum', () => {
    expect(() =>
      LoopStateSchema.parse({
        loopId: 'loop-1',
        status: DroidLoopStatus.Waiting,
        intervalMs: 1,
        iteration: 0,
        startedAt: 0,
        updatedAt: 0,
        nextRunAt: null,
        isDue: false,
      })
    ).toThrow();
  });
});

describe('protocol TIER-2', () => {
  it('parses a FactoryDroidMessage with content blocks', () => {
    const message = FactoryDroidMessageSchema.parse({
      id: 'msg-1',
      role: MessageRole.Assistant,
      content: [{ type: MessageContentBlockType.Text, text: 'hello' }],
      createdAt: 1,
      updatedAt: 2,
    });
    expect(message.role).toBe(MessageRole.Assistant);
    expect(message.content).toHaveLength(1);
  });

  it('rejects a FactoryDroidMessage missing required fields', () => {
    expect(() =>
      FactoryDroidMessageSchema.parse({ id: 'msg-1', role: MessageRole.User })
    ).toThrow();
  });

  it('parses a discriminated SessionSource', () => {
    const source = SessionSourceSchema.parse({
      platform: SessionPlatform.Web,
      delegationSessionId: 'deleg-1',
    });
    expect(source.platform).toBe(SessionPlatform.Web);
  });

  it('rejects a SessionSource with an unknown platform', () => {
    expect(() => SessionSourceSchema.parse({ platform: 'nope' })).toThrow();
  });

  it('parses MissionModelSettings (all fields optional)', () => {
    expect(MissionModelSettingsSchema.parse({})).toEqual({});
    const settings = MissionModelSettingsSchema.parse({
      workerModel: 'gpt-x',
      workerReasoningEffort: ReasoningEffort.High,
      skipScrutiny: true,
    });
    expect(settings.workerReasoningEffort).toBe(ReasoningEffort.High);
  });
});

describe('protocol TIER-3', () => {
  it('parses InitializeSessionRequestParams with required fields', () => {
    const params = InitializeSessionRequestParamsSchema.parse({
      machineId: 'machine-1',
      cwd: '/tmp/project',
    });
    expect(params.machineId).toBe('machine-1');
  });

  it('parses an InitializeSession client request via the discriminated union', () => {
    const request = ClientRequestSchema.parse({
      ...envelope,
      type: 'request',
      id: 'req-1',
      method: DroidServerMethod.INITIALIZE_SESSION,
      params: { machineId: 'machine-1', cwd: '/tmp/project' },
    });
    expect(request.method).toBe(DroidServerMethod.INITIALIZE_SESSION);
  });

  it('parses a ManagedCustomModel with apiKey + baseUrl', () => {
    const model = ManagedCustomModelSchema.parse({
      model: 'gpt-x',
      provider: ModelProvider.ANTHROPIC,
      baseUrl: 'https://example.com',
      apiKey: 'secret',
    });
    expect(model.model).toBe('gpt-x');
  });

  it('rejects a ManagedCustomModel missing apiKey when not bedrock', () => {
    expect(() =>
      ManagedCustomModelSchema.parse({
        model: 'gpt-x',
        provider: ModelProvider.ANTHROPIC,
        baseUrl: 'https://example.com',
      })
    ).toThrow();
  });

  it('parses a RequestPermission CLI request via the envelope union', () => {
    const params = {
      toolUses: [],
      options: [],
    };
    expect(RequestPermissionRequestParamsSchema.parse(params).toolUses).toEqual(
      []
    );
    const message = {
      ...envelope,
      type: 'request',
      id: 'req-2',
      method: DroidClientMethod.REQUEST_PERMISSION,
      params,
    };
    expect(CliRequestOrNotificationSchema.parse(message).method).toBe(
      DroidClientMethod.REQUEST_PERMISSION
    );
  });
});

describe('protocol/crons (top-level tool inputs)', () => {
  it('exposes CronCreateToolInputSchema, CronDeleteToolInputSchema, CronListToolInputSchema', () => {
    expect(CronCreateToolInputSchema).toBeDefined();
    expect(CronDeleteToolInputSchema).toBeDefined();
    expect(CronListToolInputSchema).toBeDefined();
  });
});
