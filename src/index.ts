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
  DroidMessageType,
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

export { run } from './run.js';
export type { RunOptions } from './run.js';

export { createSdkMcpServer, tool, SdkMcpServer } from './mcp.js';
export type {
  DroidMcpServerConfig,
  DroidTool,
  DroidToolResult,
  SdkMcpServerOptions,
} from './mcp.js';

export { createSession, resumeSession, DroidSession } from './session.js';
export type {
  CreateSessionOptions,
  ResumeSessionOptions,
  MessageOptions,
  DroidResult,
} from './session.js';

export { listSessions } from './session-discovery.js';
