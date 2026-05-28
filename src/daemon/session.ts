import { ConnectionError } from '../errors.js';
import { streamFromClient } from '../helpers.js';
import type { MessageBridge, MessageOptions } from '../helpers.js';
import type { NotificationCallback, NotificationFilter } from '../protocol.js';
import type {
  AddMcpServerRequestParams,
  AddMcpServerResult,
  AuthenticateMcpServerRequestParams,
  AuthenticateMcpServerResult,
  CompactSessionRequestParams,
  CompactSessionResult,
  ExecuteRewindRequestParams,
  ExecuteRewindResult,
  ContextBreakdownResult,
  ForkSessionResult,
  GetRewindInfoRequestParams,
  GetRewindInfoResult,
  ListMcpServersResult,
  ListMcpToolsResult,
  ListSkillsResult,
  RemoveMcpServerRequestParams,
  RemoveMcpServerResult,
  RenameSessionRequestParams,
  RenameSessionResult,
  ToggleMcpServerRequestParams,
  ToggleMcpServerResult,
  UpdateSessionSettingsRequestParams,
  UpdateSessionSettingsResult,
} from '../schemas/client.js';
import { DroidInteractionMode } from '../schemas/enums.js';
import type { DroidStreamEvent, DroidStreamMessage } from '../stream.js';
import type { DaemonClient } from './client.js';
import type { SendOptions } from './types.js';

export class DaemonSession {
  private _client: DaemonClient;
  private _sessionId: string;
  private _closed = false;
  private readonly _activeBridges = new Set<MessageBridge>();
  private readonly _cleanupCallbacks: Array<() => Promise<void> | void> = [];

  /** @internal */
  constructor(client: DaemonClient, sessionId: string) {
    this._client = client;
    this._sessionId = sessionId;
  }

  /** @internal */
  addCleanup(cleanup: () => Promise<void> | void): void {
    this._cleanupCallbacks.push(cleanup);
  }

  get sessionId(): string {
    return this._sessionId;
  }

  stream(
    prompt: string,
    options?: MessageOptions & { includePartialMessages?: false }
  ): AsyncGenerator<DroidStreamMessage, void, undefined>;
  stream(
    prompt: string,
    options: MessageOptions & { includePartialMessages: true }
  ): AsyncGenerator<DroidStreamEvent, void, undefined>;
  async *stream(
    prompt: string,
    options?: MessageOptions
  ): AsyncGenerator<DroidStreamEvent, void, undefined> {
    this._ensureNotClosed();
    yield* streamFromClient(
      this._client,
      this._sessionId,
      this._activeBridges,
      prompt,
      options
    );
  }

  async send(prompt: string, options?: SendOptions): Promise<void> {
    this._ensureNotClosed();

    await this._client.addUserMessage({
      text: prompt,
      images: options?.images,
      files: options?.files,
      outputFormat: options?.outputFormat,
    });
  }

  async interrupt(): Promise<void> {
    this._ensureNotClosed();
    await this._client.interruptSession();
  }

  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;

    for (const bridge of this._activeBridges) {
      bridge.signalDone();
    }

    try {
      await this._client.closeSession({ reason: 'other' }).catch(() => {});
    } finally {
      await this._client.close();
      for (const cleanup of this._cleanupCallbacks) {
        try {
          await cleanup();
        } catch {
          // Best-effort cleanup
        }
      }
      this._cleanupCallbacks.length = 0;
    }
  }

  async updateSettings(
    params: Partial<UpdateSessionSettingsRequestParams>
  ): Promise<UpdateSessionSettingsResult> {
    this._ensureNotClosed();
    return this._client.updateSessionSettings(params);
  }

  async enterSpecMode(
    params: Pick<
      UpdateSessionSettingsRequestParams,
      'specModeModelId' | 'specModeReasoningEffort'
    > = {}
  ): Promise<UpdateSessionSettingsResult> {
    this._ensureNotClosed();
    return this._client.updateSessionSettings({
      interactionMode: DroidInteractionMode.Spec,
      ...params,
    });
  }

  async compactSession(
    params?: CompactSessionRequestParams
  ): Promise<CompactSessionResult> {
    this._ensureNotClosed();
    return this._client.compactSession(params ?? {});
  }

  async forkSession(): Promise<ForkSessionResult> {
    this._ensureNotClosed();
    return this._client.forkSession();
  }

  async getContextBreakdown(): Promise<ContextBreakdownResult> {
    this._ensureNotClosed();
    return this._client.getContextBreakdown();
  }

  async renameSession(
    params: RenameSessionRequestParams
  ): Promise<RenameSessionResult> {
    this._ensureNotClosed();
    return this._client.renameSession(params);
  }

  async getRewindInfo(
    params: GetRewindInfoRequestParams
  ): Promise<GetRewindInfoResult> {
    this._ensureNotClosed();
    return this._client.getRewindInfo(params);
  }

  async executeRewind(
    params: ExecuteRewindRequestParams
  ): Promise<ExecuteRewindResult> {
    this._ensureNotClosed();
    return this._client.executeRewind(params);
  }

  async addMcpServer(
    params: AddMcpServerRequestParams
  ): Promise<AddMcpServerResult> {
    this._ensureNotClosed();
    return this._client.addMcpServer(params);
  }

  async removeMcpServer(
    params: RemoveMcpServerRequestParams
  ): Promise<RemoveMcpServerResult> {
    this._ensureNotClosed();
    return this._client.removeMcpServer(params);
  }

  async toggleMcpServer(
    params: ToggleMcpServerRequestParams
  ): Promise<ToggleMcpServerResult> {
    this._ensureNotClosed();
    return this._client.toggleMcpServer(params);
  }

  async listMcpServers(): Promise<ListMcpServersResult> {
    this._ensureNotClosed();
    return this._client.listMcpServers();
  }

  async listMcpTools(): Promise<ListMcpToolsResult> {
    this._ensureNotClosed();
    return this._client.listMcpTools();
  }

  async authenticateMcpServer(
    params: AuthenticateMcpServerRequestParams
  ): Promise<AuthenticateMcpServerResult> {
    this._ensureNotClosed();
    return this._client.authenticateMcpServer(params);
  }

  async listSkills(): Promise<ListSkillsResult> {
    this._ensureNotClosed();
    return this._client.listSkills();
  }

  onNotification(
    callback: NotificationCallback,
    filter?: NotificationFilter
  ): () => void {
    return this._client.onNotification(callback, filter);
  }

  private _ensureNotClosed(): void {
    if (this._closed) {
      throw new ConnectionError(
        'Daemon session has been closed. Create a new session to continue.'
      );
    }
  }
}
