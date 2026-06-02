import { describe, expect, it } from 'vitest';

import {
  ConnectionState,
  CreateTerminalError,
  DaemonConnectionEvent,
  DaemonConnectionMethod,
  DaemonDroidEvent,
  DaemonDroidMethod,
  DaemonGetGitDiffUnavailableReason,
  DaemonManagementMethod,
  DaemonRelayEvent,
  DaemonRelayMethod,
  DaemonSettingsMethod,
  DaemonSpecificNotificationType,
  DaemonTerminalEvent,
  DaemonTerminalMethod,
  McpConfigSource,
  SessionLoadState,
  SessionSearchDocKind,
} from '../src/protocol/daemon/index.js';

describe('protocol/daemon/enums', () => {
  it('exposes DaemonConnectionMethod values', () => {
    expect(DaemonConnectionMethod.AUTHENTICATE).toBe('daemon.authenticate');
    expect(DaemonConnectionMethod.LOGOUT).toBe('daemon.logout');
  });

  it('exposes DaemonConnectionEvent values', () => {
    expect(DaemonConnectionEvent.CONNECTION_STATUS).toBe(
      'daemon.connection_status'
    );
  });

  it('exposes ConnectionState values', () => {
    expect(ConnectionState.Disconnected).toBe('disconnected');
    expect(ConnectionState.Connecting).toBe('connecting');
    expect(ConnectionState.Connected).toBe('connected');
    expect(ConnectionState.Closing).toBe('closing');
    expect(ConnectionState.LookingUpMachine).toBe('looking_up_machine');
    expect(ConnectionState.StartingMachine).toBe('starting_machine');
    expect(ConnectionState.LoadingSession).toBe('loading_session');
    expect(ConnectionState.AuthenticationFailed).toBe('authentication_failed');
  });

  it('exposes DaemonTerminalMethod values', () => {
    expect(DaemonTerminalMethod.CREATE).toBe('daemon.create_terminal');
    expect(DaemonTerminalMethod.LIST).toBe('daemon.list_terminals');
  });

  it('exposes DaemonTerminalEvent values', () => {
    expect(DaemonTerminalEvent.DATA).toBe('daemon.terminal_data');
    expect(DaemonTerminalEvent.EXIT).toBe('daemon.terminal_exit');
    expect(DaemonTerminalEvent.ERROR).toBe('daemon.terminal_error');
  });

  it('exposes DaemonDroidMethod values', () => {
    expect(DaemonDroidMethod.INITIALIZE_SESSION).toBe(
      'daemon.initialize_session'
    );
    expect(DaemonDroidMethod.GET_CONTEXT_BREAKDOWN).toBe(
      'daemon.get_context_breakdown'
    );
  });

  it('exposes DaemonGetGitDiffUnavailableReason values', () => {
    expect(DaemonGetGitDiffUnavailableReason.MissingSessionCwd).toBe(
      'missing_session_cwd'
    );
    expect(DaemonGetGitDiffUnavailableReason.Unknown).toBe('unknown');
  });

  it('exposes DaemonSettingsMethod values', () => {
    expect(DaemonSettingsMethod.GET_DEFAULT_SETTINGS).toBe(
      'daemon.get_default_settings'
    );
    expect(DaemonSettingsMethod.UPDATE_SESSION_DEFAULTS).toBe(
      'daemon.update_session_defaults'
    );
  });

  it('exposes DaemonManagementMethod values', () => {
    expect(DaemonManagementMethod.TRIGGER_UPDATE).toBe('daemon.trigger_update');
    expect(DaemonManagementMethod.INSTALL_SSH_KEY).toBe(
      'daemon.install_ssh_key'
    );
  });

  it('exposes DaemonRelayMethod values', () => {
    expect(DaemonRelayMethod.START).toBe('daemon.relay.start');
    expect(DaemonRelayMethod.STOP).toBe('daemon.relay.stop');
    expect(DaemonRelayMethod.GET_STATUS).toBe('daemon.relay.get_status');
  });

  it('exposes DaemonRelayEvent values', () => {
    expect(DaemonRelayEvent.STATUS_CHANGED).toBe('daemon.relay.status_changed');
  });

  it('exposes DaemonSpecificNotificationType values', () => {
    expect(DaemonSpecificNotificationType.SESSION_INACTIVITY).toBe(
      'session_inactivity'
    );
    expect(DaemonSpecificNotificationType.CHILD_SESSION_AVAILABLE).toBe(
      'child_session_available'
    );
  });

  it('exposes DaemonDroidEvent values', () => {
    expect(DaemonDroidEvent.SESSION_NOTIFICATION).toBe(
      'daemon.session_notification'
    );
    expect(DaemonDroidEvent.REQUEST_PERMISSION).toBe(
      'daemon.request_permission'
    );
    expect(DaemonDroidEvent.ASK_USER).toBe('daemon.ask_user');
  });

  it('exposes CreateTerminalError values', () => {
    expect(CreateTerminalError.TerminalIdExists).toBe('TerminalIdExists');
  });

  it('exposes McpConfigSource values', () => {
    expect(McpConfigSource.User).toBe('user');
    expect(McpConfigSource.Project).toBe('project');
  });

  it('exposes SessionLoadState values', () => {
    expect(SessionLoadState.NotLoaded).toBe('NOT_LOADED');
    expect(SessionLoadState.Loaded).toBe('LOADED');
    expect(SessionLoadState.Loading).toBe('LOADING');
  });

  it('exposes SessionSearchDocKind values', () => {
    expect(SessionSearchDocKind.MessageText).toBe('message_text');
    expect(SessionSearchDocKind.Document).toBe('document');
    expect(SessionSearchDocKind.ToolUse).toBe('tool_use');
    expect(SessionSearchDocKind.ToolResult).toBe('tool_result');
  });
});

describe('protocol/daemon namespace re-export', () => {
  it('is exposed via the daemon namespace from src/protocol/index.ts', async () => {
    const protocol = await import('../src/protocol/index.js');
    expect(protocol.daemon.DaemonConnectionMethod.AUTHENTICATE).toBe(
      'daemon.authenticate'
    );
    expect(protocol.daemon.SessionLoadState.Loaded).toBe('LOADED');
  });
});
