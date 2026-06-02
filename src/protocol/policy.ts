import { z } from 'zod';

import { ModelID } from './enums.js';

/**
 * A lenient model ID array that silently drops unrecognized values instead of
 * failing validation. Ensures backward compatibility when ModelID enum values
 * are removed — persisted policies referencing old IDs filter them out rather
 * than failing to parse.
 */
const modelIdValues: ReadonlySet<string> = new Set(Object.values(ModelID));
const tolerantModelIdArray = z
  .array(z.string())
  .transform((ids) => ids.filter((id): id is ModelID => modelIdValues.has(id)));

export const UserModelPolicySchema = z.object({
  allowedModelIds: tolerantModelIdArray,
  blockedModelIds: tolerantModelIdArray,
});
