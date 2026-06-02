// Barrel for the protocol source-of-truth modules.
// These files mirror the private factory-mono-alpha protocol exactly and are
// intentionally self-contained (zod-only). NOT yet wired into the public
// package API (src/index.ts).

export * from './constants.js';
export * from './enums.js';
export * from './json-rpc.js';
export * from './host.js';
export * from './session.js';
export * from './session-source.js';
export * from './messages.js';
export * from './model-settings.js';
export * from './settings.js';
export * from './general-settings.js';
export * from './loop.js';
export * from './selectable-list-item.js';
export * from './custom-models.js';
export * from './mcp.js';
export * from './mission-decomposition.js';
export * from './cli.js';
export * from './client.js';

// TIER-4d aux leaves
export * from './automations-enums.js';
export * from './automations.js';
export * from './session-summary.js';
export * from './session-tools.js';
export * from './session-settings-schema.js';
export * from './session-settings-types.js';
export * from './policy.js';
export * from './tools-enums.js';
export * from './tools.js';
export * from './updater.js';

// `./usage.js` defines its own `TokenUsageSchema` whose shape (snake-cased
// integer fields) differs from the one in `./session.js`. Both upstream
// modules ship the same symbol name (`TokenUsageSchema`) under different
// folder namespaces, so we mirror that here by re-exporting `./usage.js`
// under a namespace alias rather than as a top-level wildcard.
export * as usage from './usage.js';

export * as daemon from './daemon/index.js';
