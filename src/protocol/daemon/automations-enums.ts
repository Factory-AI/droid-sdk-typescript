// Re-export from the hoisted top-level automations enums module so daemon
// consumers continue to import `AutomationPrivacyLevel` from this path while
// the canonical definition lives at `src/protocol/automations-enums.ts`.
export * from '../automations-enums.js';
