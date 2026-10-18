import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';

const previousAppUrl = process.env.APP_URL;
const previousEnvironment = process.env.NODE_ENV;

afterEach(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
  if (previousEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment;
});

describe('HTTP hardening', () => {
  it('sets Helmet headers and only reflects the configured application origin', async () => {
    process.env.APP_URL = 'https://aura.example';
    process.env.NODE_ENV = 'test';
    const app = createApp();
    const allowed = await request(app).get('/api/health').set('Origin', 'https://aura.example');
    const denied = await request(app).get('/api/health').set('Origin', 'https://attacker.example');

    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(allowed.headers['content-security-policy']).toContain("default-src 'self'");
    expect(allowed.headers['access-control-allow-origin']).toBe('https://aura.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  }, 20000);

  it('allows the development bootstrap but keeps production script policy strict', async () => {
    process.env.NODE_ENV = 'test';
    const development = await request(createApp()).get('/api/health');
    expect(development.headers['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'");
    expect(development.headers['content-security-policy']).toContain("connect-src 'self' https: wss: ws:");

    process.env.NODE_ENV = 'production';
    const production = await request(createApp()).get('/api/health');
    expect(production.headers['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(production.headers['content-security-policy']).not.toContain("script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'");
    expect(production.headers['content-security-policy']).not.toContain("connect-src 'self' https: wss: ws:");
  }, 20000);

  it('rejects request bodies larger than one megabyte with 413', async () => {
    process.env.NODE_ENV = 'test';
    const app = createApp();
    const body = JSON.stringify({ value: 'x'.repeat(1024 * 1024) });
    const response = await request(app)
      .post('/api/solve')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  }, 20000);
});