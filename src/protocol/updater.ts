import { z } from 'zod';

/**
 * Schema for a resolved binary download plan.
 * Contains a version and fully-qualified URLs for the binary and its checksum.
 * Used by both the backend API response and internal provisioning.
 */
export const BinaryDownloadPlanSchema = z.object({
  version: z.string(),
  binaryUrl: z.string(),
  checksumUrl: z.string(),
});
