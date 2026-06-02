import { z } from 'zod';

export const HostIdSchema = z.string().uuid();

const ComputerRegistrationSchema = z.object({
  computerId: z.string().uuid(),
  firestoreOrgId: z.string().min(1),
  userId: z.string().min(1),
  registeredAt: z.number(),
});

export const HostConfigSchema = z.object({
  schemaVersion: z.literal(1), // when we need to bump the version, make this a discriminated union of v1 vs v2 schemas
  hostId: HostIdSchema,
  createdAt: z.number(),
  computerRegistration: ComputerRegistrationSchema.optional(),
});

export const LegacyComputerConfigSchema = z.object({
  computerId: z.string().uuid(),
  registeredAt: z.number(),
});

export type ComputerRegistration = z.infer<typeof ComputerRegistrationSchema>;
export type HostConfig = z.infer<typeof HostConfigSchema>;
export type LegacyComputerConfig = z.infer<typeof LegacyComputerConfigSchema>;
export type ResolvedComputerRegistration = Omit<
  ComputerRegistration,
  'registeredAt'
>;

export type ResolvedHostIdentity = {
  hostId: string;
  computerRegistration?: ResolvedComputerRegistration;
};
