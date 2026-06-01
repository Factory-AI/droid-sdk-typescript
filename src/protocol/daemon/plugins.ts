import z from 'zod';

import { JsonRpcBaseRequestSchema } from '../json-rpc.js';
import { DaemonDroidMethod } from './enums.js';

// Local mirror of the marketplace source schema from
// factory-mono-alpha/packages/common/src/settings/schema.ts. Inlined here
// because the full settings schema is not yet ported into the public SDK.
// CRITICAL: keep this distinct from `RedactedMarketplaceSourceSchema` below —
// the redacted variant intentionally omits filesystem paths and userinfo for
// RPC responses, and collapsing the two would risk credential leakage.
const GitHubMarketplaceSourceSchema = z.object({
  source: z.literal('github'),
  repo: z.string(),
});

const UrlMarketplaceSourceSchema = z.object({
  source: z.literal('url'),
  url: z.string(),
});

const LocalMarketplaceSourceSchema = z.object({
  source: z.literal('local'),
  path: z.string(),
});

const GitSubdirMarketplaceSourceSchema = z.object({
  source: z.literal('git-subdir'),
  url: z.string(),
  path: z.string(),
});

export const MarketplaceSourceSchema = z.discriminatedUnion('source', [
  GitHubMarketplaceSourceSchema,
  UrlMarketplaceSourceSchema,
  LocalMarketplaceSourceSchema,
  GitSubdirMarketplaceSourceSchema,
]);

// ── LIST_AVAILABLE_PLUGINS ───────────────────────────────────────────

const DaemonListAvailablePluginsRequestParamsSchema = z.object({
  sessionId: z.string(),
});

export const DaemonListAvailablePluginsRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.LIST_AVAILABLE_PLUGINS),
    params: DaemonListAvailablePluginsRequestParamsSchema,
  });

export const DaemonListAvailablePluginsResultSchema = z.object({
  plugins: z.array(
    z.object({
      name: z.string(),
      marketplace: z.string(),
      description: z.string().optional(),
    })
  ),
});

// ── LIST_INSTALLED_PLUGINS ───────────────────────────────────────────

const DaemonListInstalledPluginsRequestParamsSchema = z.object({
  sessionId: z.string(),
  scope: z.string().optional(),
});

export const DaemonListInstalledPluginsRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.LIST_INSTALLED_PLUGINS),
    params: DaemonListInstalledPluginsRequestParamsSchema,
  });

export const DaemonListInstalledPluginsResultSchema = z.object({
  plugins: z.array(
    z.object({
      id: z.string(),
      scope: z.string(),
      version: z.string(),
      installPath: z.string(),
      installedAt: z.string(),
      lastUpdated: z.string(),
      source: z.string(),
    })
  ),
});

// ── INSTALL_PLUGIN ───────────────────────────────────────────────────

const DaemonInstallPluginRequestParamsSchema = z.object({
  sessionId: z.string(),
  marketplace: z.string(),
  pluginName: z.string(),
  scope: z.string(),
});

export const DaemonInstallPluginRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonDroidMethod.INSTALL_PLUGIN),
    params: DaemonInstallPluginRequestParamsSchema,
  }
);

export const DaemonInstallPluginResultSchema = z.object({
  success: z.boolean(),
  pluginId: z.string().optional(),
  error: z.string().optional(),
});

// ── UNINSTALL_PLUGIN ─────────────────────────────────────────────────

const DaemonUninstallPluginRequestParamsSchema = z.object({
  sessionId: z.string(),
  pluginId: z.string(),
  scope: z.string(),
});

export const DaemonUninstallPluginRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.UNINSTALL_PLUGIN),
    params: DaemonUninstallPluginRequestParamsSchema,
  });

export const DaemonUninstallPluginResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

// ── UPDATE_PLUGIN ────────────────────────────────────────────────────

const DaemonUpdatePluginRequestParamsSchema = z.object({
  sessionId: z.string(),
  pluginId: z.string().optional(),
  scope: z.string().optional(),
});

export const DaemonUpdatePluginRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.UPDATE_PLUGIN),
  params: DaemonUpdatePluginRequestParamsSchema,
});

export const DaemonUpdatePluginResultSchema = z.object({
  results: z.array(
    z.object({
      pluginId: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    })
  ),
});

// ── LIST_MARKETPLACES ────────────────────────────────────────────────

const DaemonListMarketplacesRequestParamsSchema = z.object({
  sessionId: z.string(),
});

export const DaemonListMarketplacesRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.LIST_MARKETPLACES),
    params: DaemonListMarketplacesRequestParamsSchema,
  });

// Redacted marketplace source shape for RPC responses. Unlike
// `MarketplaceSourceSchema`, this intentionally omits filesystem paths for
// `local` sources and expects URLs for `url` / `git-subdir` sources to be
// scrubbed of credential userinfo before crossing the RPC boundary.
export const RedactedMarketplaceSourceSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('github'),
    repo: z.string(),
  }),
  z.object({
    source: z.literal('url'),
    url: z.string(),
  }),
  z.object({
    source: z.literal('local'),
  }),
  z.object({
    source: z.literal('git-subdir'),
    url: z.string(),
    path: z.string(),
  }),
]);

export const DaemonListMarketplacesResultSchema = z.object({
  marketplaces: z.array(
    z.object({
      name: z.string(),
      source: RedactedMarketplaceSourceSchema,
      pluginCount: z.number(),
      autoUpdate: z.boolean(),
    })
  ),
});

// ── ADD_MARKETPLACE ──────────────────────────────────────────────────

const DaemonAddMarketplaceRequestParamsSchema = z.object({
  sessionId: z.string(),
  source: MarketplaceSourceSchema,
});

export const DaemonAddMarketplaceRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.ADD_MARKETPLACE),
    params: DaemonAddMarketplaceRequestParamsSchema,
  });

export const DaemonAddMarketplaceResultSchema = z.object({
  success: z.boolean(),
  name: z.string().optional(),
  error: z.string().optional(),
});

// ── REMOVE_MARKETPLACE ───────────────────────────────────────────────

const DaemonRemoveMarketplaceRequestParamsSchema = z.object({
  sessionId: z.string(),
  name: z.string(),
});

export const DaemonRemoveMarketplaceRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.REMOVE_MARKETPLACE),
    params: DaemonRemoveMarketplaceRequestParamsSchema,
  });

export const DaemonRemoveMarketplaceResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

// ── UPDATE_MARKETPLACE ───────────────────────────────────────────────

const DaemonUpdateMarketplaceRequestParamsSchema = z.object({
  sessionId: z.string(),
  name: z.string().optional(),
});

export const DaemonUpdateMarketplaceRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.UPDATE_MARKETPLACE),
    params: DaemonUpdateMarketplaceRequestParamsSchema,
  });

export const DaemonUpdateMarketplaceResultSchema = z.object({
  results: z.array(
    z.object({
      name: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    })
  ),
});
