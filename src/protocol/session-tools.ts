import { z } from 'zod';

export const GenericToolExecutionOutputSchema = z.union([
  z.record(z.string(), z.any()),
  z.string(),
  z.array(z.union([z.string(), z.record(z.string(), z.any())])),
]);

export type GenericToolExecutionOutput = z.infer<
  typeof GenericToolExecutionOutputSchema
>;
