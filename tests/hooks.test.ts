import { describe, expect, it } from 'vitest';

import type { ToolHookInput } from '../src/hooks.js';
import { DroidHookOutputSchema } from '../src/schemas/hooks.js';

describe('hook types and schemas', () => {
  it('accepts minimal hookSpecificOutput without hookEventName', () => {
    const result = DroidHookOutputSchema.parse({
      hookSpecificOutput: {
        permissionDecision: 'deny',
      },
    });

    expect(result.hookSpecificOutput).toEqual({
      permissionDecision: 'deny',
    });
  });

  it('preserves hook output fields used by file hooks', () => {
    const result = DroidHookOutputSchema.parse({
      continue: false,
      stopReason: 'blocked',
      systemMessage: 'context',
      decision: 'block',
      reason: 'policy',
      hookSpecificOutput: {
        permissionDecision: 'deny',
        permissionDecisionReason: 'unsafe',
        additionalContext: 'extra',
        updatedInput: { command: 'npm test' },
      },
    });

    expect(result.hookSpecificOutput?.updatedInput).toEqual({
      command: 'npm test',
    });
  });

  it('exports hook input types for command hook authors', () => {
    const input: ToolHookInput = {
      hook_event_name: 'PreToolUse',
      session_id: 's1',
      transcript_path: '',
      cwd: '.',
      permission_mode: 'off',
      tool_name: 'Execute',
      tool_input: { command: 'npm test' },
    };

    expect(input.tool_name).toBe('Execute');
  });
});
