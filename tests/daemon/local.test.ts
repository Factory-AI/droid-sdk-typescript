import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveLocalAuthToken } from '../../src/daemon/local.js';

const IV_LENGTH = 16;
const ENCRYPTION_KEY_LENGTH = 32;

function encryptAes256Gcm(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function makeFakeJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
    'base64url'
  );
  const payload = Buffer.from(
    JSON.stringify({ sub: 'user_test', exp })
  ).toString('base64url');
  return `${header}.${payload}.fake-signature`;
}

describe('resolveLocalAuthToken', () => {
  let tmpDir: string;
  let factoryDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'droid-sdk-local-'));
    factoryDir = path.join(tmpDir, '.factory-dev');
    fs.mkdirSync(factoryDir, { recursive: true });
    vi.stubEnv('FACTORY_HOME_OVERRIDE', tmpDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no credential files exist', async () => {
    expect(await resolveLocalAuthToken()).toBeNull();
  });

  it('returns null when credentials file exists but key file is missing', async () => {
    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.file'),
      'some-encrypted-data'
    );
    expect(await resolveLocalAuthToken()).toBeNull();
  });

  it('returns null when key file has wrong length', async () => {
    const shortKey = crypto.randomBytes(16);
    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.key'),
      shortKey.toString('base64')
    );
    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.file'),
      'some-encrypted-data'
    );
    expect(await resolveLocalAuthToken()).toBeNull();
  });

  it('returns non-expired access_token from valid credentials', async () => {
    const key = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = makeFakeJwt(futureExp);
    const credentials = JSON.stringify({
      access_token: token,
      refresh_token: 'refresh-token-xyz',
    });
    const encrypted = encryptAes256Gcm(credentials, key);

    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.key'),
      key.toString('base64')
    );
    fs.writeFileSync(path.join(factoryDir, 'auth.v2.file'), encrypted);

    expect(await resolveLocalAuthToken()).toBe(token);
  });

  it('returns null when decryption fails with wrong key', async () => {
    const realKey = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    const wrongKey = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const credentials = JSON.stringify({
      access_token: makeFakeJwt(futureExp),
    });
    const encrypted = encryptAes256Gcm(credentials, realKey);

    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.key'),
      wrongKey.toString('base64')
    );
    fs.writeFileSync(path.join(factoryDir, 'auth.v2.file'), encrypted);

    expect(await resolveLocalAuthToken()).toBeNull();
  });

  it('returns null when credentials JSON has no access_token', async () => {
    const key = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    const credentials = JSON.stringify({ refresh_token: 'refresh' });
    const encrypted = encryptAes256Gcm(credentials, key);

    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.key'),
      key.toString('base64')
    );
    fs.writeFileSync(path.join(factoryDir, 'auth.v2.file'), encrypted);

    expect(await resolveLocalAuthToken()).toBeNull();
  });

  it('returns null when encrypted data has invalid format', async () => {
    const key = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.key'),
      key.toString('base64')
    );
    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.file'),
      'not:valid:base64:format'
    );
    expect(await resolveLocalAuthToken()).toBeNull();
  });

  it('uses production directory when FACTORY_ENV is production', async () => {
    vi.stubEnv('FACTORY_ENV', 'production');
    const prodDir = path.join(tmpDir, '.factory');
    fs.mkdirSync(prodDir, { recursive: true });

    const key = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = makeFakeJwt(futureExp);
    const credentials = JSON.stringify({ access_token: token });
    const encrypted = encryptAes256Gcm(credentials, key);

    fs.writeFileSync(path.join(prodDir, 'auth.v2.key'), key.toString('base64'));
    fs.writeFileSync(path.join(prodDir, 'auth.v2.file'), encrypted);

    expect(await resolveLocalAuthToken()).toBe(token);
  });

  it('returns null for expired token with no refresh_token', async () => {
    const key = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    const credentials = JSON.stringify({
      access_token: makeFakeJwt(pastExp),
    });
    const encrypted = encryptAes256Gcm(credentials, key);

    fs.writeFileSync(
      path.join(factoryDir, 'auth.v2.key'),
      key.toString('base64')
    );
    fs.writeFileSync(path.join(factoryDir, 'auth.v2.file'), encrypted);

    expect(await resolveLocalAuthToken()).toBeNull();
  });
});
