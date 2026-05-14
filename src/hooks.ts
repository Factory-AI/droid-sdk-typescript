import type {
  DroidHookEvent,
  DroidHookExecutionResult,
  DroidHookOutput,
  ExecuteHooksRequestParams,
  ExecuteHooksResult,
  SdkHookRegistration,
} from './schemas/hooks.js';

export type { DroidHookEvent, DroidHookOutput } from './schemas/hooks.js';

export type DroidPermissionMode =
  | 'off'
  | 'spec'
  | 'auto-low'
  | 'auto-medium'
  | 'auto-high';

export interface BaseDroidHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: DroidPermissionMode;
  hook_event_name: DroidHookEvent;
  message_id?: string;
  [key: string]: unknown;
}

export interface ToolHookInput extends BaseDroidHookInput {
  hook_event_name: 'PreToolUse' | 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: unknown;
}

export interface UserPromptSubmitHookInput extends BaseDroidHookInput {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
  has_images?: boolean;
}

export interface NotificationHookInput extends BaseDroidHookInput {
  hook_event_name: 'Notification';
  message: string;
  notification_type:
    | 'permission_prompt'
    | 'idle_prompt'
    | 'auth_success'
    | 'elicitation_dialog';
}

export interface StopHookInput extends BaseDroidHookInput {
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
  tool_execution_count?: number;
  elapsed_time?: number;
}

export interface SubagentStopHookInput extends BaseDroidHookInput {
  hook_event_name: 'SubagentStop';
  task_name: string;
  task_result?: string;
  task_error?: string;
  stop_hook_active: boolean;
}

export interface PreCompactHookInput extends BaseDroidHookInput {
  hook_event_name: 'PreCompact';
  trigger: 'manual' | 'auto';
  custom_instructions?: string;
  message_count: number;
  estimated_tokens: number;
}

export interface SessionStartHookInput extends BaseDroidHookInput {
  hook_event_name: 'SessionStart';
  source: 'startup' | 'resume' | 'clear' | 'compact';
  previous_session_id?: string;
  calling_session_id?: string;
}

export interface SessionEndHookInput extends BaseDroidHookInput {
  hook_event_name: 'SessionEnd';
  reason: 'clear' | 'logout' | 'prompt_input_exit' | 'other';
  session_duration_ms: number;
  message_count: number;
}

export type DroidHookInput =
  | ToolHookInput
  | UserPromptSubmitHookInput
  | NotificationHookInput
  | StopHookInput
  | SubagentStopHookInput
  | PreCompactHookInput
  | SessionStartHookInput
  | SessionEndHookInput
  | BaseDroidHookInput;

export type DroidHookCallback = (
  input: DroidHookInput,
  toolUseId: string | undefined,
  context: { signal: AbortSignal }
) => DroidHookOutput | Promise<DroidHookOutput>;

export interface DroidHookMatcher {
  matcher?: string;
  timeout?: number;
  hooks: DroidHookCallback[];
}

export type DroidHooks = Partial<Record<DroidHookEvent, DroidHookMatcher[]>>;

export type HookRequestHandler = (
  params: ExecuteHooksRequestParams
) => Promise<ExecuteHooksResult> | ExecuteHooksResult;

const DEFAULT_HOOK_TIMEOUT_SECONDS = 60;
const DROID_HOOK_EVENTS: DroidHookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
  'PreCompact',
  'SessionStart',
  'SessionEnd',
];

export function buildSdkHookRegistrations(
  hooks: DroidHooks | undefined
): SdkHookRegistration[] | undefined {
  if (!hooks) return undefined;

  const registrations: SdkHookRegistration[] = [];
  for (const eventName of DROID_HOOK_EVENTS) {
    const matchers = hooks[eventName];
    for (const matcher of matchers ?? []) {
      if (matcher.hooks.length === 0) continue;
      registrations.push({
        eventName,
        ...(matcher.matcher !== undefined && { matcher: matcher.matcher }),
        ...(matcher.timeout !== undefined && { timeout: matcher.timeout }),
      });
    }
  }

  return registrations.length > 0 ? registrations : undefined;
}

export function createHookRequestHandler(
  hooks: DroidHooks
): HookRequestHandler {
  return async ({ eventName, input, matcher, toolUseId }) => {
    const groups = hooks[eventName] ?? [];
    const matchingGroups = groups.filter((group) =>
      matchesHookMatcher(group.matcher, matcher)
    );

    const results = await Promise.all(
      matchingGroups.flatMap((group) =>
        group.hooks.map((hook) =>
          executeCallbackWithTimeout(
            hook,
            toDroidHookInput(input, eventName),
            toolUseId,
            group.timeout
          )
        )
      )
    );

    return { results };
  };
}

export function matchesHookMatcher(
  configuredMatcher: string | undefined,
  actualMatcher: string | undefined
): boolean {
  if (
    configuredMatcher === undefined ||
    configuredMatcher === '' ||
    configuredMatcher === '*' ||
    actualMatcher === undefined
  ) {
    return true;
  }

  if (configuredMatcher === actualMatcher) {
    return true;
  }

  try {
    return new RegExp(configuredMatcher).test(actualMatcher);
  } catch {
    return false;
  }
}

function toDroidHookInput(
  input: Record<string, unknown>,
  eventName: DroidHookEvent
): DroidHookInput {
  return {
    ...input,
    session_id:
      typeof input.session_id === 'string' ? input.session_id : 'unknown',
    transcript_path:
      typeof input.transcript_path === 'string' ? input.transcript_path : '',
    cwd: typeof input.cwd === 'string' ? input.cwd : '',
    permission_mode: toPermissionMode(input.permission_mode),
    hook_event_name: eventName,
    ...(typeof input.message_id === 'string' && {
      message_id: input.message_id,
    }),
  };
}

function toPermissionMode(value: unknown): DroidPermissionMode {
  switch (value) {
    case 'spec':
    case 'auto-low':
    case 'auto-medium':
    case 'auto-high':
      return value;
    default:
      return 'off';
  }
}

async function executeCallbackWithTimeout(
  hook: DroidHookCallback,
  input: DroidHookInput,
  toolUseId: string | undefined,
  timeoutSeconds = DEFAULT_HOOK_TIMEOUT_SECONDS
): Promise<DroidHookExecutionResult> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<DroidHookExecutionResult>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve({
          exitCode: 1,
          stdout: '',
          stderr: `Hook callback timed out after ${timeoutSeconds} seconds`,
        });
      }, timeoutSeconds * 1000);
    });

    const callbackPromise = (async () =>
      hook(input, toolUseId, {
        signal: controller.signal,
      }))().then(
      (output): DroidHookExecutionResult => ({
        exitCode: 0,
        stdout: '',
        stderr: '',
        ...(output ?? {}),
      }),
      (error): DroidHookExecutionResult => ({
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
      })
    );

    return await Promise.race([callbackPromise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
