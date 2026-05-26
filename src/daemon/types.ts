import type {
  ClientAskUserHandler,
  ClientPermissionHandler,
} from '../client.js';
import type { DroidMcpServerConfig } from '../mcp.js';
import type { OutputFormat, SessionTag } from '../schemas/client.js';
import type {
  AutonomyLevel,
  DroidInteractionMode,
  ReasoningEffort,
} from '../schemas/enums.js';
import type { Base64ImageSource, DocumentSource } from '../schemas/messages.js';
import type { ToolSelectionOverrides } from '../schemas/shared.js';

export enum MachineType {
  Local = 'local',
  Ephemeral = 'ephemeral',
  Computer = 'computer',
}

export type SDKMachineConfig =
  | { type: MachineType.Local }
  | { type: MachineType.Ephemeral; sandboxId: string; workspaceId: string }
  | { type: MachineType.Computer; computerId: string };

export interface ConnectDaemonOptions {
  /** Machine to connect to. Defaults to local daemon if omitted. */
  machine?: SDKMachineConfig;

  /** Direct WebSocket URL. Overrides machine-based URL resolution. */
  url?: string;

  /** Factory API key for authentication. */
  apiKey?: string;

  /** WorkOS JWT access token for authentication. */
  token?: string;

  /** Connection retry budget for the connect+authenticate cycle. */
  maxRetries?: number;

  /** Daemon WebSocket port for ephemeral sandboxes. Default: 37643. */
  daemonPort?: number;

  /** Factory relay base URL for computer connections. Default: wss://relay.factory.ai */
  relayBaseUrl?: string;
}

export interface DaemonSessionOptions extends ToolSelectionOverrides {
  cwd?: string;
  modelId?: string;
  autonomyLevel?: AutonomyLevel;
  interactionMode?: DroidInteractionMode;
  reasoningEffort?: ReasoningEffort;
  specModeModelId?: string;
  specModeReasoningEffort?: ReasoningEffort;
  mcpServers?: DroidMcpServerConfig[];
  tags?: SessionTag[];

  /** Permission handler for tool confirmations. */
  permissionHandler?: ClientPermissionHandler;

  /** Handler for ask-user requests from the agent. */
  askUserHandler?: ClientAskUserHandler;

  /** Title for the session. */
  title?: string;

  /** Where this session was created from. Used for attribution. */
  sessionSource?: Record<string, unknown>;
}

export interface DaemonResumeOptions {
  /** Permission handler for tool confirmations. */
  permissionHandler?: ClientPermissionHandler;

  /** Handler for ask-user requests from the agent. */
  askUserHandler?: ClientAskUserHandler;

  /** MCP servers to attach to the resumed session. */
  mcpServers?: DroidMcpServerConfig[];
}

export interface SendOptions {
  /** Base64-encoded image attachments. */
  images?: Base64ImageSource[];

  /** Document/file attachments. */
  files?: DocumentSource[];

  /** Structured output request. */
  outputFormat?: OutputFormat;
}

export interface WebSocketTransportOptions {
  /** Max connection retries. Default: 5. */
  maxConnectRetries?: number;

  /** Initial retry delay in ms. Default: 500. */
  initialRetryDelayMs?: number;

  /** Max retry delay in ms. Default: 5000. */
  maxRetryDelayMs?: number;

  /** Connection timeout in ms. Default: 5000. */
  connectionTimeoutMs?: number;
}

/** Default daemon WebSocket port (production). */
export const DEFAULT_DAEMON_PORT = 37643;

/** Default daemon WebSocket port (development). */
export const DEFAULT_DEV_DAEMON_PORT = 41723;

/** Default Factory relay base URL. */
export const DEFAULT_RELAY_BASE_URL = 'wss://relay.factory.ai';

/** Default WebSocket connection config. */
export const DEFAULT_WS_CONFIG: Required<WebSocketTransportOptions> = {
  maxConnectRetries: 5,
  initialRetryDelayMs: 500,
  maxRetryDelayMs: 5000,
  connectionTimeoutMs: 5000,
};

/** WebSocket config overrides for computer connections (longer timeouts). */
export const COMPUTER_WS_CONFIG: Partial<WebSocketTransportOptions> = {
  connectionTimeoutMs: 45_000,
  maxConnectRetries: 10,
  initialRetryDelayMs: 2_000,
  maxRetryDelayMs: 10_000,
};
