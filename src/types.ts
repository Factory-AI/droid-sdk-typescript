export type MessageCallback = (message: Record<string, unknown>) => void;

export type ErrorCallback = (error: Error) => void;

export interface DroidClientTransport {
  send(message: Record<string, unknown>): void;

  onMessage(callback: MessageCallback): void;

  onError(callback: ErrorCallback): void;

  close(): Promise<void>;

  readonly isConnected: boolean;

  connect?(): Promise<void>;
}

export interface ProcessTransportOptions {
  execPath?: string;

  execArgs?: string[];

  systemPrompt?: string;

  cwd?: string;

  env?: Record<string, string>;

  gracePeriod?: number;
}
