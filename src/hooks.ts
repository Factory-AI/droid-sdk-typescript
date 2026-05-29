import type { DroidHookEvent } from './schemas/hooks.js';

// eslint-disable-next-line no-barrel-files/no-barrel-files
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
