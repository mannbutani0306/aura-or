import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Zone, RoadEdge, Ambulance, Emergency, Dispatch } from '../../types';

interface MaduraiMapProps {
  zones: Zone[];
  roads: RoadEdge[];
  ambulances: Ambulance[];
  emergencies: Emergency[];
  dispatches?: Dispatch[];
  simSpeed?: number;
  currentTime?: number;
  onSelectZone?: (zone: Zone) => void;
  onSelectAmbulance?: (ambulance: Ambulance) => void;
  onSelectEmergency?: (emergency: Emergency) => void;
  onSelectDispatch?: (dispatch: Dispatch) => void;
  theme?: 'paper' | 'night';
  flyToTarget?: { lat: number; lng: number; zoom?: number; timestamp?: number } | null;
}

function interpolatePathPosition(
  pathZones: string[],
  zoneMap: Map<string, Zone>,
  progress: number
): [number, number] | null {
  if (pathZones.length === 0) return null;
  if (pathZones.length === 1) {
    const z = zoneMap.get(pathZones[0]);
    return z ? [z.lat, z.lng] : null;
  }

  const coords: [number, number][] = [];
  for (const zid of pathZones) {
    const z = zoneMap.get(zid);
    if (z) coords.push([z.lat, z.lng]);
  }
  if (coords.length === 0) return null;
  if (coords.length === 1) return coords[0];

  const totalSegments = coords.length - 1;
  const clampedP = Math.max(0, Math.min(1, progress));
  const segmentFraction = 1 / totalSegments;

  const segmentIndex = Math.min(
    totalSegments - 1,
    Math.floor(clampedP / segmentFraction)
  );
  const segmentT = (clampedP - segmentIndex * segmentFraction) / segmentFraction;

  const start = coords[segmentIndex];
  const end = coords[segmentIndex + 1];

  const lat = start[0] + (end[0] - start[0]) * segmentT;
  const lng = start[1] + (end[1] - start[1]) * segmentT;
  return [lat, lng];
}

export function MaduraiMap({
  zones,
  roads,
  ambulances,
  emergencies,
  dispatches = [],
  simSpeed = 1,
  currentTime = Date.now(),
  onSelectZone,
  onSelectAmbulance,
  onSelectEmergency,
  onSelectDispatch,
  theme = 'paper',
  flyToTarget,
}: MaduraiMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    // Center of Madurai city: 9.9252, 78.1198
    const map = L.map(container, {
      center: [9.9252, 78.125],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    L.control
      .attribution({ position: 'bottomright', prefix: false })
      .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')
      .addTo(map);

    mapInstanceRef.current = map;
    layersGroupRef.current = L.layerGroup().addTo(map);
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(container);
    const resizeFrame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      map.remove();
      mapInstanceRef.current = null;
      layersGroupRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  // Update Tile Layer based on theme
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    const tiles = L.tileLayer(tileUrl, {
      subdomains: 'abc',
      maxZoom: 19,
    });

    tiles.addTo(map);
    tileLayerRef.current = tiles;
  }, [theme]);

  // Handle flyTo when selected call/unit changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !flyToTarget) return;

    map.flyTo([flyToTarget.lat, flyToTarget.lng], flyToTarget.zoom ?? 14, {
      duration: 1.2,
      easeLinearity: 0.25,
    });
  }, [flyToTarget]);

  // Redraw Zones, Roads, Units, and Emergencies
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const zoneMap = new Map<string, Zone>();
    zones.forEach((z) => zoneMap.set(z.id, z));

    // 1. Draw Road Corridors
    roads.forEach((road) => {
      const zA = zoneMap.get(road.a);
      const zB = zoneMap.get(road.b);
      if (!zA || !zB) return;

      const isBlocked = road.blocked;
      const polyline = L.polyline(
        [
          [zA.lat, zA.lng],
          [zB.lat, zB.lng],
        ],
        {
          color: isBlocked ? '#E5322D' : theme === 'night' ? '#3B4754' : '#C0B9A8',
          weight: isBlocked ? 2.5 : 2,
          opacity: isBlocked ? 0.9 : 0.6,
          dashArray: isBlocked ? '6, 6' : undefined,
        }
      );

      polyline.bindTooltip(
        `${zA.id} ↔ ${zB.id}: ${road.minutes.toFixed(1)}m ${isBlocked ? '(BLOCKED)' : ''}`,
        {
          className: 'aura-map-tooltip',
          sticky: true,
        }
      );

      polyline.addTo(group);
    });

    // 2. Draw Soft Zone Discs
    zones.forEach((zone) => {
      const circle = L.circle([zone.lat, zone.lng], {
        radius: 460,
        color: theme === 'night' ? 'rgba(232, 230, 225, 0.2)' : 'rgba(20, 22, 26, 0.18)',
        weight: 1,
        fillColor: theme === 'night' ? '#182028' : '#F4EFE6',
        fillOpacity: 0.45,
      });

      circle.on('click', () => onSelectZone?.(zone));
      circle.addTo(group);

      // Zone Label Badge
      const labelIcon = L.divIcon({
        className: 'aura-zone-divicon',
        html: `
          <div class="aura-zone-badge ${theme}">
            <span class="aura-zone-id">${zone.id}</span>
            <span class="aura-zone-name">${zone.name}</span>
          </div>
        `,
        iconSize: [110, 28],
        iconAnchor: [55, 34],
      });

      const labelMarker = L.marker([zone.lat, zone.lng], {
        icon: labelIcon,
        interactive: true,
      });

      labelMarker.on('click', () => onSelectZone?.(zone));
      labelMarker.addTo(group);
    });

    // 3. Draw Units (Stationary at their Zone, or Moving along route in EnRoute / OnScene)
    const activeDispatchByAmb = new Map<string, Dispatch>();
    dispatches
      .filter((d) => d.status === 'EnRoute' || d.status === 'OnScene')
      .forEach((d) => activeDispatchByAmb.set(d.ambulanceId, d));

    // A. Draw Stationary Units (Available or Idle)
    const stationaryUnitsByZone = new Map<string, Ambulance[]>();
    ambulances
      .filter((amb) => !activeDispatchByAmb.has(amb.id))
      .forEach((amb) => {
        const list = stationaryUnitsByZone.get(amb.zoneId) || [];
        list.push(amb);
        stationaryUnitsByZone.set(amb.zoneId, list);
      });

    stationaryUnitsByZone.forEach((ambList, zId) => {
      const zone = zoneMap.get(zId);
      if (!zone) return;

      ambList.forEach((amb, index) => {
        const angle = (index * (2 * Math.PI)) / Math.max(1, ambList.length);
        const radiusOffset = ambList.length > 1 ? 0.0022 : 0;
        const lat = zone.lat + radiusOffset * Math.sin(angle) - 0.0018;
        const lng = zone.lng + radiusOffset * Math.cos(angle) + 0.0018;

        const isAvailable = amb.status === 'Available';

        const unitIcon = L.divIcon({
          className: 'aura-unit-divicon',
          html: `
            <div class="aura-unit-pin ${isAvailable ? 'available' : 'busy'}" title="${amb.id} (${amb.type}) · ${amb.status} at Zone ${amb.zoneId}">
              <div class="aura-unit-ring ${isAvailable ? 'rotating' : ''}"></div>
              <div class="aura-unit-badge">
                <span class="emoji">🚑</span>
              </div>
              <div class="aura-unit-tag">
                <span class="amb-id">${amb.id}</span>
                <span class="amb-type">${amb.type}</span>
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        const marker = L.marker([lat, lng], { icon: unitIcon, zIndexOffset: 200 });
        marker.on('click', () => onSelectAmbulance?.(amb));
        marker.addTo(group);
      });
    });

    // B. Draw Active Dispatched Units (Moving in EnRoute or OnScene)
    activeDispatchByAmb.forEach((disp, ambId) => {
      const amb = ambulances.find((a) => a.id === ambId);
      if (!amb) return;

      const dispatchedAt = disp.dispatchedAt;
      const elapsedSimSec = Math.max(0, ((currentTime - dispatchedAt) / 1000) * simSpeed);
      const isBreached = elapsedSimSec > disp.benchmarkMin * 60;
      const pathZones = disp.path && disp.path.length > 0 ? disp.path : [disp.fromZone, disp.toZone];

      // Draw active route polyline on map
      const pathPoints = pathZones
        .map((zId) => zoneMap.get(zId))
        .filter(Boolean)
        .map((z) => [z!.lat, z!.lng] as [number, number]);

      if (pathPoints.length >= 2) {
        L.polyline(pathPoints, {
          color: isBreached ? '#E5322D' : '#0F8B8D',
          weight: 4,
          opacity: 0.9,
          dashArray: '8, 8',
        }).addTo(group);
      }

      if (disp.status === 'EnRoute') {
        const progress = Math.min(1, Math.max(0, elapsedSimSec / Math.max(1, disp.etaMin * 60)));
        const coords = interpolatePathPosition(pathZones, zoneMap, progress);
        if (!coords) return;

        const circumference = 113.1;
        const progressRatio = Math.min(1, elapsedSimSec / (disp.benchmarkMin * 60));
        const strokeDashoffset = circumference - progressRatio * circumference;

        const unitIcon = L.divIcon({
          className: 'aura-unit-divicon',
          html: `
            <div class="aura-unit-pin en-route ${isBreached ? 'sla-breached' : ''}" style="position: relative;" title="${amb.id} En Route to ${disp.emergencyId} (Zone ${disp.toZone}) · ETA ${disp.etaMin}m · Elapsed ${(elapsedSimSec / 60).toFixed(1)}m">
              <svg width="44" height="44" style="position: absolute; top: -6px; left: -6px; transform: rotate(-90deg); pointer-events: none;">
                <circle cx="22" cy="22" r="18" fill="none" stroke="var(--line)" stroke-width="2.5" />
                <circle cx="22" cy="22" r="18" fill="none" stroke="${isBreached ? '#E5322D' : '#0F8B8D'}" stroke-width="2.5" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" />
              </svg>
              <div class="aura-unit-ring rotating"></div>
              <div class="aura-unit-badge">
                <span class="emoji">🚑</span>
              </div>
              <div class="aura-unit-tag">
                <span class="amb-id">${amb.id}</span>
                <span class="amb-type">${(elapsedSimSec / 60).toFixed(1)}m/${disp.etaMin}m</span>
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        const marker = L.marker(coords, { icon: unitIcon, zIndexOffset: 300 });
        marker.on('click', () => {
          onSelectAmbulance?.(amb);
          onSelectDispatch?.(disp);
        });
        marker.addTo(group);
      } else if (disp.status === 'OnScene') {
        const destZone = zoneMap.get(disp.toZone);
        if (!destZone) return;

        const coords: [number, number] = [destZone.lat + 0.0018, destZone.lng - 0.0018];
        const unitIcon = L.divIcon({
          className: 'aura-unit-divicon',
          html: `
            <div class="aura-unit-pin on-scene" title="${amb.id} On Scene at Zone ${disp.toZone} for ${disp.emergencyId}">
              <div class="aura-unit-ring pulsing"></div>
              <div class="aura-unit-badge">
                <span class="emoji">🏥</span>
              </div>
              <div class="aura-unit-tag">
                <span class="amb-id">${amb.id}</span>
                <span class="amb-type">OnScene</span>
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        const marker = L.marker(coords, { icon: unitIcon, zIndexOffset: 300 });
        marker.on('click', () => {
          onSelectAmbulance?.(amb);
          onSelectDispatch?.(disp);
        });
        marker.addTo(group);
      }
    });

    // 4. Draw Pending Emergencies (Triage Beacons)
    const emergenciesByZone = new Map<string, Emergency[]>();
    emergencies
      .filter((e) => e.status === 'Pending')
      .forEach((em) => {
        const list = emergenciesByZone.get(em.zoneId) || [];
        list.push(em);
        emergenciesByZone.set(em.zoneId, list);
      });

    emergenciesByZone.forEach((emList, zId) => {
      const zone = zoneMap.get(zId);
      if (!zone) return;

      emList.forEach((em, index) => {
        const angle = (index * (2 * Math.PI)) / Math.max(1, emList.length) + Math.PI / 4;
        const radiusOffset = emList.length > 1 ? 0.0026 : 0;
        const lat = zone.lat + radiusOffset * Math.sin(angle) + 0.0015;
        const lng = zone.lng + radiusOffset * Math.cos(angle) - 0.0015;

        const isCritical = em.priority === 'Critical';
        const beaconColors: Record<Emergency['priority'], string> = {
          Critical: '#E5322D',
          High: '#F08A00',
          Medium: '#E8C21A',
          Low: '#3FA66B',
        };

        const color = beaconColors[em.priority];

        const beaconIcon = L.divIcon({
          className: 'aura-beacon-divicon',
          html: `
            <div class="aura-beacon-pin ${em.priority.toLowerCase()}" style="--beacon-color: ${color}">
              <div class="aura-beacon-halo"></div>
              <div class="aura-beacon-core">
                ${isCritical ? '<span class="siren">🚨</span>' : '<span class="dot"></span>'}
              </div>
              <div class="aura-beacon-tag">
                <span class="em-id">${em.id}</span>
                <span class="em-prio">${em.priority}</span>
              </div>
            </div>
          `,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });

        const marker = L.marker([lat, lng], { icon: beaconIcon, zIndexOffset: 300 });
        marker.on('click', () => onSelectEmergency?.(em));
        marker.addTo(group);
      });
    });
  }, [zones, roads, ambulances, emergencies, dispatches, simSpeed, currentTime, theme, onSelectZone, onSelectAmbulance, onSelectEmergency, onSelectDispatch]);

  return (
    <div className="relative w-full h-full min-h-[480px] overflow-hidden select-none">
      {/* Map Container */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full ${
          theme === 'paper' ? 'aura-map-paper-filter' : 'aura-map-night-filter'
        }`}
      />

      {/* Map Styles */}
      <style>{`
        /* Map Theme Color Grading Filters */
        .aura-map-paper-filter .leaflet-tile-pane {
          filter: sepia(0.18) contrast(0.96) brightness(0.99);
        }
        .aura-map-night-filter .leaflet-tile-pane {
          filter: invert(0.88) hue-rotate(180deg) saturate(0.45) brightness(0.78) contrast(1.1);
        }

        /* Tooltip styling */
        .aura-map-tooltip {
          background-color: var(--surface-raised) !important;
          color: var(--ink) !important;
          border: 1px solid var(--line) !important;
          border-radius: 4px !important;
          font-family: 'Geist Mono', monospace !important;
          font-size: 11px !important;
          padding: 3px 6px !important;
          box-shadow: none !important;
        }

        /* Zone Badges: Dispatch Slip pill */
        .aura-zone-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2px 9px;
          border-radius: 9999px;
          background: var(--surface-raised);
          border: 2px solid var(--line);
          color: var(--ink);
          box-shadow: 2px 2px 0 var(--shadow-ink);
          white-space: nowrap;
          pointer-events: auto;
          cursor: pointer;
          transition: transform 120ms ease;
        }
        .aura-zone-badge:hover {
          transform: translateY(-2px);
          box-shadow: 3px 3px 0 var(--shadow-ink);
        }
        .aura-zone-id {
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 800;
          font-size: 14px;
          color: var(--signal);
        }
        .aura-zone-name {
          font-family: 'Geist Mono', monospace;
          font-size: 10px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--ink);
        }

        /* Unit Marker Pin */
        .aura-unit-pin {
          position: relative;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .aura-unit-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1.5px dashed #0F8B8D;
        }
        .aura-unit-ring.rotating {
          animation: spin 8s linear infinite;
        }
        .aura-unit-pin.busy .aura-unit-ring {
          border: 1.5px solid #6B7785;
          animation: none;
        }
        .aura-unit-badge {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: var(--surface-raised);
          border: 1px solid var(--line);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
        }
        .aura-unit-tag {
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 3px;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 3px;
          padding: 1px 4px;
          font-family: 'Geist Mono', monospace;
          font-size: 9px;
          white-space: nowrap;
          color: var(--ink);
        }

        /* Beacon Pin */
        .aura-beacon-pin {
          position: relative;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .aura-beacon-halo {
          position: absolute;
          inset: 2px;
          border-radius: 50%;
          background: var(--beacon-color);
          opacity: 0.35;
          animation: beaconPulse 1.8s ease-out infinite;
        }
        .aura-beacon-pin.critical .aura-beacon-halo {
          animation: beaconPulse 0.9s ease-out infinite;
          opacity: 0.5;
        }
        .aura-beacon-core {
          position: relative;
          z-index: 2;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--surface-raised);
          border: 1.5px solid var(--beacon-color);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .aura-beacon-core .siren {
          font-size: 12px;
        }
        .aura-beacon-core .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--beacon-color);
        }
        .aura-beacon-tag {
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 3px;
          background: var(--surface-raised);
          border: 1px solid var(--beacon-color);
          border-radius: 3px;
          padding: 1px 4px;
          font-family: 'Geist Mono', monospace;
          font-size: 9px;
          white-space: nowrap;
          color: var(--beacon-color);
        }

        @keyframes beaconPulse {
          0% {
            transform: scale(0.8);
            opacity: 0.8;
          }
          100% {
            transform: scale(2.4);
            opacity: 0;
          }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .aura-beacon-halo {
            animation: none !important;
          }
          .aura-unit-ring.rotating {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
