import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { listMachineTemplates, getMachineTemplate } from '../src/api.js';
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
    expect(url).toBe(
      'https://api.factory.ai/api/v0/machines/templates'
    );
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

    await expect(
      listMachineTemplates({ apiKey: 'bad-key' })
    ).rejects.toThrow(ProtocolError);

    await expect(
      listMachineTemplates({ apiKey: 'bad-key' })
    ).rejects.toThrow(/Invalid or expired API key/);
  });

  it('throws ProtocolError on 403', async () => {
    globalThis.fetch = mockFetch(403, { error: 'Forbidden' });

    await expect(
      listMachineTemplates({ apiKey: 'bad-key' })
    ).rejects.toThrow(ProtocolError);
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
