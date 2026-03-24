// @factory/droid-sdk - TypeScript SDK for the Factory Droid CLI
// This is the public API barrel file.

// --- Schemas (enums, constants, Zod schemas, types) ---
export * from "./schemas/index.js";

// --- Errors ---
export * from "./errors.js";

// --- Transport types ---
export * from "./types.js";
export { ProcessTransport } from "./transport.js";

// --- Protocol engine ---
export { ProtocolEngine } from "./protocol.js";
export type {
  AskUserHandler,
  NotificationCallback,
  NotificationFilter,
  PermissionHandler,
} from "./protocol.js";

// --- Client ---
export { DroidClient } from "./client.js";
export type {
  ClientAskUserHandler,
  ClientPermissionHandler,
  DroidClientOptions,
} from "./client.js";

// --- Stream message types and converter ---
export {
  convertNotificationToStreamMessage,
  StreamStateTracker,
} from "./stream.js";
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
} from "./stream.js";

// --- High-level API: query ---
export { query } from "./query.js";
export type { QueryOptions, DroidQuery } from "./query.js";

// --- High-level API: session ---
export { createSession, resumeSession, DroidSession } from "./session.js";
export type {
  CreateSessionOptions,
  ResumeSessionOptions,
  MessageOptions,
  DroidResult,
} from "./session.js";
