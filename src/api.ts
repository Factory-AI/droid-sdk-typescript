import {
  ComputerListResponseSchema,
  ComputerMetricsResponseSchema,
  ComputerSchema,
  MachineTemplateListResponseSchema,
  MachineTemplateSchema,
  RefreshComputerResponseSchema,
  RemoteSessionListResponseSchema,
} from './api-types.js';
import type {
  Computer,
  ComputerListResponse,
  ComputerMetricsResponse,
  CreateComputerOptions,
  DeleteComputerOptions,
  GetComputerByNameOptions,
  GetComputerMetricsOptions,
  GetComputerOptions,
  GetMachineTemplateOptions,
  ListComputersOptions,
  ListMachineTemplatesOptions,
  ListRemoteSessionsOptions,
  MachineTemplate,
  MachineTemplateListResponse,
  RefreshComputerOptions,
  RefreshComputerResponse,
  RemoteSessionListResponse,
  RestartComputerOptions,
  RetryInstallDepsOptions,
  UpdateComputerOptions,
} from './api-types.js';
import { ConnectionError, ProtocolError } from './errors.js';
import { isRecord } from './utils.js';

const DEFAULT_BASE_URL = 'https://api.factory.ai';

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
}

function extractErrorMessage(body: unknown, status: number): string {
  if (isRecord(body) && typeof body['error'] === 'string') {
    return body['error'];
  }
  return `Factory API error (status ${status})`;
}

async function factoryFetch(
  path: string,
  apiKey: string,
  baseUrl?: string,
  options?: FetchOptions
): Promise<unknown> {
  const url = `${baseUrl ?? DEFAULT_BASE_URL}${path}`;
  const method = options?.method ?? 'GET';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers,
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (error) {
    throw new ConnectionError(
      `Failed to reach Factory API: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (response.status === 204) {
    return undefined;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ProtocolError(
      `Factory API returned non-JSON response (status ${response.status})`
    );
  }

  if (!response.ok) {
    const message = extractErrorMessage(body, response.status);

    if (response.status === 401 || response.status === 403) {
      throw new ProtocolError(`Invalid or expired API key: ${message}`, {
        code: response.status,
      });
    }

    throw new ProtocolError(message, { code: response.status });
  }

  return body;
}

export async function listMachineTemplates(
  options: ListMachineTemplatesOptions
): Promise<MachineTemplateListResponse> {
  const params = new URLSearchParams();
  if (options.limit != null) {
    params.set('limit', String(options.limit));
  }
  if (options.cursor != null) {
    params.set('cursor', options.cursor);
  }
  const query = params.toString();
  const path = `/api/v0/machines/templates${query ? `?${query}` : ''}`;

  const body = await factoryFetch(path, options.apiKey, options.baseUrl);
  const parsed = MachineTemplateListResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProtocolError(
      `Unexpected response format from Factory API: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export async function getMachineTemplate(
  options: GetMachineTemplateOptions
): Promise<MachineTemplate> {
  const path = `/api/v0/machines/templates/${encodeURIComponent(options.templateId)}`;

  const body = await factoryFetch(path, options.apiKey, options.baseUrl);
  const parsed = MachineTemplateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProtocolError(
      `Unexpected response format from Factory API: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export async function listComputers(
  options: ListComputersOptions
): Promise<ComputerListResponse> {
  const path = '/api/v0/computers';

  const body = await factoryFetch(path, options.apiKey, options.baseUrl);
  const parsed = ComputerListResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProtocolError(
      `Unexpected response format from Factory API: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export async function getComputer(
  options: GetComputerOptions
): Promise<Computer> {
  const path = `/api/v0/computers/${encodeURIComponent(options.computerId)}`;

  const body = await factoryFetch(path, options.apiKey, options.baseUrl);
  const parsed = ComputerSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProtocolError(
      `Unexpected response format from Factory API: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export async function createComputer(
  options: CreateComputerOptions
): Promise<Computer> {
  const path = '/api/v0/computers';
  const reqBody: Record<string, unknown> = {
    name: options.name,
    remoteUser: options.remoteUser,
  };
  if (options.provider != null) reqBody['provider'] = options.provider;
  if (options.hostId != null) reqBody['hostId'] = options.hostId;
  if (options.repos != null) reqBody['repos'] = options.repos;
  if (options.autoInstallDeps != null)
    reqBody['autoInstallDeps'] = options.autoInstallDeps;
  if (options.serviceAccountId != null)
    reqBody['serviceAccountId'] = options.serviceAccountId;

  const body = await factoryFetch(path, options.apiKey, options.baseUrl, {
    method: 'POST',
    body: reqBody,
  });
  const parsed = ComputerSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProtocolError(
      `Unexpected response format from Factory API: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export async function getComputerByName(
  options: GetComputerByNameOptions
): Promise<Computer> {
  const path = `/api/v0/computers/name/${encodeURIComponent(options.name)}`;

  const body = await factoryFetch(path, options.apiKey, options.baseUrl);
  const parsed = ComputerSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProtocolError(
      `Unexpected response format from Factory API: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export async function updateComputer(
  options: UpdateComputerOptions
): Promise<Computer> {
  const path = `/api/v0/computers/${encodeURIComponent(options.computerId)}`;
  const reqBody: Record<string, unknown> = {};
  if (options.name != null) reqBody['name'] = options.name;
  if (options.remoteUser != null) reqBody['remoteUser'] = options.remoteUser;
  if (options.hostId != null) reqBody['hostId'] = options.hostId;

  const body = await factoryFetch(path, options.apiKey, options.baseUrl, {
    method: 'PATCH',
    body: reqBody,
  });
  const parsed = ComputerSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProtocolError(
      `Unexpected response format from Factory API: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export async function deleteComputer(
  options: DeleteComputerOptions
): Promise<void> {
  const path = `/api/v0/computers/${encodeURIComponent(options.computerId)}`;

  await factoryFetch(path, options.apiKey, options.baseUrl, {
    method: 'DELETE',
  });
}

export async function restartComputer(
  options: RestartComputerOptions
): Promise<void> {
  const path = `/api/v0/computers/${encodeURIComponent(options.computerId)}/restart`;

  await factoryFetch(path, options.apiKey, options.baseUrl, {
    method: 'POST',
  });
}

export async function refreshComputer(
  options: RefreshComputerOptions
): Promise<RefreshComputerResponse> {
  const path = `/api/v0/computers/${encodeURIComponent(options.computerId)}/refresh`;

  const body = await factoryFetch(path, options.apiKey, options.baseUrl, {
    method: 'POST',
  });
  const parsed = RefreshComputerResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProtocolError(
      `Unexpected response format from Factory API: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export async function getComputerMetrics(
  options: GetComputerMetricsOptions
): Promise<ComputerMetricsResponse> {
  const params = new URLSearchParams();
  if (options.start != null) {
    params.set('start', options.start);
  }
  const query = params.toString();
  const path = `/api/v0/computers/${encodeURIComponent(options.computerId)}/metrics${query ? `?${query}` : ''}`;

  const body = await factoryFetch(path, options.apiKey, options.baseUrl);
  const parsed = ComputerMetricsResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProtocolError(
      `Unexpected response format from Factory API: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export async function retryInstallDeps(
  options: RetryInstallDepsOptions
): Promise<Computer> {
  const path = `/api/v0/computers/${encodeURIComponent(options.computerId)}/install-deps`;

  const body = await factoryFetch(path, options.apiKey, options.baseUrl, {
    method: 'POST',
  });
  const parsed = ComputerSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProtocolError(
      `Unexpected response format from Factory API: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export async function listRemoteSessions(
  options: ListRemoteSessionsOptions
): Promise<RemoteSessionListResponse> {
  const params = new URLSearchParams();
  if (options.computerId != null) {
    params.set('computerId', options.computerId);
  }
  if (options.limit != null) {
    params.set('limit', String(options.limit));
  }
  if (options.cursor != null) {
    params.set('cursor', options.cursor);
  }
  const query = params.toString();
  const path = `/api/v0/sessions${query ? `?${query}` : ''}`;

  const body = await factoryFetch(path, options.apiKey, options.baseUrl);
  const parsed = RemoteSessionListResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProtocolError(
      `Unexpected response format from Factory API: ${parsed.error.message}`
    );
  }
  return parsed.data;
}
