import z from 'zod';

import {
  AskUserRequestParamsSchema,
  AskUserResultSchema,
  RequestPermissionRequestParamsSchema,
  RequestPermissionResultSchema,
  SessionNotificationSchemaList,
} from '../cli.js';
import {
  AddUserMessageRequestParamsSchema,
  AddUserMessageResultSchema,
  GetContextBreakdownResultSchema,
  InitializeSessionRequestParamsSchema,
  InitializeSessionResultSchema,
  InterruptSessionRequestParamsSchema,
  InterruptSessionResultSchema,
  KillWorkerSessionRequestParamsSchema,
  KillWorkerSessionResultSchema,
  LoadSessionRequestParamsSchema,
  LoadSessionResultSchema,
  ResolveQueuedUserMessageRequestParamsSchema,
  ResolveQueuedUserMessageResultSchema,
  UpdateSessionSettingsRequestParamsSchema,
  UpdateSessionSettingsResultSchema,
  ValidateWorkingDirectoryResultSchema,
} from '../client.js';
import { DroidWorkingState, MissionState } from '../enums.js';
import { MessageRoleNoSystem } from '../enums.js';
import { HostIdSchema } from '../host.js';
import {
  CommandAckSchema,
  JsonRpcBaseNotificationSchema,
  JsonRpcBaseRequestSchema,
  JsonRpcBaseResponseSuccessSchema,
  JsonRpcBaseResponseFailureSchema,
} from '../json-rpc.js';
import {
  StartLoopRequestParamsSchema,
  StartLoopResultSchema,
  StopLoopRequestParamsSchema,
  StopLoopResultSchema,
  GetLoopStatusRequestParamsSchema,
  GetLoopStatusResultSchema,
  RunLoopNowRequestParamsSchema,
  RunLoopNowResultSchema,
} from '../loop.js';
import { FactoryDroidMessageSchema } from '../messages.js';
import { SessionTagSchema } from '../session.js';
import {
  DaemonListAutomationsRequestSchema,
  DaemonRunAutomationRequestSchema,
  DaemonPauseAutomationRequestSchema,
  DaemonResumeAutomationRequestSchema,
  DaemonGetAutomationHistoryRequestSchema,
  DaemonGetAutomationVisualRequestSchema,
  DaemonCreateAutomationRequestSchema,
  DaemonUpdateAutomationModelRequestSchema,
  DaemonUpdateAutomationPrivacyRequestSchema,
  DaemonRenameAutomationRequestSchema,
  DaemonDeleteAutomationRequestSchema,
  DaemonForkAutomationRequestSchema,
} from './automations.js';
import { DaemonSubmitBugReportRequestSchema } from './bug-report.js';
import {
  DaemonDroidEvent,
  DaemonDroidMethod,
  DaemonGetGitDiffUnavailableReason,
  DaemonSpecificNotificationType,
  SessionSearchDocKind,
} from './enums.js';
import {
  DaemonInstallSshKeyRequestSchema,
  DaemonTriggerUpdateRequestSchema,
} from './management.js';
import {
  DaemonGetMcpConfigRequestSchema,
  DaemonUpdateMcpConfigRequestSchema,
  DaemonToggleMcpServerRequestSchema,
  DaemonAuthenticateMcpServerRequestSchema,
  DaemonCancelMcpAuthRequestSchema,
  DaemonClearMcpAuthRequestSchema,
  DaemonAddMcpServerRequestSchema,
  DaemonRemoveMcpServerRequestSchema,
  DaemonListMcpRegistryRequestSchema,
  DaemonListMcpToolsRequestSchema,
  DaemonListMcpServersRequestSchema,
  DaemonToggleMcpToolRequestSchema,
  DaemonSubmitMcpAuthCodeRequestSchema,
} from './mcp.js';
import {
  DaemonListAvailablePluginsRequestSchema,
  DaemonListInstalledPluginsRequestSchema,
  DaemonInstallPluginRequestSchema,
  DaemonUninstallPluginRequestSchema,
  DaemonUpdatePluginRequestSchema,
  DaemonListMarketplacesRequestSchema,
  DaemonAddMarketplaceRequestSchema,
  DaemonRemoveMarketplaceRequestSchema,
  DaemonUpdateMarketplaceRequestSchema,
} from './plugins.js';
import {
  DaemonGetDefaultSettingsRequestSchema,
  DaemonUpdateSessionDefaultsRequestSchema,
} from './settings.js';
import { DaemonListSkillsRequestSchema } from './skills.js';
import {
  TerminalDataNotificationSchema,
  TerminalExitNotificationSchema,
} from './terminal.js';

// Daemon request params schemas - extend client schemas with sessionId and token where needed

export const DaemonCommandAckResultSchema = CommandAckSchema;

const createResponseSchema = <T extends z.ZodTypeAny>(resultSchema: T) =>
  z.union([
    JsonRpcBaseResponseSuccessSchema.extend({
      result: resultSchema,
    }),
    JsonRpcBaseResponseFailureSchema,
  ]);

const createAckCompatibleResponseSchema = <T extends z.ZodTypeAny>(
  resultSchema: T
) =>
  z.union([
    JsonRpcBaseResponseSuccessSchema.extend({
      result: z.union([DaemonCommandAckResultSchema, resultSchema]),
    }),
    JsonRpcBaseResponseFailureSchema,
  ]);

export const DaemonInitializeSessionRequestParamsSchema =
  InitializeSessionRequestParamsSchema.extend({
    token: z.string(),
    inactivityTimeoutMs: z.number().int().positive().optional(),
    disableInactivityTimeout: z.boolean().optional(),
    runtimeSettingsPath: z.string().optional(),
  });

/** Session spawn options captured for loadSession replay. */
export const DaemonLoadSessionSpawnOptionsSchema = z.object({
  disableInactivityTimeout: z.boolean().optional(),
  skipPermissionsUnsafe: z.boolean().optional(),
  runtimeSettingsPath: z.string().optional(),
});

export const DaemonLoadSessionRequestParamsSchema =
  LoadSessionRequestParamsSchema.merge(
    DaemonLoadSessionSpawnOptionsSchema
  ).extend({
    token: z.string(),
  });

export const DaemonAddUserMessageRequestParamsSchema =
  AddUserMessageRequestParamsSchema.extend({
    sessionId: z.string(),
  });

export const DaemonResolveQueuedUserMessageRequestParamsSchema =
  ResolveQueuedUserMessageRequestParamsSchema.and(
    z.object({
      sessionId: z.string(),
    })
  );

export const DaemonInterruptSessionRequestParamsSchema =
  InterruptSessionRequestParamsSchema.extend({
    sessionId: z.string(),
  });

export const DaemonCloseSessionRequestParamsSchema = z.object({
  sessionId: z.string(),
});

export const DaemonSessionListFilterSchema = z.object({
  missionSessions: z.boolean().optional(),
  includeBtwForks: z.boolean().optional(),
});

export const DaemonListOpenedSessionsRequestParamsSchema = z.object({
  filter: DaemonSessionListFilterSchema.optional(),
});

export const DaemonListAvailableSessionsFilterSchema =
  DaemonSessionListFilterSchema.extend({
    missionStates: z.array(z.nativeEnum(MissionState)).optional(),
  });

export const DaemonListAvailableSessionsRequestParamsSchema = z.object({
  limit: z.number().min(1).max(100).default(50), // Default 50
  endBefore: z.number().optional(), // Unix epoch seconds cursor
  includeMissionMetadata: z.boolean().optional(),
  filter: DaemonListAvailableSessionsFilterSchema.optional(),
});

export const DaemonGetSessionMessagesRequestParamsSchema = z.object({
  sessionId: z.string(),
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  role: z.nativeEnum(MessageRoleNoSystem).optional(),
});

export const DaemonUpdateSessionSettingsRequestParamsSchema =
  UpdateSessionSettingsRequestParamsSchema.extend({
    sessionId: z.string(),
  });

export const DaemonStartLoopRequestParamsSchema =
  StartLoopRequestParamsSchema.extend({
    sessionId: z.string(),
  });

export const DaemonStopLoopRequestParamsSchema =
  StopLoopRequestParamsSchema.extend({
    sessionId: z.string(),
  });

export const DaemonGetLoopStatusRequestParamsSchema =
  GetLoopStatusRequestParamsSchema.extend({
    sessionId: z.string(),
  });

export const DaemonRunLoopNowRequestParamsSchema =
  RunLoopNowRequestParamsSchema.extend({
    sessionId: z.string(),
  });

export const DaemonGetUserInfoRequestParamsSchema = z.object({});

export const DaemonValidateWorkingDirectoryRequestParamsSchema = z.object({
  workingDirectory: z.string(),
});

export const DaemonInitializeSessionRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.INITIALIZE_SESSION),
    params: DaemonInitializeSessionRequestParamsSchema,
  });

export const DaemonLoadSessionRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.LOAD_SESSION),
  params: DaemonLoadSessionRequestParamsSchema,
});

export const DaemonAddUserMessageRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.ADD_USER_MESSAGE),
    params: DaemonAddUserMessageRequestParamsSchema,
  });

export const DaemonResolveQueuedUserMessageRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.RESOLVE_QUEUED_USER_MESSAGE),
    params: DaemonResolveQueuedUserMessageRequestParamsSchema,
  });

export const DaemonInterruptSessionRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.INTERRUPT_SESSION),
    params: DaemonInterruptSessionRequestParamsSchema,
  });

export const DaemonCloseSessionRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.CLOSE_SESSION),
  params: DaemonCloseSessionRequestParamsSchema,
});

export const DaemonCloseSessionResultSchema = z.object({});

export const DaemonKillWorkerSessionRequestParamsSchema = z
  .object({
    /** The orchestrator session ID (where the mission is running) */
    sessionId: z.string(),
  })
  .extend(KillWorkerSessionRequestParamsSchema.shape);

export const DaemonKillWorkerSessionRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.KILL_WORKER_SESSION),
    params: DaemonKillWorkerSessionRequestParamsSchema,
  });

export const DaemonKillWorkerSessionResultSchema =
  KillWorkerSessionResultSchema;

export const DaemonListOpenedSessionsRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.LIST_OPENED_SESSIONS),
    params: DaemonListOpenedSessionsRequestParamsSchema,
  });

export const DaemonListAvailableSessionsRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.LIST_AVAILABLE_SESSIONS),
    params: DaemonListAvailableSessionsRequestParamsSchema,
  });

export const DaemonGetSessionMessagesRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.GET_SESSION_MESSAGES),
    params: DaemonGetSessionMessagesRequestParamsSchema,
  });

export const DaemonUpdateSessionSettingsRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.UPDATE_SESSION_SETTINGS),
    params: DaemonUpdateSessionSettingsRequestParamsSchema,
  });

export const DaemonStartLoopRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.START_LOOP),
  params: DaemonStartLoopRequestParamsSchema,
});

export const DaemonStopLoopRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.STOP_LOOP),
  params: DaemonStopLoopRequestParamsSchema,
});

export const DaemonGetLoopStatusRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonDroidMethod.GET_LOOP_STATUS),
    params: DaemonGetLoopStatusRequestParamsSchema,
  }
);

export const DaemonRunLoopNowRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.RUN_LOOP_NOW),
  params: DaemonRunLoopNowRequestParamsSchema,
});

export const DaemonValidateWorkingDirectoryRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.VALIDATE_WORKING_DIRECTORY),
    params: DaemonValidateWorkingDirectoryRequestParamsSchema,
  });

export const DaemonInitializeSessionResultSchema =
  InitializeSessionResultSchema;

export const DaemonLoadSessionResultSchema = LoadSessionResultSchema;

export const DaemonAddUserMessageResultSchema = AddUserMessageResultSchema;

export const DaemonResolveQueuedUserMessageResultSchema =
  ResolveQueuedUserMessageResultSchema;

export const DaemonInterruptSessionResultSchema = InterruptSessionResultSchema;

export const DaemonOpenedSessionInfoSchema = z.object({
  sessionId: z.string(),
  hostId: HostIdSchema.optional(),
  updatedAt: z.number(), // Unix epoch seconds (in-memory updatedAt timestamp)
  workingState: z.nativeEnum(DroidWorkingState),
  cwd: z.string().optional(), // Working directory for the session (may be missing for older sessions)
  repoRoot: z.string().optional(), // Git repo root for `cwd`; for worktree cwds this points at the main repo path. Used to group worktree sessions under their parent project in the sidebar.
  messagesCount: z.number().optional(), // Number of messages in session
  callingSessionId: z.string().optional(), // Parent session ID for child/worker sessions
  callingToolUseId: z.string().optional(), // Parent tool use ID that spawned this child session
  tags: z.array(SessionTagSchema).optional(), // Session tags for categorization
});

export const DaemonAvailableSessionInfoSchema = z.object({
  sessionId: z.string(),
  hostId: HostIdSchema.optional(),
  updatedAt: z.number(), // Unix epoch seconds (file mtime)
  title: z.string().optional(), // May be missing on parse errors
  cwd: z.string().optional(), // Working directory for the session (may be missing for older sessions)
  repoRoot: z.string().optional(), // See DaemonOpenedSessionInfoSchema.repoRoot.
  messagesCount: z.number().optional(), // Number of messages in session
  archivedAt: z.string().optional(), // ISO timestamp when archived - presence indicates archived status
  callingSessionId: z.string().optional(), // Parent session ID for child/worker sessions (from JSONL summary `callingSessionId` field)
  callingToolUseId: z.string().optional(), // Parent tool use ID that spawned this child session (from JSONL summary)
  tags: z.array(SessionTagSchema).optional(), // Session tags for categorization
  mission: z
    .object({
      state: z.nativeEnum(MissionState).nullable(),
      title: z.string().nullable(),
      workingDirectory: z.string().nullable(),
      createdAt: z.string().nullable(),
      elapsedMs: z.number().nullable(),
      completedFeatures: z.number().nullable(),
      totalFeatures: z.number().nullable(),
    })
    .optional(),
});

export const DaemonListOpenedSessionsResultSchema = z.object({
  sessions: z.array(DaemonOpenedSessionInfoSchema),
});

export const DaemonListAvailableSessionsResultSchema = z.object({
  sessions: z.array(DaemonAvailableSessionInfoSchema),
  hasMore: z.boolean(),
  nextCursor: z.number().optional(),
});

export const DaemonGetSessionMessagesResultSchema = z.object({
  messages: z.array(FactoryDroidMessageSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

export const DaemonUpdateSessionSettingsResultSchema =
  UpdateSessionSettingsResultSchema;

export const DaemonStartLoopResultSchema = StartLoopResultSchema;

export const DaemonStopLoopResultSchema = StopLoopResultSchema;

export const DaemonGetLoopStatusResultSchema = GetLoopStatusResultSchema;

export const DaemonRunLoopNowResultSchema = RunLoopNowResultSchema;

export const DaemonGetUserInfoResultSchema = z.object({
  userId: z.string(),
  orgId: z.string(),
});

export const DaemonValidateWorkingDirectoryResultSchema =
  ValidateWorkingDirectoryResultSchema;

// Permission request schemas - extend client schemas with sessionId
export const DaemonRequestPermissionParamsSchema =
  RequestPermissionRequestParamsSchema.extend({
    sessionId: z.string(),
  });

export const DaemonRequestPermissionResultSchema =
  RequestPermissionResultSchema.and(z.object({ sessionId: z.string() }));

// AskUser request schemas - extend droid schemas with sessionId
export const DaemonAskUserParamsSchema = AskUserRequestParamsSchema.extend({
  sessionId: z.string(),
});

export const DaemonAskUserResultSchema = AskUserResultSchema.extend({
  sessionId: z.string(),
});

// ============================================================
// List Files
// ============================================================

export const DaemonListFilesRequestParamsSchema = z.object({
  sessionId: z.string(),
  showHidden: z.boolean().optional().default(false),
});

export const DaemonListFilesResultSchema = z.object({
  files: z.array(z.string()),
});

export const DaemonListFilesRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.LIST_FILES),
  params: DaemonListFilesRequestParamsSchema,
});

export const DaemonListFilesResponseSchema =
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonListFilesResultSchema,
  });

// ============================================================
// Search Files (Fuzzy Search)
// ============================================================

export const DaemonSearchFilesRequestParamsSchema = z.object({
  sessionId: z.string(),
  query: z.string(),
  maxResults: z.number().optional().default(60),
  showHidden: z.boolean().optional().default(false),
});

export const DaemonSearchFilesResultSchema = z.object({
  files: z.array(z.string()),
  totalFiles: z.number(),
});

export const DaemonSearchFilesRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.SEARCH_FILES),
  params: DaemonSearchFilesRequestParamsSchema,
});

export const DaemonSearchFilesResponseSchema =
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonSearchFilesResultSchema,
  });

// ============================================================
// Search Sessions (Full-text search across session history)
// ============================================================

const SessionSearchDocKindSchema = z.nativeEnum(SessionSearchDocKind);

export const DaemonSearchSessionsRequestParamsSchema = z.object({
  query: z.string(),
  kind: z.union([SessionSearchDocKindSchema, z.literal('all')]).optional(),
  limitSessions: z.number().optional(),
  limitHitsPerSession: z.number().optional(),
  contextChars: z.number().optional(),
});

export const DaemonSearchSessionsHitSchema = z.object({
  docId: z.string(),
  kind: SessionSearchDocKindSchema,
  score: z.number().optional(),
  toolName: z.string().optional(),
  messageRole: z.enum(['user', 'assistant']).optional(),
  snippets: z.array(z.string()),
});

export const DaemonSearchSessionsSessionResultSchema = z.object({
  sessionId: z.string(),
  title: z.string().optional(),
  updatedAt: z.number().optional(), // Unix timestamp in milliseconds for sorting
  hits: z.array(DaemonSearchSessionsHitSchema),
  totals: z
    .object({
      byKind: z.record(z.number()).optional(),
      toolUse: z.record(z.number()).optional(),
      toolResult: z.record(z.number()).optional(),
    })
    .optional(),
});

export const DaemonSearchSessionsResultSchema = z.object({
  query: z.string(),
  sessions: z.array(DaemonSearchSessionsSessionResultSchema),
});

export const DaemonSearchSessionsRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.SEARCH_SESSIONS),
    params: DaemonSearchSessionsRequestParamsSchema,
  });

export const DaemonSearchSessionsResponseSchema =
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonSearchSessionsResultSchema,
  });

// ============================================================
// Archive Session
// ============================================================

export const DaemonArchiveSessionRequestParamsSchema = z.object({
  sessionId: z.string(),
});

export const DaemonArchiveSessionResultSchema = z.object({
  success: z.boolean(),
  archivedAt: z.string(), // ISO timestamp
});

export const DaemonArchiveSessionRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.ARCHIVE_SESSION),
    params: DaemonArchiveSessionRequestParamsSchema,
  });

export const DaemonArchiveSessionResponseSchema = createResponseSchema(
  DaemonArchiveSessionResultSchema
);

// ============================================================
// Unarchive Session
// ============================================================

export const DaemonUnarchiveSessionRequestParamsSchema = z.object({
  sessionId: z.string(),
});

export const DaemonUnarchiveSessionResultSchema = z.object({
  success: z.boolean(),
});

export const DaemonUnarchiveSessionRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.UNARCHIVE_SESSION),
    params: DaemonUnarchiveSessionRequestParamsSchema,
  });

export const DaemonUnarchiveSessionResponseSchema = createResponseSchema(
  DaemonUnarchiveSessionResultSchema
);

// ============================================================
// Rename Session
// ============================================================

export const DaemonRenameSessionRequestParamsSchema = z.object({
  sessionId: z.string(),
  title: z.string(),
});

export const DaemonRenameSessionResultSchema = z.object({
  success: z.boolean(),
});

export const DaemonRenameSessionRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonDroidMethod.RENAME_SESSION),
    params: DaemonRenameSessionRequestParamsSchema,
  }
);

export const DaemonRenameSessionResponseSchema =
  createAckCompatibleResponseSchema(DaemonRenameSessionResultSchema);

// ============================================================
// Get Git Diff
// ============================================================

export const DaemonGetGitDiffRequestParamsSchema = z.object({
  sessionId: z.string(),
  baseBranch: z.string().optional(),
});

export const DaemonGetGitDiffFileSchema = z.object({
  path: z.string(),
  additions: z.number(),
  deletions: z.number(),
  status: z.string(),
});

export const DaemonGetGitDiffCommitSchema = z.object({
  hash: z.string(),
  message: z.string(),
});

const DaemonGetGitDiffUnavailableReasonSchema = z
  .nativeEnum(DaemonGetGitDiffUnavailableReason)
  .catch(DaemonGetGitDiffUnavailableReason.Unknown);

export const DaemonGetGitDiffDataSchema = z.object({
  diff: z.string(),
  branch: z.string(),
  baseBranch: z.string(),
  files: z.array(DaemonGetGitDiffFileSchema),
  totalAdditions: z.number(),
  totalDeletions: z.number(),
  remoteUrl: z.string().nullable(),
  commits: z.array(DaemonGetGitDiffCommitSchema),
  unstagedDiff: z.string().default(''),
  unstagedFiles: z.array(DaemonGetGitDiffFileSchema).default([]),
  unstagedTotalAdditions: z.number().default(0),
  unstagedTotalDeletions: z.number().default(0),
});

export const DaemonGetGitDiffSuccessResultSchema = z.object({
  success: z.literal(true),
  data: DaemonGetGitDiffDataSchema,
});

export const DaemonGetGitDiffUnavailableResultSchema = z.object({
  success: z.literal(false),
  unavailableReason: DaemonGetGitDiffUnavailableReasonSchema,
  unavailableMessage: z.string(),
});

export const DaemonGetGitDiffResultSchema = z.preprocess(
  (value) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !('success' in value)
    ) {
      const legacyResult = DaemonGetGitDiffDataSchema.safeParse(value);
      if (legacyResult.success) {
        return { success: true, data: legacyResult.data };
      }
    }

    return value;
  },
  z.discriminatedUnion('success', [
    DaemonGetGitDiffSuccessResultSchema,
    DaemonGetGitDiffUnavailableResultSchema,
  ])
);

export const DaemonGetGitDiffRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.GET_GIT_DIFF),
  params: DaemonGetGitDiffRequestParamsSchema,
});

export const DaemonGetGitDiffResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonGetGitDiffResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

// ============================================================
// Git Push
// ============================================================

export const DaemonGitPushRequestParamsSchema = z.object({
  sessionId: z.string(),
});

export const DaemonGitPushResultSchema = z.object({
  success: z.boolean(),
});

export const DaemonGitPushRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.GIT_PUSH),
  params: DaemonGitPushRequestParamsSchema,
});

export const DaemonGitPushResponseSchema = createResponseSchema(
  DaemonGitPushResultSchema
);

// ============================================================
// Git Commit
// ============================================================

export const DaemonGitCommitRequestParamsSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
});

export const DaemonGitCommitResultSchema = z.object({
  success: z.boolean(),
});

export const DaemonGitCommitRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.GIT_COMMIT),
  params: DaemonGitCommitRequestParamsSchema,
});

export const DaemonGitCommitResponseSchema = createResponseSchema(
  DaemonGitCommitResultSchema
);

// ============================================================
// Create PR
// ============================================================

export const DaemonCreatePRRequestParamsSchema = z.object({
  sessionId: z.string(),
  title: z.string(),
  body: z.string().optional(),
  baseBranch: z.string(),
  draft: z.boolean().optional(),
  linkedTicketIds: z.array(z.string()).optional(),
  linkedTicketUrls: z.array(z.string()).optional(),
  jiraIssueKeys: z.array(z.string()).optional(),
  linearIssueIds: z.array(z.string()).optional(),
});

export const DaemonCreatePRResultSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.string(),
  draft: z.boolean(),
});

export const DaemonCreatePRRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.CREATE_PR),
  params: DaemonCreatePRRequestParamsSchema,
});

export const DaemonCreatePRResponseSchema = createResponseSchema(
  DaemonCreatePRResultSchema
);

// ============================================================
// Semantic Diff Cache
// ============================================================

export const DaemonGetSemanticDiffCacheRequestParamsSchema = z.object({
  currentBranch: z.string(),
  baseBranch: z.string(),
});

export const DaemonGetSemanticDiffCacheResultSchema = z.object({
  content: z.string().nullable(),
  commitHash: z.string().nullable(),
  truncated: z.boolean(),
});

export const DaemonGetSemanticDiffCacheRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.GET_SEMANTIC_DIFF_CACHE),
    params: DaemonGetSemanticDiffCacheRequestParamsSchema,
  });

export const DaemonGetSemanticDiffCacheResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonGetSemanticDiffCacheResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const DaemonSaveSemanticDiffCacheRequestParamsSchema = z.object({
  currentBranch: z.string(),
  baseBranch: z.string(),
  commitHash: z.string(),
  content: z.string(),
  truncated: z.boolean(),
});

export const DaemonSaveSemanticDiffCacheResultSchema = z.object({
  success: z.boolean(),
});

export const DaemonSaveSemanticDiffCacheRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.SAVE_SEMANTIC_DIFF_CACHE),
    params: DaemonSaveSemanticDiffCacheRequestParamsSchema,
  });

export const DaemonSaveSemanticDiffCacheResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonSaveSemanticDiffCacheResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

// ============================================================
// Generate Semantic Diff (Agent Flow)
// ============================================================

export const DaemonGenerateSemanticDiffRequestParamsSchema = z.object({
  sessionId: z.string(),
  diff: z.string(),
  baseBranch: z.string(),
  currentBranch: z.string(),
  commitHash: z.string().optional(),
  modelId: z.string().optional(),
  unstagedDiff: z.string().optional(),
});

export const DaemonGenerateSemanticDiffResultSchema = z.object({
  content: z.string(),
  truncated: z.boolean(),
  sessionId: z.string(),
});

export const DaemonGenerateSemanticDiffRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.GENERATE_SEMANTIC_DIFF),
    params: DaemonGenerateSemanticDiffRequestParamsSchema,
  });

export const DaemonGenerateSemanticDiffResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonGenerateSemanticDiffResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

// Get Proxy Token
// ============================================================

export const DaemonGetProxyTokenResultSchema = z.object({
  token: z.string(),
});

export const DaemonGetProxyTokenRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonDroidMethod.GET_PROXY_TOKEN),
  }
);

export const DaemonGetProxyTokenResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonGetProxyTokenResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

// Get Workspace File Content
// ============================================================

const DaemonGetWorkspaceFileContentRequestParamsSchema = z.object({
  sessionId: z.string(),
  filePath: z.string(),
});

export const DaemonGetWorkspaceFileContentResultSchema = z.object({
  content: z.string(),
  byteLength: z.number(),
});

export const DaemonGetWorkspaceFileContentRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.GET_WORKSPACE_FILE_CONTENT),
    params: DaemonGetWorkspaceFileContentRequestParamsSchema,
  });

export const DaemonGetWorkspaceFileContentResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonGetWorkspaceFileContentResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

// Rewind schemas

const DaemonGetRewindInfoRequestParamsSchema = z.object({
  sessionId: z.string(),
  messageId: z.string(),
});

const DaemonRewindFileSnapshotSchema = z.object({
  filePath: z.string(),
  contentHash: z.string(),
  size: z.number(),
});

const DaemonRewindFileCreationSchema = z.object({
  filePath: z.string(),
});

const DaemonRewindEvictedFileSchema = z.object({
  filePath: z.string(),
  reason: z.string(),
});

export const DaemonGetRewindInfoResultSchema = z.object({
  availableFiles: z.array(DaemonRewindFileSnapshotSchema),
  createdFiles: z.array(DaemonRewindFileCreationSchema),
  evictedFiles: z.array(DaemonRewindEvictedFileSchema),
});

export const DaemonGetRewindInfoRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonDroidMethod.GET_REWIND_INFO),
    params: DaemonGetRewindInfoRequestParamsSchema,
  }
);

export const DaemonGetRewindInfoResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonGetRewindInfoResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

const DaemonExecuteRewindRequestParamsSchema = z.object({
  sessionId: z.string(),
  messageId: z.string(),
  filesToRestore: z.array(DaemonRewindFileSnapshotSchema),
  filesToDelete: z.array(DaemonRewindFileCreationSchema),
  forkTitle: z.string(),
});

export const DaemonExecuteRewindResultSchema = z.object({
  newSessionId: z.string(),
  restoredCount: z.number(),
  deletedCount: z.number(),
  failedRestoreCount: z.number(),
  failedDeleteCount: z.number(),
});

export const DaemonExecuteRewindRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonDroidMethod.EXECUTE_REWIND),
    params: DaemonExecuteRewindRequestParamsSchema,
  }
);

export const DaemonExecuteRewindResponseSchema = createResponseSchema(
  DaemonExecuteRewindResultSchema
);

// ============================================================
// Compact Session
// ============================================================

export const DaemonCompactSessionRequestParamsSchema = z.object({
  sessionId: z.string(),
  customInstructions: z.string().optional(),
});

export const DaemonCompactSessionResultSchema = z.object({
  newSessionId: z.string(),
  removedCount: z.number(),
});

export const DaemonCompactSessionRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.COMPACT_SESSION),
    params: DaemonCompactSessionRequestParamsSchema,
  });

export const DaemonCompactSessionResponseSchema = createResponseSchema(
  DaemonCompactSessionResultSchema
);

// Fork Session
// ============================================================

export const DaemonForkSessionRequestParamsSchema = z.object({
  sessionId: z.string(),
  title: z.string().optional(),
  tags: z
    .array(
      z.object({ name: z.string(), metadata: z.record(z.string()).optional() })
    )
    .optional(),
});

export const DaemonForkSessionResultSchema = z.object({
  newSessionId: z.string(),
});

export const DaemonForkSessionRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.FORK_SESSION),
  params: DaemonForkSessionRequestParamsSchema,
});

export const DaemonForkSessionResponseSchema = createResponseSchema(
  DaemonForkSessionResultSchema
);

// Warmup Cache
// ============================================================

export const DaemonWarmupCacheRequestParamsSchema = z.object({
  sessionId: z.string(),
});

export const DaemonWarmupCacheRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.WARMUP_CACHE),
  params: DaemonWarmupCacheRequestParamsSchema,
});

const DaemonWarmupCacheResultSchema = z.object({});

export const DaemonWarmupCacheResponseSchema = createResponseSchema(
  DaemonWarmupCacheResultSchema
);

// ============================================================
// Get Context Breakdown
// ============================================================

// The daemon RPC is a passthrough — reuse the droid SDK result shape directly.
export const DaemonGetContextBreakdownResultSchema =
  GetContextBreakdownResultSchema;

const DaemonGetContextBreakdownRequestParamsSchema = z.object({
  sessionId: z.string(),
});

export const DaemonGetContextBreakdownRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.GET_CONTEXT_BREAKDOWN),
    params: DaemonGetContextBreakdownRequestParamsSchema,
  });

export const DaemonGetContextBreakdownResponseSchema = createResponseSchema(
  DaemonGetContextBreakdownResultSchema
);

// Union of all daemon request types (discriminated by method)
export const DaemonRequestSchema = z.discriminatedUnion('method', [
  DaemonInitializeSessionRequestSchema,
  DaemonLoadSessionRequestSchema,
  DaemonAddUserMessageRequestSchema,
  DaemonResolveQueuedUserMessageRequestSchema,
  DaemonInterruptSessionRequestSchema,
  DaemonCloseSessionRequestSchema,
  DaemonKillWorkerSessionRequestSchema,
  DaemonListOpenedSessionsRequestSchema,
  DaemonListAvailableSessionsRequestSchema,
  DaemonGetSessionMessagesRequestSchema,
  DaemonUpdateSessionSettingsRequestSchema,
  DaemonStartLoopRequestSchema,
  DaemonStopLoopRequestSchema,
  DaemonGetLoopStatusRequestSchema,
  DaemonRunLoopNowRequestSchema,
  DaemonGetDefaultSettingsRequestSchema,
  DaemonUpdateSessionDefaultsRequestSchema,
  DaemonValidateWorkingDirectoryRequestSchema,
  DaemonListFilesRequestSchema,
  DaemonSearchFilesRequestSchema,
  DaemonGetMcpConfigRequestSchema,
  DaemonUpdateMcpConfigRequestSchema,
  DaemonToggleMcpServerRequestSchema,
  DaemonAuthenticateMcpServerRequestSchema,
  DaemonCancelMcpAuthRequestSchema,
  DaemonClearMcpAuthRequestSchema,
  DaemonAddMcpServerRequestSchema,
  DaemonRemoveMcpServerRequestSchema,
  DaemonListMcpRegistryRequestSchema,
  DaemonListMcpToolsRequestSchema,
  DaemonListMcpServersRequestSchema,
  DaemonToggleMcpToolRequestSchema,
  DaemonSubmitMcpAuthCodeRequestSchema,
  DaemonSearchSessionsRequestSchema,
  DaemonArchiveSessionRequestSchema,
  DaemonUnarchiveSessionRequestSchema,
  DaemonRenameSessionRequestSchema,
  DaemonListSkillsRequestSchema,
  DaemonListAvailablePluginsRequestSchema,
  DaemonListInstalledPluginsRequestSchema,
  DaemonInstallPluginRequestSchema,
  DaemonUninstallPluginRequestSchema,
  DaemonUpdatePluginRequestSchema,
  DaemonListMarketplacesRequestSchema,
  DaemonAddMarketplaceRequestSchema,
  DaemonRemoveMarketplaceRequestSchema,
  DaemonUpdateMarketplaceRequestSchema,
  DaemonSubmitBugReportRequestSchema,
  DaemonListAutomationsRequestSchema,
  DaemonRunAutomationRequestSchema,
  DaemonPauseAutomationRequestSchema,
  DaemonResumeAutomationRequestSchema,
  DaemonGetAutomationHistoryRequestSchema,
  DaemonGetAutomationVisualRequestSchema,
  DaemonCreateAutomationRequestSchema,
  DaemonUpdateAutomationModelRequestSchema,
  DaemonUpdateAutomationPrivacyRequestSchema,
  DaemonRenameAutomationRequestSchema,
  DaemonDeleteAutomationRequestSchema,
  DaemonForkAutomationRequestSchema,
  DaemonGetGitDiffRequestSchema,
  DaemonGitPushRequestSchema,
  DaemonGitCommitRequestSchema,
  DaemonCreatePRRequestSchema,
  DaemonGetSemanticDiffCacheRequestSchema,
  DaemonSaveSemanticDiffCacheRequestSchema,
  DaemonGenerateSemanticDiffRequestSchema,
  DaemonGetProxyTokenRequestSchema,
  DaemonGetWorkspaceFileContentRequestSchema,
  DaemonTriggerUpdateRequestSchema,
  DaemonInstallSshKeyRequestSchema,
  DaemonGetRewindInfoRequestSchema,
  DaemonExecuteRewindRequestSchema,
  DaemonCompactSessionRequestSchema,
  DaemonForkSessionRequestSchema,
  DaemonWarmupCacheRequestSchema,
  DaemonGetContextBreakdownRequestSchema,
]);

// Daemon response schemas
export const DaemonInitializeSessionResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonInitializeSessionResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const DaemonLoadSessionResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonLoadSessionResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const DaemonAddUserMessageResponseSchema =
  createAckCompatibleResponseSchema(DaemonAddUserMessageResultSchema);

export const DaemonResolveQueuedUserMessageResponseSchema =
  createAckCompatibleResponseSchema(DaemonResolveQueuedUserMessageResultSchema);

export const DaemonInterruptSessionResponseSchema = createResponseSchema(
  DaemonInterruptSessionResultSchema
);

export const DaemonCloseSessionResponseSchema = createResponseSchema(
  DaemonCloseSessionResultSchema
);

export const DaemonListOpenedSessionsResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonListOpenedSessionsResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const DaemonListAvailableSessionsResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonListAvailableSessionsResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const DaemonGetSessionMessagesResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonGetSessionMessagesResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const DaemonUpdateSessionSettingsResponseSchema =
  createAckCompatibleResponseSchema(DaemonUpdateSessionSettingsResultSchema);

export const DaemonStartLoopResponseSchema = createAckCompatibleResponseSchema(
  DaemonStartLoopResultSchema
);

export const DaemonStopLoopResponseSchema = createAckCompatibleResponseSchema(
  DaemonStopLoopResultSchema
);

export const DaemonGetLoopStatusResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonGetLoopStatusResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const DaemonRunLoopNowResponseSchema = createAckCompatibleResponseSchema(
  DaemonRunLoopNowResultSchema
);

export const DaemonValidateWorkingDirectoryResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonValidateWorkingDirectoryResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

// Session inactivity params - daemon-level lifecycle event
export const SessionInactivityNotificationSchema = z.object({
  type: z.literal(DaemonSpecificNotificationType.SESSION_INACTIVITY),
  message: z.string(),
  timestamp: z.number(),
  timeoutSeconds: z.number(),
});

// Session process exit params - daemon-level lifecycle event
const SessionProcessExitedNotificationSchema = z.object({
  type: z.literal(DaemonSpecificNotificationType.SESSION_PROCESS_EXITED),
  message: z.string(),
  timestamp: z.number(),
});

const SessionClosedNotificationSchema = z.object({
  type: z.literal(DaemonSpecificNotificationType.SESSION_CLOSED),
  timestamp: z.number(),
});

// Session unsubscribed params - daemon-level notification when another client connects
export const SessionUnsubscribedNotificationSchema = z.object({
  type: z.literal(DaemonSpecificNotificationType.SESSION_UNSUBSCRIBED),
  message: z.string(),
});

export const ChildSessionAvailableNotificationSchema = z.object({
  type: z.literal(DaemonSpecificNotificationType.CHILD_SESSION_AVAILABLE),
  childSessionId: z.string(),
  timestamp: z.number(),
});

// Daemon session notification schema - extends SDK schema with sessionId
export const DaemonSessionNotificationParamsSchema = z.object({
  sessionId: z.string(),
  notification: z.discriminatedUnion('type', [
    ...SessionNotificationSchemaList,
    SessionInactivityNotificationSchema,
    SessionProcessExitedNotificationSchema,
    SessionClosedNotificationSchema,
    SessionUnsubscribedNotificationSchema,
    ChildSessionAvailableNotificationSchema,
    TerminalDataNotificationSchema,
    TerminalExitNotificationSchema,
  ]),
});

export const DaemonSessionNotificationSchema =
  JsonRpcBaseNotificationSchema.extend({
    method: z.literal(DaemonDroidEvent.SESSION_NOTIFICATION),
    params: DaemonSessionNotificationParamsSchema,
  });

// Permission request schema - daemon-level request for tool permissions
export const DaemonRequestPermissionSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidEvent.REQUEST_PERMISSION),
  params: DaemonRequestPermissionParamsSchema,
});

// AskUser request schema - daemon-level request for user questionnaire answers
export const DaemonAskUserSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidEvent.ASK_USER),
  params: DaemonAskUserParamsSchema,
});
