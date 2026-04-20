export * from './schemas/index.js';

export { SDK_TAG, SDK_VERSION } from './constants.js';

export * from './errors.js';

export * from './types.js';
export { ProcessTransport } from './transport.js';

export { ProtocolEngine } from './protocol.js';
export type {
  AskUserHandler,
  NotificationCallback,
  NotificationFilter,
  PermissionHandler,
} from './protocol.js';

export { DroidClient } from './client.js';
export type {
  ClientAskUserHandler,
  ClientPermissionHandler,
  DroidClientOptions,
} from './client.js';

export {
  convertNotificationToStreamMessage,
  StreamStateTracker,
} from './stream.js';
export type {
  AssistantTextDelta,
  ThinkingTextDelta,
  ToolUse,
  ToolResult,
  ToolProgress,
  WorkingStateChanged,
  TokenUsageUpdate,
  ContextStatsChanged,
  CreateMessage,
  PermissionResolved,
  SettingsUpdated,
  SessionTitleUpdated,
  McpStatusChanged,
  MissionStateChanged,
  MissionFeaturesChanged,
  MissionProgressEntry,
  MissionHeartbeat,
  MissionWorkerStarted,
  MissionWorkerCompleted,
  McpAuthRequired,
  McpAuthCompleted,
  ErrorEvent,
  TurnComplete,
  DroidMessage,
} from './stream.js';

export { query } from './query.js';
export type { QueryOptions, DroidQuery } from './query.js';

export { createSession, resumeSession, DroidSession } from './session.js';
export type {
  CreateSessionOptions,
  ResumeSessionOptions,
  MessageOptions,
  DroidResult,
} from './session.js';

export { listSessions } from './session-discovery.js';
