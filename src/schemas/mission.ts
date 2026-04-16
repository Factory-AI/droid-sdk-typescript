import { z } from 'zod';

import {
  DismissalType,
  FeatureStatus,
  FeatureSuccessState,
  IssueSeverity,
  ProgressLogEntryType,
} from './enums.js';

/** Mission feature schema. */
export const MissionFeatureSchema = z
  .object({
    id: z.string(),
    description: z.string(),
    status: z.nativeEnum(FeatureStatus),
    skillName: z.string(),
    preconditions: z.array(z.string()),
    expectedBehavior: z.array(z.string()),
    verificationSteps: z.array(z.string()),
    fulfills: z.array(z.string()).optional(),
    milestone: z.string().optional(),
    workerSessionIds: z.array(z.string()).optional(),
    currentWorkerSessionId: z.string().nullable().optional(),
    completedWorkerSessionId: z.string().nullable().optional(),
  })
  .passthrough();

export type MissionFeature = z.infer<typeof MissionFeatureSchema>;

export const FeatureSuccessStateSchema = z.nativeEnum(FeatureSuccessState);

/** Discovered issue during feature implementation. */
export const DiscoveredIssueSchema = z
  .object({
    severity: z.nativeEnum(IssueSeverity),
    description: z.string(),
    suggestedFix: z.string().optional(),
  })
  .passthrough();

export type DiscoveredIssue = z.infer<typeof DiscoveredIssueSchema>;

/** A command run during verification. */
export const VerificationCommandSchema = z
  .object({
    command: z.string(),
    exitCode: z.number(),
    observation: z.string(),
  })
  .passthrough();

export type VerificationCommand = z.infer<typeof VerificationCommandSchema>;

/** An interactive check performed during verification. */
export const InteractiveCheckSchema = z
  .object({
    action: z.string(),
    observed: z.string(),
  })
  .passthrough();

export type InteractiveCheck = z.infer<typeof InteractiveCheckSchema>;

/** Verification performed during feature implementation. */
export const VerificationSchema = z
  .object({
    commandsRun: z.array(VerificationCommandSchema),
    interactiveChecks: z.array(InteractiveCheckSchema).optional(),
  })
  .passthrough();

export type Verification = z.infer<typeof VerificationSchema>;

/** A single test case. */
export const TestCaseSchema = z
  .object({
    name: z.string(),
    verifies: z.string(),
  })
  .passthrough();

export type TestCase = z.infer<typeof TestCaseSchema>;

/** A test file with its test cases. */
export const TestFileSchema = z
  .object({
    file: z.string(),
    cases: z.array(TestCaseSchema),
  })
  .passthrough();

export type TestFile = z.infer<typeof TestFileSchema>;

/** Test information for a feature implementation. */
export const TestsSchema = z
  .object({
    added: z.array(TestFileSchema),
    updated: z.array(z.string()).optional(),
    coverage: z.string(),
  })
  .passthrough();

export type Tests = z.infer<typeof TestsSchema>;

/** A deviation from the skill procedure. */
export const SkillDeviationSchema = z
  .object({
    step: z.string(),
    whatIDidInstead: z.string(),
    why: z.string(),
  })
  .passthrough();

export type SkillDeviation = z.infer<typeof SkillDeviationSchema>;

/** Feedback on the skill procedure. */
export const SkillFeedbackSchema = z
  .object({
    followedProcedure: z.boolean(),
    deviations: z.array(SkillDeviationSchema),
    suggestedChanges: z.array(z.string()).optional(),
  })
  .passthrough();

export type SkillFeedback = z.infer<typeof SkillFeedbackSchema>;

/** Worker handoff information. */
export const HandoffSchema = z
  .object({
    salientSummary: z.string().optional(),
    whatWasImplemented: z.string(),
    whatWasLeftUndone: z.string(),
    verification: VerificationSchema,
    tests: TestsSchema,
    discoveredIssues: z.array(DiscoveredIssueSchema),
    skillFeedback: SkillFeedbackSchema.optional(),
  })
  .passthrough();

export type Handoff = z.infer<typeof HandoffSchema>;

/** A record of a dismissed handoff item. */
export const DismissalRecordSchema = z
  .object({
    type: z.nativeEnum(DismissalType),
    sourceFeatureId: z.string(),
    summary: z.string(),
    justification: z.string(),
  })
  .passthrough();

export type DismissalRecord = z.infer<typeof DismissalRecordSchema>;

const BaseProgressLogEntrySchema = z.object({
  timestamp: z.string(),
});

export const MissionAcceptedEntrySchema = BaseProgressLogEntrySchema.extend({
  type: z.literal(ProgressLogEntryType.MissionAccepted),
  title: z.string(),
}).passthrough();

export type MissionAcceptedEntry = z.infer<typeof MissionAcceptedEntrySchema>;

export const MissionPausedEntrySchema = BaseProgressLogEntrySchema.extend({
  type: z.literal(ProgressLogEntryType.MissionPaused),
}).passthrough();

export type MissionPausedEntry = z.infer<typeof MissionPausedEntrySchema>;

export const MissionResumedEntrySchema = BaseProgressLogEntrySchema.extend({
  type: z.literal(ProgressLogEntryType.MissionResumed),
}).passthrough();

export type MissionResumedEntry = z.infer<typeof MissionResumedEntrySchema>;

export const MissionRunStartedEntrySchema = BaseProgressLogEntrySchema.extend({
  type: z.literal(ProgressLogEntryType.MissionRunStarted),
  message: z.string().optional(),
}).passthrough();

export type MissionRunStartedEntry = z.infer<
  typeof MissionRunStartedEntrySchema
>;

export const WorkerStartedEntrySchema = BaseProgressLogEntrySchema.extend({
  type: z.literal(ProgressLogEntryType.WorkerStarted),
  workerSessionId: z.string(),
  spawnId: z.string(),
  featureId: z.string().optional(),
}).passthrough();

export type WorkerStartedEntry = z.infer<typeof WorkerStartedEntrySchema>;

export const WorkerSelectedFeatureEntrySchema =
  BaseProgressLogEntrySchema.extend({
    type: z.literal(ProgressLogEntryType.WorkerSelectedFeature),
    workerSessionId: z.string(),
    featureId: z.string(),
  }).passthrough();

export type WorkerSelectedFeatureEntry = z.infer<
  typeof WorkerSelectedFeatureEntrySchema
>;

export const WorkerCompletedEntrySchema = BaseProgressLogEntrySchema.extend({
  type: z.literal(ProgressLogEntryType.WorkerCompleted),
  workerSessionId: z.string(),
  featureId: z.string(),
  successState: FeatureSuccessStateSchema,
  returnToOrchestrator: z.boolean(),
  commitId: z.string().optional(),
  exitCode: z.number(),
  validatorsPassed: z.boolean().optional(),
  handoff: HandoffSchema.optional(),
}).passthrough();

export type WorkerCompletedEntry = z.infer<typeof WorkerCompletedEntrySchema>;

export const WorkerFailedEntrySchema = BaseProgressLogEntrySchema.extend({
  type: z.literal(ProgressLogEntryType.WorkerFailed),
  workerSessionId: z.string().optional(),
  spawnId: z.string(),
  exitCode: z.number().optional(),
  reason: z.string(),
}).passthrough();

export type WorkerFailedEntry = z.infer<typeof WorkerFailedEntrySchema>;

export const WorkerPausedEntrySchema = BaseProgressLogEntrySchema.extend({
  type: z.literal(ProgressLogEntryType.WorkerPaused),
  workerSessionId: z.string(),
  featureId: z.string().optional(),
}).passthrough();

export type WorkerPausedEntry = z.infer<typeof WorkerPausedEntrySchema>;

export const HandoffItemsDismissedEntrySchema =
  BaseProgressLogEntrySchema.extend({
    type: z.literal(ProgressLogEntryType.HandoffItemsDismissed),
    dismissals: z.array(DismissalRecordSchema).optional(),
  }).passthrough();

export type HandoffItemsDismissedEntry = z.infer<
  typeof HandoffItemsDismissedEntrySchema
>;

export const MilestoneValidationTriggeredEntrySchema =
  BaseProgressLogEntrySchema.extend({
    type: z.literal(ProgressLogEntryType.MilestoneValidationTriggered),
    milestone: z.string(),
    featureId: z.string(),
  }).passthrough();

export type MilestoneValidationTriggeredEntry = z.infer<
  typeof MilestoneValidationTriggeredEntrySchema
>;

/** Discriminated union over all 11 progress log entry types. */
export const ProgressLogEntrySchema = z.discriminatedUnion('type', [
  MissionAcceptedEntrySchema,
  MissionPausedEntrySchema,
  MissionResumedEntrySchema,
  MissionRunStartedEntrySchema,
  WorkerStartedEntrySchema,
  WorkerSelectedFeatureEntrySchema,
  WorkerCompletedEntrySchema,
  WorkerFailedEntrySchema,
  WorkerPausedEntrySchema,
  HandoffItemsDismissedEntrySchema,
  MilestoneValidationTriggeredEntrySchema,
]);

export type ProgressLogEntry = z.infer<typeof ProgressLogEntrySchema>;
