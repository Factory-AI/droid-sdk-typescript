import z from 'zod';

import { JsonRpcBaseRequestSchema } from '../json-rpc.js';
import { AutomationPrivacyLevel } from './automations-enums.js';
import { DaemonDroidMethod } from './enums.js';

// LIST_AUTOMATIONS - discover automations from the filesystem
const DaemonListAutomationsRequestParamsSchema = z.object({
  basePath: z.string().optional(),
});

export const DaemonListAutomationsRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.LIST_AUTOMATIONS),
    params: DaemonListAutomationsRequestParamsSchema,
  });

export const AutomationEntrySchema = z.object({
  /** Directory name slug (e.g. "health-check"). Kept as `id` because protocol rules forbid renaming required fields. */
  id: z.string(),
  /** Stable UUID from HEARTBEAT.md frontmatter, used for backend/Firestore sync. */
  uuid: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  status: z.string(),
  schedule: z.string().optional(),
  model: z.string().optional(),
  tags: z.array(z.string()).optional(),
  nextRunAt: z.string().optional(),
  lastRunAt: z.string().optional(),
  isValid: z.boolean(),
  path: z.string(),
  privacyLevel: z.string().optional(),
  createdBy: z
    .object({
      name: z.string(),
      email: z.string().optional(),
      avatarUrl: z.string().optional(),
    })
    .optional(),
  forkedFrom: z.string().optional(),
  /** Present when the automation targets a remote computer. */
  computerId: z.string().optional(),
});

export const DaemonListAutomationsResultSchema = z.object({
  automations: z.array(AutomationEntrySchema),
});

// RUN_AUTOMATION - resolve automation metadata so frontend can create a session.
// For local automations: reads HEARTBEAT.md from filesystem.
// For computer automations: fetches from backend API when computerId is present.
const DaemonRunAutomationRequestParamsSchema = z.object({
  automationId: z.string(),
  /** Directory name of the automation (e.g. "health-check"). Preferred over automationId. */
  automationDirName: z.string().optional(),
  basePath: z.string().optional(),
  /** When set, fetches the automation from the backend API instead of local filesystem. */
  computerId: z.string().optional(),
});

export const DaemonRunAutomationRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonDroidMethod.RUN_AUTOMATION),
    params: DaemonRunAutomationRequestParamsSchema,
  }
);

export const DaemonRunAutomationResultSchema = z.object({
  prompt: z.string(),
  automationName: z.string(),
  /** UUID from HEARTBEAT.md frontmatter (falls back to directory name if no UUID) */
  automationId: z.string(),
  cwd: z.string(),
  model: z.string().optional(),
  /** Present when the automation targets a remote computer. */
  computerId: z.string().optional(),
});

// PAUSE_AUTOMATION
const DaemonPauseAutomationRequestParamsSchema = z.object({
  automationId: z.string(),
  automationDirName: z.string().optional(),
  basePath: z.string().optional(),
});

export const DaemonPauseAutomationRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.PAUSE_AUTOMATION),
    params: DaemonPauseAutomationRequestParamsSchema,
  });

export const DaemonPauseAutomationResultSchema = z.object({
  success: z.boolean(),
  automationId: z.string(),
  status: z.string(),
  error: z.string().optional(),
});

// RESUME_AUTOMATION
const DaemonResumeAutomationRequestParamsSchema = z.object({
  automationId: z.string(),
  automationDirName: z.string().optional(),
  basePath: z.string().optional(),
});

export const DaemonResumeAutomationRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.RESUME_AUTOMATION),
    params: DaemonResumeAutomationRequestParamsSchema,
  });

export const DaemonResumeAutomationResultSchema = z.object({
  success: z.boolean(),
  automationId: z.string(),
  status: z.string(),
  error: z.string().optional(),
});

// GET_AUTOMATION_HISTORY
const DaemonGetAutomationHistoryRequestParamsSchema = z.object({
  automationId: z.string(),
  automationDirName: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  basePath: z.string().optional(),
});

export const DaemonGetAutomationHistoryRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.GET_AUTOMATION_HISTORY),
    params: DaemonGetAutomationHistoryRequestParamsSchema,
  });

const AutomationRunRecordSchema = z.object({
  runId: z.string(),
  automationId: z.string(),
  status: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().optional(),
  errorMessage: z.string().optional(),
  isRetry: z.boolean().optional(),
  originalRunId: z.string().optional(),
});

export const DaemonGetAutomationHistoryResultSchema = z.object({
  automationId: z.string(),
  runs: z.array(AutomationRunRecordSchema),
  totalCount: z.number(),
});

// GET_AUTOMATION_VISUAL
const DaemonGetAutomationVisualRequestParamsSchema = z.object({
  automationId: z.string(),
  automationDirName: z.string().optional(),
  basePath: z.string().optional(),
  sessionId: z.string().optional(),
});

export const DaemonGetAutomationVisualRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.GET_AUTOMATION_VISUAL),
    params: DaemonGetAutomationVisualRequestParamsSchema,
  });

export const DaemonGetAutomationVisualResultSchema = z.object({
  automationId: z.string(),
  exists: z.boolean(),
  content: z.string().optional(),
  isStale: z.boolean().optional(),
  s3Url: z.string().optional(),
});

// CREATE_AUTOMATION
const DaemonCreateAutomationRequestParamsSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  schedule: z.string(),
  basePath: z.string().optional(),
});

export const DaemonCreateAutomationRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.CREATE_AUTOMATION),
    params: DaemonCreateAutomationRequestParamsSchema,
  });

export const DaemonCreateAutomationResultSchema = z.object({
  success: z.boolean(),
  automationId: z.string().optional(),
  error: z.string().optional(),
});

// UPDATE_AUTOMATION_MODEL - update the model field in HEARTBEAT.md frontmatter
const DaemonUpdateAutomationModelRequestParamsSchema = z.object({
  automationId: z.string(),
  automationDirName: z.string().optional(),
  model: z.string().nullable(),
  basePath: z.string().optional(),
});

export const DaemonUpdateAutomationModelRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.UPDATE_AUTOMATION_MODEL),
    params: DaemonUpdateAutomationModelRequestParamsSchema,
  });

export const DaemonUpdateAutomationModelResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

// UPDATE_AUTOMATION_PRIVACY - update the privacyLevel field in HEARTBEAT.md frontmatter
const DaemonUpdateAutomationPrivacyRequestParamsSchema = z.object({
  automationId: z.string(),
  automationDirName: z.string().optional(),
  privacyLevel: z.nativeEnum(AutomationPrivacyLevel),
  createdBy: z
    .object({
      name: z.string(),
      email: z.string().optional(),
      avatarUrl: z.string().optional(),
    })
    .optional(),
  basePath: z.string().optional(),
});

export const DaemonUpdateAutomationPrivacyRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.UPDATE_AUTOMATION_PRIVACY),
    params: DaemonUpdateAutomationPrivacyRequestParamsSchema,
  });

export const DaemonUpdateAutomationPrivacyResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

// RENAME_AUTOMATION - update the name field in HEARTBEAT.md frontmatter
const DaemonRenameAutomationRequestParamsSchema = z.object({
  automationId: z.string(),
  automationDirName: z.string().optional(),
  newName: z.string(),
  basePath: z.string().optional(),
});

export const DaemonRenameAutomationRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.RENAME_AUTOMATION),
    params: DaemonRenameAutomationRequestParamsSchema,
  });

export const DaemonRenameAutomationResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

// DELETE_AUTOMATION - remove an automation directory
const DaemonDeleteAutomationRequestParamsSchema = z.object({
  automationId: z.string(),
  automationDirName: z.string().optional(),
  basePath: z.string().optional(),
});

export const DaemonDeleteAutomationRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.DELETE_AUTOMATION),
    params: DaemonDeleteAutomationRequestParamsSchema,
  });

export const DaemonDeleteAutomationResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

// FORK_AUTOMATION - fork a shared automation into the local filesystem
const DaemonForkAutomationRequestParamsSchema = z.object({
  automationId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  schedule: z.string(),
  tags: z.array(z.string()).optional(),
  model: z.string().optional(),
  prompt: z.string(),
  forkedFrom: z.string(),
  localDirName: z.string(),
});

export const DaemonForkAutomationRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.FORK_AUTOMATION),
    params: DaemonForkAutomationRequestParamsSchema,
  });

export const DaemonForkAutomationResultSchema = z.object({
  success: z.boolean(),
  automationId: z.string().optional(),
  error: z.string().optional(),
});
