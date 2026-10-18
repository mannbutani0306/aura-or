import { Ambulance, AppConfig, DEFAULT_CONFIG, Emergency, RoadEdge, Zone } from './types';

export interface GuideScenario {
  id: string;
  zones: Zone[];
  edges: RoadEdge[];
  units: Ambulance[];
  calls: Emergency[];
  config: AppConfig;
}

export const GUIDE_SCENARIOS: GuideScenario[] = [
  {
    id: 'guide-1',
    zones: [
      { id: 'A', name: 'A', lat: 1, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'B', name: 'B', lat: 2, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'C', name: 'C', lat: 3, lng: 1, areaType: 'Urban', localMin: 2 },
    ],
    edges: [
      { a: 'A', b: 'B', minutes: 4 },
      { a: 'B', b: 'C', minutes: 4 },
    ],
    units: [
      { id: 'U1', zoneId: 'A', type: 'BLS', status: 'Available' },
      { id: 'U2', zoneId: 'C', type: 'ALS', status: 'Available' },
    ],
    calls: [
      { id: 'E1', zoneId: 'B', priority: 'Critical', weight: 5, requiresAls: true, status: 'Pending', requestedAt: 0 },
      { id: 'E2', zoneId: 'C', priority: 'Medium', weight: 2, requiresAls: false, status: 'Pending', requestedAt: 1 },
    ],
    config: { ...DEFAULT_CONFIG },
  },
  {
    id: 'guide-2',
    zones: [
      { id: 'A', name: 'A', lat: 1, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'B', name: 'B', lat: 2, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'C', name: 'C', lat: 3, lng: 1, areaType: 'Urban', localMin: 2 },
    ],
    edges: [
      { a: 'A', b: 'B', minutes: 4 },
      { a: 'B', b: 'C', minutes: 4 },
    ],
    units: [
      { id: 'U1', zoneId: 'A', type: 'BLS', status: 'Available' },
      { id: 'U2', zoneId: 'A', type: 'BLS', status: 'Available' },
      { id: 'U3', zoneId: 'C', type: 'ALS', status: 'Available' },
    ],
    calls: [
      { id: 'E1', zoneId: 'B', priority: 'Critical', weight: 5, requiresAls: true, status: 'Pending', requestedAt: 0 },
      { id: 'E2', zoneId: 'A', priority: 'Low', weight: 1, requiresAls: false, status: 'Pending', requestedAt: 1 },
    ],
    config: { ...DEFAULT_CONFIG, als_policy: 'hard' },
  },
  {
    id: 'guide-3',
    zones: [
      { id: 'A', name: 'A', lat: 1, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'B', name: 'B', lat: 2, lng: 1, areaType: 'Urban', localMin: 2 },
    ],
    edges: [
      { a: 'A', b: 'B', minutes: 5 },
    ],
    units: [
      { id: 'U1', zoneId: 'A', type: 'BLS', status: 'Available' },
      { id: 'U2', zoneId: 'B', type: 'BLS', status: 'Available' },
    ],
    calls: [
      { id: 'E1', zoneId: 'A', priority: 'High', weight: 3, requiresAls: false, status: 'Pending', requestedAt: 0 },
      { id: 'E2', zoneId: 'B', priority: 'High', weight: 3, requiresAls: false, status: 'Pending', requestedAt: 1 },
    ],
    config: { ...DEFAULT_CONFIG },
  },
  {
    id: 'guide-4',
    zones: [
      { id: 'A', name: 'A', lat: 1, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'B', name: 'B', lat: 2, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'C', name: 'C', lat: 3, lng: 1, areaType: 'Urban', localMin: 2 },
    ],
    edges: [
      { a: 'A', b: 'B', minutes: 2 },
      { a: 'B', b: 'C', minutes: 2 },
      { a: 'A', b: 'C', minutes: 10 },
    ],
    units: [
      { id: 'U1', zoneId: 'A', type: 'BLS', status: 'Available' },
      { id: 'U2', zoneId: 'B', type: 'BLS', status: 'Available' },
    ],
    calls: [
      { id: 'E1', zoneId: 'A', priority: 'Critical', weight: 5, requiresAls: false, status: 'Pending', requestedAt: 0 },
      { id: 'E2', zoneId: 'C', priority: 'Low', weight: 1, requiresAls: false, status: 'Pending', requestedAt: 1 },
    ],
    config: { ...DEFAULT_CONFIG },
  },
  {
    id: 'guide-5',
    zones: [
      { id: 'A', name: 'A', lat: 1, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'B', name: 'B', lat: 2, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'C', name: 'C', lat: 3, lng: 1, areaType: 'Urban', localMin: 2 },
    ],
    edges: [
      { a: 'A', b: 'B', minutes: 3 },
      { a: 'B', b: 'C', minutes: 3 },
    ],
    units: [
      { id: 'U1', zoneId: 'A', type: 'BLS', status: 'Available' },
      { id: 'U2', zoneId: 'A', type: 'BLS', status: 'Available' },
    ],
    calls: [
      { id: 'E1', zoneId: 'B', priority: 'Critical', weight: 5, requiresAls: false, status: 'Pending', requestedAt: 0 },
      { id: 'E2', zoneId: 'C', priority: 'Critical', weight: 5, requiresAls: false, status: 'Pending', requestedAt: 1 },
      { id: 'E3', zoneId: 'A', priority: 'Low', weight: 1, requiresAls: false, status: 'Pending', requestedAt: 2 },
    ],
    config: { ...DEFAULT_CONFIG, max_response_min: 5 },
  },
  {
    id: 'guide-6',
    zones: [
      { id: 'A', name: 'A', lat: 1, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'B', name: 'B', lat: 2, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'C', name: 'C', lat: 3, lng: 1, areaType: 'Urban', localMin: 2 },
    ],
    edges: [
      { a: 'A', b: 'B', minutes: 6 },
      { a: 'B', b: 'C', minutes: 6 },
    ],
    units: [
      { id: 'U1', zoneId: 'A', type: 'ALS', status: 'Available' },
      { id: 'U2', zoneId: 'A', type: 'BLS', status: 'Available' },
    ],
    calls: [
      { id: 'E1', zoneId: 'C', priority: 'Critical', weight: 5, requiresAls: true, status: 'Pending', requestedAt: 0 },
      { id: 'E2', zoneId: 'C', priority: 'High', weight: 3, requiresAls: false, status: 'Pending', requestedAt: 1 },
    ],
    config: { ...DEFAULT_CONFIG, als_policy: 'penalty' },
  },
  {
    id: 'guide-7',
    zones: [
      { id: 'A', name: 'A', lat: 1, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'B', name: 'B', lat: 2, lng: 1, areaType: 'Urban', localMin: 2 },
      { id: 'C', name: 'C', lat: 3, lng: 1, areaType: 'Urban', localMin: 2 },
    ],
    edges: [
      { a: 'A', b: 'B', minutes: 1 },
      { a: 'B', b: 'C', minutes: 1 },
    ],
    units: [
      { id: 'U1', zoneId: 'A', type: 'BLS', status: 'Available' },
      { id: 'U2', zoneId: 'B', type: 'BLS', status: 'Available' },
    ],
    calls: [
      { id: 'E1', zoneId: 'C', priority: 'Low', weight: 1, requiresAls: false, status: 'Pending', requestedAt: 0 },
      { id: 'E2', zoneId: 'C', priority: 'Medium', weight: 2, requiresAls: false, status: 'Pending', requestedAt: 1 },
      { id: 'E3', zoneId: 'A', priority: 'High', weight: 3, requiresAls: false, status: 'Pending', requestedAt: 2 },
    ],
    config: { ...DEFAULT_CONFIG },
  },
];
