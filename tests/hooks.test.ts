import { describe, expect, it, vi } from 'vitest';

import {
  buildSdkHookRegistrations,
  createHookRequestHandler,
  matchesHookMatcher,
  type DroidHooks,
  type DroidHookOutput,
} from '../src/hooks.js';
import { ExecuteHooksResultSchema } from '../src/schemas/hooks.js';

describe('SDK hooks', () => {
  it('builds serializable hook registrations without callbacks', () => {
    const hooks: DroidHooks = {
      PreToolUse: [
        {
          matcher: 'Execute',
          timeout: 30,
          hooks: [() => ({})],
        },
      ],
      Stop: [
        {
          hooks: [() => ({})],
        },
      ],
    };

    expect(buildSdkHookRegistrations(hooks)).toEqual([
      { eventName: 'PreToolUse', matcher: 'Execute', timeout: 30 },
      { eventName: 'Stop' },
    ]);
  });

  it('matches Droid CLI hook matcher semantics', () => {
    expect(matchesHookMatcher(undefined, 'Execute')).toBe(true);
    expect(matchesHookMatcher('', 'Execute')).toBe(true);
    expect(matchesHookMatcher('*', 'Execute')).toBe(true);
    expect(matchesHookMatcher('Execute', 'Execute')).toBe(true);
    expect(matchesHookMatcher('Edit|Create', 'Create')).toBe(true);
    expect(matchesHookMatcher('Read', 'Execute')).toBe(false);
    expect(matchesHookMatcher('[', 'Execute')).toBe(false);
  });

  it('runs matching hook callbacks and converts output to execution results', async () => {
    const callback = vi.fn(() => ({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse' as const,
        permissionDecision: 'deny' as const,
        permissionDecisionReason: 'blocked',
      },
    }));
    const handler = createHookRequestHandler({
      PreToolUse: [{ matcher: 'Execute', hooks: [callback] }],
    });

    const result = await handler({
      eventName: 'PreToolUse',
      matcher: 'Execute',
      toolUseId: 'tool-1',
      input: {
        hook_event_name: 'PreToolUse',
        session_id: 's1',
        transcript_path: '',
        cwd: '.',
        permission_mode: 'off',
        tool_name: 'Execute',
        tool_input: { command: 'npm test' },
      },
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ tool_name: 'Execute' }),
      'tool-1',
      { signal: expect.any(AbortSignal) }
    );
    expect(result.results).toEqual([
      {
        exitCode: 0,
        stdout: '',
        stderr: '',
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'blocked',
        },
      },
    ]);
  });

  it('accepts minimal hookSpecificOutput without hookEventName', async () => {
    const handler = createHookRequestHandler({
      PreToolUse: [
        {
          matcher: 'Execute',
          hooks: [
            () => ({
              hookSpecificOutput: {
                permissionDecision: 'deny' as const,
              },
            }),
          ],
        },
      ],
    });

    const result = await handler({
      eventName: 'PreToolUse',
      matcher: 'Execute',
      input: {
        hook_event_name: 'PreToolUse',
        session_id: 's1',
        transcript_path: '',
        cwd: '.',
        permission_mode: 'off',
        tool_name: 'Execute',
        tool_input: { command: 'npm test' },
      },
    });

    expect(() => ExecuteHooksResultSchema.parse(result)).not.toThrow();
    expect(result.results[0]?.hookSpecificOutput).toEqual({
      permissionDecision: 'deny',
    });
  });

  it('converts thrown callback errors to non-throwing hook failures', async () => {
    const handler = createHookRequestHandler({
      Stop: [
        {
          hooks: [
            () => {
              throw new Error('boom');
            },
          ],
        },
      ],
    });

    const result = await handler({
      eventName: 'Stop',
      input: {
        hook_event_name: 'Stop',
        session_id: 's1',
        transcript_path: '',
        cwd: '.',
        permission_mode: 'off',
        stop_hook_active: false,
      },
    });

    expect(result.results).toEqual([
      { exitCode: 1, stdout: '', stderr: 'boom' },
    ]);
  });

  it('aborts callbacks after the configured timeout', async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const callback = vi.fn(
        (_input, _toolUseId, { signal }: { signal: AbortSignal }) =>
          new Promise<DroidHookOutput>(() => {
            signal.addEventListener('abort', () => {
              aborted = true;
            });
          })
      );
      const handler = createHookRequestHandler({
        PreCompact: [{ timeout: 0.01, hooks: [callback] }],
      });

      const promise = handler({
        eventName: 'PreCompact',
        input: {
          hook_event_name: 'PreCompact',
          session_id: 's1',
          transcript_path: '',
          cwd: '.',
          permission_mode: 'off',
          trigger: 'manual',
          message_count: 1,
          estimated_tokens: 1,
        },
      });

      await vi.advanceTimersByTimeAsync(10);

      expect(aborted).toBe(true);
      expect(await promise).toEqual({
        results: [
          {
            exitCode: 1,
            stdout: '',
            stderr: 'Hook callback timed out after 0.01 seconds',
          },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
