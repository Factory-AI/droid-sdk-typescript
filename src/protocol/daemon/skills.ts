import z from 'zod';

import { SkillInfoSchema } from '../client.js';
import { JsonRpcBaseRequestSchema } from '../json-rpc.js';
import { DaemonDroidMethod } from './enums.js';

// LIST_SKILLS - get all available skills for a session
const DaemonListSkillsRequestParamsSchema = z.object({
  sessionId: z.string(),
});

export const DaemonListSkillsRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.LIST_SKILLS),
  params: DaemonListSkillsRequestParamsSchema,
});

export const DaemonListSkillsResultSchema = z.object({
  skills: z.array(SkillInfoSchema),
});
