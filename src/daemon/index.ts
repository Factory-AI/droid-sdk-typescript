export { DaemonClient } from './client.js';
export type { DaemonClientOptions } from './client.js';
export {
  connectDaemon,
  DaemonConnection,
  resolveWebSocketUrl,
} from './connection.js';
export { ensureLocalDaemon } from './local.js';
export { DaemonSession } from './session.js';
export { WebSocketTransport } from './transport.js';
export {
  MachineType,
  DEFAULT_DAEMON_PORT,
  DEFAULT_RELAY_BASE_URL,
} from './types.js';
export type {
  ConnectDaemonOptions,
  SDKMachineConfig,
  DaemonSessionOptions,
  DaemonResumeOptions,
  SendOptions,
  WebSocketTransportOptions,
} from './types.js';
