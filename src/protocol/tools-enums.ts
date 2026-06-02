/**
 * The execution location for an tool:
 * - Client: The tool is executed in the UI context (e.g. change the page).
 * - Server: The tool is executed server-side (e.g. a code search).
 * - Both: The tool can be executed in either environment depending on runtime logic.
 */
export enum ToolExecutionLocation {
  Client = 'client',
  Server = 'server',
  Both = 'both',
}

/**
 * Common status values for tool execution.
 * Used for tracking the progress and final outcome of an tool's execution.
 */
export enum ToolStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
}
export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}
