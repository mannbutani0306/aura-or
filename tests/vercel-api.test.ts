import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../api/[...path]';

describe('Vercel API function', () => {
  it('serves the workbook-backed Insights sample through the deployed API handler', async () => {
    const response = await request(app).get('/api/ems-sample');

    expect(response.status).toBe(200);
    expect(response.body.cases).toHaveLength(50);
    expect(response.body.source).toMatch(/^(database|workbook)$/);
  });

  it('serves route calculations through the deployed API handler', async () => {
    const response = await request(app).get('/api/route?from=A&to=B&k=3');

    expect(response.status).toBe(200);
    expect(response.body.from).toBe('A');
    expect(response.body.to).toBe('B');
    expect(response.body.optimal).not.toBeNull();
  });

  it('serves populated fallback operational state for SIM mode', async () => {
    const response = await request(app).get('/api/state');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.zones.length).toBeGreaterThan(0);
    expect(response.body.roads.length).toBeGreaterThan(0);
    expect(response.body.ambulances.length).toBeGreaterThan(0);
    expect(response.body.emergencies.length).toBeGreaterThan(0);
  });
});
