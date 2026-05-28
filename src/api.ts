import {
  ComputerListResponseSchema,
  ComputerSchema,
  CreateSandboxResponseSchema,
  MachineTemplateListResponseSchema,
  MachineTemplateSchema,
} from './api-types.js';
import type {
  Computer,
  ComputerListResponse,
  CreateSandboxOptions,
  CreateSandboxResponse,
  GetComputerOptions,
  GetMachineTemplateOptions,
  ListComputersOptions,
  ListMachineTemplatesOptions,
  MachineTemplate,
  MachineTemplateListResponse,
} from './api-types.js';
import { ConnectionError, ProtocolError } from './errors.js';
import { isRecord } from './utils.js';

const DEFAULT_BASE_URL = 'https://api.factory.ai';

interface FetchOptions {
  method?: 'GET' | 'POST';
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

export async function createSandbox(
  options: CreateSandboxOptions
): Promise<CreateSandboxResponse> {
  const path = `/api/workspaces/${encodeURIComponent(options.workspaceId)}/sandbox/create`;

  const body = await factoryFetch(path, options.apiKey, options.baseUrl, {
    method: 'POST',
    body: {},
  });
  const parsed = CreateSandboxResponseSchema.safeParse(body);
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
