import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { getEmsSampleRows } from '../server/services/emsSample';

describe('provided EMS workbook sample', () => {
  it('normalizes 50 cases and excludes source identifiers and unrelated workbook columns', async () => {
    const cases = await getEmsSampleRows();
    expect(cases).toHaveLength(50);
    expect(cases[0]).toMatchObject({
      id: 'SAMPLE-01',
      district: expect.any(String),
      call_type: expect.any(String),
      triage: expect.any(String),
      priority: expect.any(String),
      response_sec: expect.any(Number),
      benchmark_sec: expect.any(Number),
      hour: expect.any(Number),
    });
    expect(Object.keys(cases[0]).sort()).toEqual([
      'benchmark_sec',
      'call_type',
      'district',
      'hour',
      'id',
      'priority',
      'response_sec',
      'triage',
    ]);
  });

  it('serves a non-empty sample source to Insights', async () => {
    const response = await request(createApp()).get('/api/ems-sample');
    expect(response.status).toBe(200);
    expect(response.body.source).toMatch(/^(database|workbook)$/);
    expect(response.body.cases).toHaveLength(50);
  });
});
