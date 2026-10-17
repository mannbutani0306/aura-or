import { Router } from 'express';
import { yenKShortestPaths } from '../../engine/graph';
import { RoadEdge, Zone } from '../../engine/types';
import { supabase } from '../services/supabase';
import { asyncHandler, HttpError } from '../services/http';

export const routeRouter = Router();

const valueRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

routeRouter.get('/route', asyncHandler(async (request, response) => {
  const from = String(request.query.from || '').trim();
  const to = String(request.query.to || '').trim();
  const k = Math.max(1, Math.min(10, Number(request.query.k || 3)));
  if (!from || !to) throw new HttpError(400, 'INVALID_ROUTE', 'Missing required "from" or "to" query parameters.');

  let zones: Zone[] = [];
  let edges: RoadEdge[] = [];
  if (supabase) {
    const [zoneResult, roadResult] = await Promise.all([
      supabase.from('zones').select('*'),
      supabase.from('road_edges').select('*'),
    ]);
    zones = (zoneResult.data ?? []).flatMap((item: unknown) => {
      const row = valueRecord(item);
      if (!row) return [];
      return [{
        id: String(row.id),
        name: String(row.name || row.id),
        lat: Number(row.lat),
        lng: Number(row.lng),
        areaType: String(row.area_type || 'Urban') as Zone['areaType'],
        localMin: Number(row.local_min || 2.0),
      }];
    });
    edges = (roadResult.data ?? []).flatMap((item: unknown) => {
      const row = valueRecord(item);
      return row ? [{ a: String(row.a), b: String(row.b), minutes: Number(row.minutes), blocked: Boolean(row.blocked) }] : [];
    });
  }

  if (zones.length === 0 || edges.length === 0) {
    zones = [
      { id: 'A', name: 'Goripalayam', lat: 9.9325, lng: 78.1312, areaType: 'Urban', localMin: 2.0 },
      { id: 'B', name: 'Anna Nagar', lat: 9.9208, lng: 78.1489, areaType: 'Urban', localMin: 2.0 },
      { id: 'C', name: 'Periyar / Central', lat: 9.9174, lng: 78.1139, areaType: 'Urban', localMin: 2.5 },
      { id: 'D', name: 'K.K. Nagar', lat: 9.9381, lng: 78.1523, areaType: 'Urban', localMin: 2.0 },
      { id: 'E', name: 'Simmakkal', lat: 9.9282, lng: 78.1219, areaType: 'Urban', localMin: 1.5 },
      { id: 'F', name: 'Villapuram', lat: 9.8973, lng: 78.1294, areaType: 'Urban', localMin: 2.0 },
    ];
    edges = [
      { a: 'A', b: 'B', minutes: 7.0, blocked: false }, { a: 'A', b: 'C', minutes: 6.0, blocked: false },
      { a: 'A', b: 'E', minutes: 4.0, blocked: false }, { a: 'B', b: 'D', minutes: 5.0, blocked: false },
      { a: 'B', b: 'F', minutes: 9.0, blocked: false }, { a: 'C', b: 'E', minutes: 4.0, blocked: false },
      { a: 'C', b: 'F', minutes: 8.0, blocked: false }, { a: 'D', b: 'E', minutes: 8.0, blocked: false },
      { a: 'E', b: 'F', minutes: 10.0, blocked: false },
    ];
  }

  const paths = yenKShortestPaths(zones, edges, from, to, k);
  return response.json({ from, to, k, optimal: paths[0] || null, alternatives: paths.slice(1), all: paths });
}));