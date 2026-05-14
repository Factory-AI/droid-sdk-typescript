import { z } from 'zod';

export const DroidHookEventSchema = z.enum([
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
  'PreCompact',
  'SessionStart',
  'SessionEnd',
]);

export type DroidHookEvent = z.infer<typeof DroidHookEventSchema>;

export const SdkHookRegistrationSchema = z
  .object({
    eventName: DroidHookEventSchema,
    matcher: z.string().optional(),
    timeout: z.number().optional(),
  })
  .strict();

export type SdkHookRegistration = z.infer<typeof SdkHookRegistrationSchema>;

export const DroidHookSpecificOutputSchema = z
  .object({
    hookEventName: DroidHookEventSchema,
    permissionDecision: z.enum(['allow', 'deny', 'ask']).optional(),
    permissionDecisionReason: z.string().optional(),
    additionalContext: z.string().optional(),
    updatedInput: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const DroidHookOutputSchema = z
  .object({
    continue: z.boolean().optional(),
    stopReason: z.string().optional(),
    suppressOutput: z.boolean().optional(),
    systemMessage: z.string().optional(),
    decision: z.enum(['block', 'approve']).optional(),
    reason: z.string().optional(),
    hookSpecificOutput: DroidHookSpecificOutputSchema.optional(),
  })
  .passthrough();

export type DroidHookOutput = z.infer<typeof DroidHookOutputSchema>;

export const DroidHookExecutionResultSchema = DroidHookOutputSchema.extend({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
});

export type DroidHookExecutionResult = z.infer<
  typeof DroidHookExecutionResultSchema
>;

export const ExecuteHooksRequestParamsSchema = z
  .object({
    eventName: DroidHookEventSchema,
    input: z.record(z.unknown()),
    matcher: z.string().optional(),
    toolUseId: z.string().optional(),
  })
  .strict();

export type ExecuteHooksRequestParams = z.infer<
  typeof ExecuteHooksRequestParamsSchema
>;

export const ExecuteHooksResultSchema = z
  .object({
    results: z.array(DroidHookExecutionResultSchema),
  })
  .strict();

export type ExecuteHooksResult = z.infer<typeof ExecuteHooksResultSchema>;
