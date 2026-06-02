// Mission and subagent model-settings schemas.

import { z } from 'zod';

import { ReasoningEffort } from './enums.js';

const ReasoningEffortSchema = z.nativeEnum(ReasoningEffort);

export const MissionModelSettingsSchema = z.object({
  workerModel: z.string().optional(),
  workerReasoningEffort: ReasoningEffortSchema.optional(),
  validationWorkerModel: z.string().optional(),
  validationWorkerReasoningEffort: ReasoningEffortSchema.optional(),
  skipScrutiny: z.boolean().optional(),
  skipUserTesting: z.boolean().optional(),
});

export const SubagentModelSettingsSchema = z.object({
  lightModel: z.string().optional(),
  lightReasoningEffort: ReasoningEffortSchema.optional(),
  mediumModel: z.string().optional(),
  mediumReasoningEffort: ReasoningEffortSchema.optional(),
  heavyModel: z.string().optional(),
  heavyReasoningEffort: ReasoningEffortSchema.optional(),
});

export type MissionModelSettings = z.infer<typeof MissionModelSettingsSchema>;
export type SubagentModelSettings = z.infer<typeof SubagentModelSettingsSchema>;
