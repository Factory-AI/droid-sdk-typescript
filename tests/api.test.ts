import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  listMachineTemplates,
  getMachineTemplate,
  listComputers,
  getComputer,
  createComputer,
  getComputerByName,
  updateComputer,
  deleteComputer,
  restartComputer,
  refreshComputer,
  getComputerMetrics,
  retryInstallDeps,
  listRemoteSessions,
} from '../src/api.js';
import { ConnectionError, ProtocolError } from '../src/errors.js';

const MOCK_TEMPLATE = {
  templateId: 'tmpl-001',
  repoUrl: 'https://github.com/org/repo',
  templateName: 'my-backend',
  defaultBranch: 'main',
  createdBy: 'user-123',
  createdAt: 1700000000000,
  buildStatus: { status: 'success' as const, builtAt: 1700000060000 },
  lastUpdatedAt: 1700000060000,
};

const MOCK_LIST_RESPONSE = {
  templates: [MOCK_TEMPLATE],
  pagination: { hasMore: false, nextCursor: null },
};

function mockFetch(
  status: number,
  body: unknown,
  options?: { throwError?: Error }
) {
  return vi.fn().mockImplementation(() => {
    if (options?.throwError) {
      return Promise.reject(options.throwError);
    }
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  });
}

describe('listMachineTemplates', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the correct URL with auth header', async () => {
    const fetchMock = mockFetch(200, MOCK_LIST_RESPONSE);
    globalThis.fetch = fetchMock;

    await listMachineTemplates({ apiKey: 'fk-test-key' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.factory.ai/api/v0/machines/templates');
    expect(init.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer fk-test-key' })
    );
  });

  it('returns templates and pagination', async () => {
    globalThis.fetch = mockFetch(200, MOCK_LIST_RESPONSE);

    const result = await listMachineTemplates({ apiKey: 'fk-test-key' });

    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].templateId).toBe('tmpl-001');
    expect(result.templates[0].templateName).toBe('my-backend');
    expect(result.pagination.hasMore).toBe(false);
  });

  it('passes limit and cursor as query params', async () => {
    const fetchMock = mockFetch(200, MOCK_LIST_RESPONSE);
    globalThis.fetch = fetchMock;

    await listMachineTemplates({
      apiKey: 'fk-test-key',
      limit: 5,
      cursor: 'abc',
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('limit=5');
    expect(url).toContain('cursor=abc');
  });

  it('omits query string when no limit or cursor', async () => {
    const fetchMock = mockFetch(200, MOCK_LIST_RESPONSE);
    globalThis.fetch = fetchMock;

    await listMachineTemplates({ apiKey: 'fk-test-key' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('?');
  });

  it('uses custom baseUrl', async () => {
    const fetchMock = mockFetch(200, MOCK_LIST_RESPONSE);
    globalThis.fetch = fetchMock;

    await listMachineTemplates({
      apiKey: 'fk-test-key',
      baseUrl: 'https://api.eu.factory.ai',
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url.startsWith('https://api.eu.factory.ai/')).toBe(true);
  });

  it('throws ProtocolError on 401', async () => {
    globalThis.fetch = mockFetch(401, { error: 'Unauthorized' });

    await expect(listMachineTemplates({ apiKey: 'bad-key' })).rejects.toThrow(
      ProtocolError
    );

    await expect(listMachineTemplates({ apiKey: 'bad-key' })).rejects.toThrow(
      /Invalid or expired API key/
    );
  });

  it('throws ProtocolError on 403', async () => {
    globalThis.fetch = mockFetch(403, { error: 'Forbidden' });

    await expect(listMachineTemplates({ apiKey: 'bad-key' })).rejects.toThrow(
      ProtocolError
    );
  });

  it('throws ProtocolError on 500 with error message', async () => {
    globalThis.fetch = mockFetch(500, { error: 'Internal server error' });

    await expect(
      listMachineTemplates({ apiKey: 'fk-test-key' })
    ).rejects.toThrow('Internal server error');
  });

  it('throws ProtocolError on 500 without error message', async () => {
    globalThis.fetch = mockFetch(500, {});

    await expect(
      listMachineTemplates({ apiKey: 'fk-test-key' })
    ).rejects.toThrow(/Factory API error/);
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(
      listMachineTemplates({ apiKey: 'fk-test-key' })
    ).rejects.toThrow(ConnectionError);

    await expect(
      listMachineTemplates({ apiKey: 'fk-test-key' })
    ).rejects.toThrow(/Failed to reach Factory API/);
  });

  it('throws ProtocolError on non-JSON response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    });

    await expect(
      listMachineTemplates({ apiKey: 'fk-test-key' })
    ).rejects.toThrow(ProtocolError);

    await expect(
      listMachineTemplates({ apiKey: 'fk-test-key' })
    ).rejects.toThrow(/non-JSON response/);
  });
});

describe('getMachineTemplate', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the correct URL with templateId', async () => {
    const fetchMock = mockFetch(200, MOCK_TEMPLATE);
    globalThis.fetch = fetchMock;

    await getMachineTemplate({
      apiKey: 'fk-test-key',
      templateId: 'tmpl-001',
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      'https://api.factory.ai/api/v0/machines/templates/tmpl-001'
    );
  });

  it('returns the template with all fields', async () => {
    const fullTemplate = {
      ...MOCK_TEMPLATE,
      environmentVariables: [{ key: 'NODE_ENV', value: 'production' }],
      setupScript: 'npm install',
    };
    globalThis.fetch = mockFetch(200, fullTemplate);

    const result = await getMachineTemplate({
      apiKey: 'fk-test-key',
      templateId: 'tmpl-001',
    });

    expect(result.templateId).toBe('tmpl-001');
    expect(result.environmentVariables).toEqual([
      { key: 'NODE_ENV', value: 'production' },
    ]);
    expect(result.setupScript).toBe('npm install');
  });

  it('encodes templateId in the URL', async () => {
    const fetchMock = mockFetch(200, {
      ...MOCK_TEMPLATE,
      templateId: 'id/with/slashes',
    });
    globalThis.fetch = fetchMock;

    await getMachineTemplate({
      apiKey: 'fk-test-key',
      templateId: 'id/with/slashes',
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('id%2Fwith%2Fslashes');
  });

  it('throws ProtocolError on 404', async () => {
    globalThis.fetch = mockFetch(404, { error: 'Not found' });

    await expect(
      getMachineTemplate({ apiKey: 'fk-test-key', templateId: 'missing' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on 401', async () => {
    globalThis.fetch = mockFetch(401, { error: 'Unauthorized' });

    await expect(
      getMachineTemplate({ apiKey: 'bad-key', templateId: 'tmpl-001' })
    ).rejects.toThrow(/Invalid or expired API key/);
  });

  it('uses custom baseUrl', async () => {
    const fetchMock = mockFetch(200, MOCK_TEMPLATE);
    globalThis.fetch = fetchMock;

    await getMachineTemplate({
      apiKey: 'fk-test-key',
      templateId: 'tmpl-001',
      baseUrl: 'https://preprod.api.factory.ai',
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url.startsWith('https://preprod.api.factory.ai/')).toBe(true);
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(
      getMachineTemplate({ apiKey: 'fk-test-key', templateId: 'tmpl-001' })
    ).rejects.toThrow(ConnectionError);
  });
});

const MOCK_COMPUTER = {
  id: 'comp-001',
  name: 'my-dev-box',
  hostname: 'dev-box.local',
  providerType: 'e2b' as const,
  status: 'active' as const,
  createdAt: 1700000000000,
  relayClientUrl: 'wss://relay.factory.ai/v0/computer/comp-001/client',
  remoteUser: 'factory-user',
};

const MOCK_COMPUTER_LIST_RESPONSE = {
  computers: [MOCK_COMPUTER],
};

describe('listComputers', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the correct URL with auth header', async () => {
    const fetchMock = mockFetch(200, MOCK_COMPUTER_LIST_RESPONSE);
    globalThis.fetch = fetchMock;

    await listComputers({ apiKey: 'fk-test-key' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.factory.ai/api/v0/computers');
    expect(init.headers['Authorization']).toBe('Bearer fk-test-key');
    expect(init.method).toBe('GET');
  });

  it('uses custom baseUrl', async () => {
    const fetchMock = mockFetch(200, MOCK_COMPUTER_LIST_RESPONSE);
    globalThis.fetch = fetchMock;

    await listComputers({
      apiKey: 'fk-test-key',
      baseUrl: 'https://custom.factory.ai',
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://custom.factory.ai/api/v0/computers');
  });

  it('parses response correctly', async () => {
    globalThis.fetch = mockFetch(200, MOCK_COMPUTER_LIST_RESPONSE);

    const result = await listComputers({ apiKey: 'fk-test-key' });

    expect(result.computers).toHaveLength(1);
    expect(result.computers[0]!.id).toBe('comp-001');
    expect(result.computers[0]!.name).toBe('my-dev-box');
    expect(result.computers[0]!.status).toBe('active');
    expect(result.computers[0]!.providerType).toBe('e2b');
  });

  it('handles empty computer list', async () => {
    globalThis.fetch = mockFetch(200, { computers: [] });

    const result = await listComputers({ apiKey: 'fk-test-key' });

    expect(result.computers).toHaveLength(0);
  });

  it('throws ProtocolError on 401', async () => {
    globalThis.fetch = mockFetch(401, { error: 'Unauthorized' });

    await expect(listComputers({ apiKey: 'fk-bad-key' })).rejects.toThrow(
      ProtocolError
    );
  });

  it('throws ProtocolError on unexpected response shape', async () => {
    globalThis.fetch = mockFetch(200, { unexpected: 'data' });

    await expect(listComputers({ apiKey: 'fk-test-key' })).rejects.toThrow(
      /Unexpected response format/
    );
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(listComputers({ apiKey: 'fk-test-key' })).rejects.toThrow(
      ConnectionError
    );
  });
});

describe('getComputer', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the correct URL with computerId', async () => {
    const fetchMock = mockFetch(200, MOCK_COMPUTER);
    globalThis.fetch = fetchMock;

    await getComputer({ apiKey: 'fk-test-key', computerId: 'comp-001' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.factory.ai/api/v0/computers/comp-001');
    expect(init.headers['Authorization']).toBe('Bearer fk-test-key');
  });

  it('encodes computerId in URL', async () => {
    const fetchMock = mockFetch(200, {
      ...MOCK_COMPUTER,
      id: 'comp/special',
    });
    globalThis.fetch = fetchMock;

    await getComputer({
      apiKey: 'fk-test-key',
      computerId: 'comp/special',
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.factory.ai/api/v0/computers/comp%2Fspecial');
  });

  it('parses response correctly', async () => {
    globalThis.fetch = mockFetch(200, MOCK_COMPUTER);

    const result = await getComputer({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
    });

    expect(result.id).toBe('comp-001');
    expect(result.name).toBe('my-dev-box');
    expect(result.hostname).toBe('dev-box.local');
    expect(result.providerType).toBe('e2b');
    expect(result.status).toBe('active');
    expect(result.createdAt).toBe(1700000000000);
  });

  it('handles computer without optional fields', async () => {
    globalThis.fetch = mockFetch(200, {
      id: 'comp-002',
      name: 'minimal',
      providerType: 'byom',
      createdAt: 1700000000000,
    });

    const result = await getComputer({
      apiKey: 'fk-test-key',
      computerId: 'comp-002',
    });

    expect(result.id).toBe('comp-002');
    expect(result.hostname).toBeUndefined();
    expect(result.status).toBeUndefined();
  });

  it('throws ProtocolError on 401', async () => {
    globalThis.fetch = mockFetch(401, { error: 'Unauthorized' });

    await expect(
      getComputer({ apiKey: 'fk-bad-key', computerId: 'comp-001' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on 404', async () => {
    globalThis.fetch = mockFetch(404, { error: 'Computer not found' });

    await expect(
      getComputer({ apiKey: 'fk-test-key', computerId: 'nonexistent' })
    ).rejects.toThrow('Computer not found');
  });

  it('throws ProtocolError on unexpected response shape', async () => {
    globalThis.fetch = mockFetch(200, { unexpected: 'data' });

    await expect(
      getComputer({ apiKey: 'fk-test-key', computerId: 'comp-001' })
    ).rejects.toThrow(/Unexpected response format/);
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(
      getComputer({ apiKey: 'fk-test-key', computerId: 'comp-001' })
    ).rejects.toThrow(ConnectionError);
  });
});

describe('createComputer', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the correct URL with POST and body', async () => {
    const fetchMock = mockFetch(200, MOCK_COMPUTER);
    globalThis.fetch = fetchMock;

    await createComputer({
      apiKey: 'fk-test-key',
      name: 'my-dev-box',
      remoteUser: 'factory-user',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.factory.ai/api/v0/computers');
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer fk-test-key');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.name).toBe('my-dev-box');
    expect(body.remoteUser).toBe('factory-user');
  });

  it('passes optional fields in request body', async () => {
    const fetchMock = mockFetch(200, MOCK_COMPUTER);
    globalThis.fetch = fetchMock;

    await createComputer({
      apiKey: 'fk-test-key',
      name: 'my-dev-box',
      remoteUser: 'factory-user',
      provider: 'e2b',
      hostId: '11111111-1111-4111-8111-111111111111',
      repos: ['https://github.com/org/repo'],
      autoInstallDeps: true,
      serviceAccountId: 'sa-001',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.provider).toBe('e2b');
    expect(body.hostId).toBe('11111111-1111-4111-8111-111111111111');
    expect(body.repos).toEqual(['https://github.com/org/repo']);
    expect(body.autoInstallDeps).toBe(true);
    expect(body.serviceAccountId).toBe('sa-001');
  });

  it('does not include undefined optional fields', async () => {
    const fetchMock = mockFetch(200, MOCK_COMPUTER);
    globalThis.fetch = fetchMock;

    await createComputer({
      apiKey: 'fk-test-key',
      name: 'my-dev-box',
      remoteUser: 'factory-user',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body).not.toHaveProperty('provider');
    expect(body).not.toHaveProperty('hostId');
    expect(body).not.toHaveProperty('repos');
    expect(body).not.toHaveProperty('autoInstallDeps');
    expect(body).not.toHaveProperty('serviceAccountId');
  });

  it('parses response correctly', async () => {
    globalThis.fetch = mockFetch(200, MOCK_COMPUTER);

    const result = await createComputer({
      apiKey: 'fk-test-key',
      name: 'my-dev-box',
      remoteUser: 'factory-user',
    });

    expect(result.id).toBe('comp-001');
    expect(result.name).toBe('my-dev-box');
    expect(result.providerType).toBe('e2b');
  });

  it('uses custom baseUrl', async () => {
    const fetchMock = mockFetch(200, MOCK_COMPUTER);
    globalThis.fetch = fetchMock;

    await createComputer({
      apiKey: 'fk-test-key',
      baseUrl: 'https://custom.factory.ai',
      name: 'my-dev-box',
      remoteUser: 'factory-user',
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://custom.factory.ai/api/v0/computers');
  });

  it('throws ProtocolError on 400', async () => {
    globalThis.fetch = mockFetch(400, { error: 'Invalid computer name' });

    await expect(
      createComputer({
        apiKey: 'fk-test-key',
        name: '',
        remoteUser: 'factory-user',
      })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on 401', async () => {
    globalThis.fetch = mockFetch(401, { error: 'Unauthorized' });

    await expect(
      createComputer({
        apiKey: 'fk-bad-key',
        name: 'my-dev-box',
        remoteUser: 'factory-user',
      })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on 402 compute limit exceeded', async () => {
    globalThis.fetch = mockFetch(402, {
      error: 'Compute limit exceeded',
    });

    await expect(
      createComputer({
        apiKey: 'fk-test-key',
        name: 'my-dev-box',
        remoteUser: 'factory-user',
      })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on unexpected response shape', async () => {
    globalThis.fetch = mockFetch(200, { unexpected: true });

    await expect(
      createComputer({
        apiKey: 'fk-test-key',
        name: 'my-dev-box',
        remoteUser: 'factory-user',
      })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(
      createComputer({
        apiKey: 'fk-test-key',
        name: 'my-dev-box',
        remoteUser: 'factory-user',
      })
    ).rejects.toThrow(ConnectionError);
  });
});

describe('getComputerByName', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the correct URL with encoded name', async () => {
    const fetchMock = mockFetch(200, MOCK_COMPUTER);
    globalThis.fetch = fetchMock;

    await getComputerByName({ apiKey: 'fk-test-key', name: 'my-dev-box' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.factory.ai/api/v0/computers/name/my-dev-box');
    expect(init.method).toBe('GET');
    expect(init.headers['Authorization']).toBe('Bearer fk-test-key');
  });

  it('encodes special characters in name', async () => {
    const fetchMock = mockFetch(200, {
      ...MOCK_COMPUTER,
      name: 'box/special',
    });
    globalThis.fetch = fetchMock;

    await getComputerByName({
      apiKey: 'fk-test-key',
      name: 'box/special',
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.factory.ai/api/v0/computers/name/box%2Fspecial'
    );
  });

  it('parses response correctly', async () => {
    globalThis.fetch = mockFetch(200, MOCK_COMPUTER);

    const result = await getComputerByName({
      apiKey: 'fk-test-key',
      name: 'my-dev-box',
    });

    expect(result.id).toBe('comp-001');
    expect(result.name).toBe('my-dev-box');
  });

  it('throws ProtocolError on 404', async () => {
    globalThis.fetch = mockFetch(404, { error: 'Computer not found' });

    await expect(
      getComputerByName({ apiKey: 'fk-test-key', name: 'nonexistent' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(
      getComputerByName({ apiKey: 'fk-test-key', name: 'my-dev-box' })
    ).rejects.toThrow(ConnectionError);
  });
});

describe('updateComputer', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the correct URL with PATCH and body', async () => {
    const fetchMock = mockFetch(200, {
      ...MOCK_COMPUTER,
      name: 'renamed-box',
    });
    globalThis.fetch = fetchMock;

    await updateComputer({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
      name: 'renamed-box',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.factory.ai/api/v0/computers/comp-001');
    expect(init.method).toBe('PATCH');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.name).toBe('renamed-box');
  });

  it('sends only provided fields', async () => {
    const fetchMock = mockFetch(200, MOCK_COMPUTER);
    globalThis.fetch = fetchMock;

    await updateComputer({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
      remoteUser: 'new-user',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body).not.toHaveProperty('name');
    expect(body.remoteUser).toBe('new-user');
  });

  it('parses response correctly', async () => {
    globalThis.fetch = mockFetch(200, {
      ...MOCK_COMPUTER,
      name: 'renamed-box',
    });

    const result = await updateComputer({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
      name: 'renamed-box',
    });

    expect(result.name).toBe('renamed-box');
  });

  it('throws ProtocolError on 404', async () => {
    globalThis.fetch = mockFetch(404, { error: 'Computer not found' });

    await expect(
      updateComputer({
        apiKey: 'fk-test-key',
        computerId: 'bad-id',
        name: 'rename',
      })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on 409 name conflict', async () => {
    globalThis.fetch = mockFetch(409, {
      error: 'Computer name already exists',
    });

    await expect(
      updateComputer({
        apiKey: 'fk-test-key',
        computerId: 'comp-001',
        name: 'duplicate-name',
      })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(
      updateComputer({
        apiKey: 'fk-test-key',
        computerId: 'comp-001',
        name: 'rename',
      })
    ).rejects.toThrow(ConnectionError);
  });
});

describe('deleteComputer', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the correct URL with DELETE', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve(undefined),
    });
    globalThis.fetch = fetchMock;

    await deleteComputer({ apiKey: 'fk-test-key', computerId: 'comp-001' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.factory.ai/api/v0/computers/comp-001');
    expect(init.method).toBe('DELETE');
    expect(init.headers['Authorization']).toBe('Bearer fk-test-key');
  });

  it('resolves without error on 204', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve(undefined),
    });

    await expect(
      deleteComputer({ apiKey: 'fk-test-key', computerId: 'comp-001' })
    ).resolves.toBeUndefined();
  });

  it('throws ProtocolError on 404', async () => {
    globalThis.fetch = mockFetch(404, { error: 'Computer not found' });

    await expect(
      deleteComputer({ apiKey: 'fk-test-key', computerId: 'bad-id' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on 401', async () => {
    globalThis.fetch = mockFetch(401, { error: 'Unauthorized' });

    await expect(
      deleteComputer({ apiKey: 'fk-bad-key', computerId: 'comp-001' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(
      deleteComputer({ apiKey: 'fk-test-key', computerId: 'comp-001' })
    ).rejects.toThrow(ConnectionError);
  });
});

describe('restartComputer', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the correct URL with POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve(undefined),
    });
    globalThis.fetch = fetchMock;

    await restartComputer({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.factory.ai/api/v0/computers/comp-001/restart'
    );
    expect(init.method).toBe('POST');
  });

  it('throws ProtocolError on 400 for BYOM computers', async () => {
    globalThis.fetch = mockFetch(400, {
      error: 'Cannot restart BYOM computer',
    });

    await expect(
      restartComputer({ apiKey: 'fk-test-key', computerId: 'comp-byom' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on 402 compute limit exceeded', async () => {
    globalThis.fetch = mockFetch(402, {
      error: 'Compute limit exceeded',
    });

    await expect(
      restartComputer({ apiKey: 'fk-test-key', computerId: 'comp-001' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on 404', async () => {
    globalThis.fetch = mockFetch(404, { error: 'Computer not found' });

    await expect(
      restartComputer({ apiKey: 'fk-test-key', computerId: 'bad-id' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(
      restartComputer({ apiKey: 'fk-test-key', computerId: 'comp-001' })
    ).rejects.toThrow(ConnectionError);
  });
});

describe('refreshComputer', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const MOCK_REFRESH_RESPONSE = { configured: 3 };

  it('calls the correct URL with POST', async () => {
    const fetchMock = mockFetch(200, MOCK_REFRESH_RESPONSE);
    globalThis.fetch = fetchMock;

    await refreshComputer({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.factory.ai/api/v0/computers/comp-001/refresh'
    );
    expect(init.method).toBe('POST');
  });

  it('parses response correctly', async () => {
    globalThis.fetch = mockFetch(200, MOCK_REFRESH_RESPONSE);

    const result = await refreshComputer({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
    });

    expect(result.configured).toBe(3);
  });

  it('throws ProtocolError on 400 for BYOM computers', async () => {
    globalThis.fetch = mockFetch(400, {
      error: 'Cannot refresh BYOM computer',
    });

    await expect(
      refreshComputer({ apiKey: 'fk-test-key', computerId: 'comp-byom' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on unexpected response shape', async () => {
    globalThis.fetch = mockFetch(200, { unexpected: true });

    await expect(
      refreshComputer({ apiKey: 'fk-test-key', computerId: 'comp-001' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(
      refreshComputer({ apiKey: 'fk-test-key', computerId: 'comp-001' })
    ).rejects.toThrow(ConnectionError);
  });
});

describe('getComputerMetrics', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const MOCK_METRICS = [
    {
      timestamp: '2024-01-15T12:00:00Z',
      cpuUsedPct: 45.2,
      cpuCount: 4,
      memUsed: 4096,
      memTotal: 8192,
      diskUsed: 50000,
      diskTotal: 100000,
    },
  ];

  it('calls the correct URL', async () => {
    const fetchMock = mockFetch(200, MOCK_METRICS);
    globalThis.fetch = fetchMock;

    await getComputerMetrics({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.factory.ai/api/v0/computers/comp-001/metrics'
    );
    expect(init.method).toBe('GET');
  });

  it('passes start query parameter', async () => {
    const fetchMock = mockFetch(200, MOCK_METRICS);
    globalThis.fetch = fetchMock;

    await getComputerMetrics({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
      start: '2024-01-15T00:00:00Z',
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.factory.ai/api/v0/computers/comp-001/metrics?start=2024-01-15T00%3A00%3A00Z'
    );
  });

  it('parses response correctly', async () => {
    globalThis.fetch = mockFetch(200, MOCK_METRICS);

    const result = await getComputerMetrics({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.cpuUsedPct).toBe(45.2);
    expect(result[0]!.cpuCount).toBe(4);
    expect(result[0]!.memUsed).toBe(4096);
    expect(result[0]!.memTotal).toBe(8192);
  });

  it('handles empty metrics array', async () => {
    globalThis.fetch = mockFetch(200, []);

    const result = await getComputerMetrics({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
    });

    expect(result).toHaveLength(0);
  });

  it('throws ProtocolError on 400 for BYOM computers', async () => {
    globalThis.fetch = mockFetch(400, {
      error: 'Metrics not available for BYOM computers',
    });

    await expect(
      getComputerMetrics({
        apiKey: 'fk-test-key',
        computerId: 'comp-byom',
      })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on 404', async () => {
    globalThis.fetch = mockFetch(404, { error: 'Computer not found' });

    await expect(
      getComputerMetrics({
        apiKey: 'fk-test-key',
        computerId: 'bad-id',
      })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(
      getComputerMetrics({
        apiKey: 'fk-test-key',
        computerId: 'comp-001',
      })
    ).rejects.toThrow(ConnectionError);
  });
});

describe('retryInstallDeps', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the correct URL with POST', async () => {
    const fetchMock = mockFetch(200, MOCK_COMPUTER);
    globalThis.fetch = fetchMock;

    await retryInstallDeps({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.factory.ai/api/v0/computers/comp-001/install-deps'
    );
    expect(init.method).toBe('POST');
  });

  it('parses response correctly', async () => {
    globalThis.fetch = mockFetch(200, MOCK_COMPUTER);

    const result = await retryInstallDeps({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
    });

    expect(result.id).toBe('comp-001');
    expect(result.name).toBe('my-dev-box');
  });

  it('throws ProtocolError on 400 for BYOM computers', async () => {
    globalThis.fetch = mockFetch(400, {
      error: 'Cannot install deps on BYOM computer',
    });

    await expect(
      retryInstallDeps({ apiKey: 'fk-test-key', computerId: 'comp-byom' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on 409 already running', async () => {
    globalThis.fetch = mockFetch(409, {
      error: 'Dependency installation already in progress',
    });

    await expect(
      retryInstallDeps({ apiKey: 'fk-test-key', computerId: 'comp-001' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on 404', async () => {
    globalThis.fetch = mockFetch(404, { error: 'Computer not found' });

    await expect(
      retryInstallDeps({ apiKey: 'fk-test-key', computerId: 'bad-id' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ProtocolError on unexpected response shape', async () => {
    globalThis.fetch = mockFetch(200, { unexpected: true });

    await expect(
      retryInstallDeps({ apiKey: 'fk-test-key', computerId: 'comp-001' })
    ).rejects.toThrow(ProtocolError);
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(
      retryInstallDeps({ apiKey: 'fk-test-key', computerId: 'comp-001' })
    ).rejects.toThrow(ConnectionError);
  });
});

const MOCK_REMOTE_SESSION = {
  sessionId: 'sess-001',
  title: 'Fix tests',
  status: 'running' as const,
  messageCount: 12,
  createdAt: 1700000000000,
  updatedAt: 1700000060000,
  computerId: 'comp-001',
};

const MOCK_SESSION_LIST_RESPONSE = {
  sessions: [MOCK_REMOTE_SESSION],
  pagination: { hasMore: false, nextCursor: null },
};

describe('listRemoteSessions', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the correct URL with auth header', async () => {
    const fetchMock = mockFetch(200, MOCK_SESSION_LIST_RESPONSE);
    globalThis.fetch = fetchMock;

    await listRemoteSessions({ apiKey: 'fk-test-key' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.factory.ai/api/v0/sessions');
    expect(init.method).toBe('GET');
    expect(init.headers['Authorization']).toBe('Bearer fk-test-key');
  });

  it('passes computerId query parameter', async () => {
    const fetchMock = mockFetch(200, MOCK_SESSION_LIST_RESPONSE);
    globalThis.fetch = fetchMock;

    await listRemoteSessions({
      apiKey: 'fk-test-key',
      computerId: 'comp-001',
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.factory.ai/api/v0/sessions?computerId=comp-001'
    );
  });

  it('passes limit and cursor query parameters', async () => {
    const fetchMock = mockFetch(200, MOCK_SESSION_LIST_RESPONSE);
    globalThis.fetch = fetchMock;

    await listRemoteSessions({
      apiKey: 'fk-test-key',
      limit: 10,
      cursor: 'abc123',
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('limit=10');
    expect(url).toContain('cursor=abc123');
  });

  it('parses response correctly', async () => {
    globalThis.fetch = mockFetch(200, MOCK_SESSION_LIST_RESPONSE);

    const result = await listRemoteSessions({ apiKey: 'fk-test-key' });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]!.sessionId).toBe('sess-001');
    expect(result.sessions[0]!.title).toBe('Fix tests');
    expect(result.sessions[0]!.status).toBe('running');
    expect(result.sessions[0]!.messageCount).toBe(12);
    expect(result.sessions[0]!.computerId).toBe('comp-001');
    expect(result.pagination.hasMore).toBe(false);
  });

  it('handles empty sessions list', async () => {
    globalThis.fetch = mockFetch(200, {
      sessions: [],
      pagination: { hasMore: false, nextCursor: null },
    });

    const result = await listRemoteSessions({ apiKey: 'fk-test-key' });

    expect(result.sessions).toHaveLength(0);
  });

  it('handles session without optional fields', async () => {
    globalThis.fetch = mockFetch(200, {
      sessions: [
        {
          sessionId: 'sess-002',
          status: 'idle',
          messageCount: 0,
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ],
      pagination: { hasMore: false, nextCursor: null },
    });

    const result = await listRemoteSessions({ apiKey: 'fk-test-key' });

    expect(result.sessions[0]!.title).toBeUndefined();
    expect(result.sessions[0]!.computerId).toBeUndefined();
    expect(result.sessions[0]!.completedAt).toBeUndefined();
  });

  it('uses custom baseUrl', async () => {
    const fetchMock = mockFetch(200, MOCK_SESSION_LIST_RESPONSE);
    globalThis.fetch = fetchMock;

    await listRemoteSessions({
      apiKey: 'fk-test-key',
      baseUrl: 'https://custom.factory.ai',
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://custom.factory.ai/api/v0/sessions');
  });

  it('throws ProtocolError on 401', async () => {
    globalThis.fetch = mockFetch(401, { error: 'Unauthorized' });

    await expect(listRemoteSessions({ apiKey: 'fk-bad-key' })).rejects.toThrow(
      ProtocolError
    );
  });

  it('throws ProtocolError on unexpected response shape', async () => {
    globalThis.fetch = mockFetch(200, { unexpected: true });

    await expect(listRemoteSessions({ apiKey: 'fk-test-key' })).rejects.toThrow(
      ProtocolError
    );
  });

  it('throws ConnectionError on network failure', async () => {
    globalThis.fetch = mockFetch(0, null, {
      throwError: new TypeError('fetch failed'),
    });

    await expect(listRemoteSessions({ apiKey: 'fk-test-key' })).rejects.toThrow(
      ConnectionError
    );
  });
});
