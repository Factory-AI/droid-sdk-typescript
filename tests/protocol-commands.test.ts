import { describe, expect, it } from 'vitest';

import {
  CustomCommandInfoSchema,
  ListCommandsRequestSchema,
  ListCommandsResponseSchema,
} from '../src/protocol/client.js';
import {
  DaemonListCommandsRequestSchema,
  DaemonListCommandsResultSchema,
} from '../src/protocol/daemon/commands.js';

const envelope = {
  jsonrpc: '2.0' as const,
  factoryApiVersion: '1.0.0',
};

describe('protocol/client commands schemas', () => {
  it('CustomCommandInfoSchema accepts minimal fields', () => {
    const info = CustomCommandInfoSchema.parse({
      name: 'plan',
      description: 'Plan a task',
    });
    expect(info.name).toBe('plan');
    expect(info.argumentHint).toBeUndefined();
    expect(info.isExecutable).toBeUndefined();
  });

  it('CustomCommandInfoSchema accepts the full form', () => {
    const info = CustomCommandInfoSchema.parse({
      name: 'plan',
      description: 'Plan a task',
      argumentHint: '<topic>',
      isExecutable: true,
    });
    expect(info.argumentHint).toBe('<topic>');
    expect(info.isExecutable).toBe(true);
  });

  it('ListCommandsRequestSchema parses with droid.list_commands method', () => {
    const req = ListCommandsRequestSchema.parse({
      ...envelope,
      type: 'request',
      id: 'req-1',
      method: 'droid.list_commands',
      params: {},
    });
    expect(req.method).toBe('droid.list_commands');
  });

  it('ListCommandsResponseSchema accepts the success branch', () => {
    const ok = ListCommandsResponseSchema.parse({
      ...envelope,
      type: 'response',
      id: 'req-1',
      result: { commands: [{ name: 'plan', description: 'Plan a task' }] },
    });
    if ('result' in ok) {
      const result = ok.result as { commands: unknown[] };
      expect(result.commands).toHaveLength(1);
    } else {
      throw new Error('expected success branch');
    }
  });

  it('ListCommandsResponseSchema accepts the failure branch', () => {
    const fail = ListCommandsResponseSchema.parse({
      ...envelope,
      type: 'response',
      id: 'req-1',
      error: { code: -32603, message: 'boom' },
    });
    if ('error' in fail) {
      expect(fail.error?.message).toBe('boom');
    } else {
      throw new Error('expected failure branch');
    }
  });
});

describe('protocol/daemon commands schemas', () => {
  it('DaemonListCommandsRequestSchema parses with daemon.list_commands method', () => {
    const req = DaemonListCommandsRequestSchema.parse({
      ...envelope,
      type: 'request',
      id: 'req-1',
      method: 'daemon.list_commands',
      params: { sessionId: 'sess-1' },
    });
    expect(req.method).toBe('daemon.list_commands');
    expect(req.params.sessionId).toBe('sess-1');
  });

  it('DaemonListCommandsResultSchema round-trips a commands array', () => {
    const result = DaemonListCommandsResultSchema.parse({
      commands: [
        { name: 'plan', description: 'Plan' },
        {
          name: 'review',
          description: 'Review',
          argumentHint: '<pr>',
          isExecutable: false,
        },
      ],
    });
    expect(result.commands).toHaveLength(2);
    expect(result.commands[1]?.argumentHint).toBe('<pr>');
  });
});
