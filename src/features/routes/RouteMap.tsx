import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Zone, RoadEdge } from '../../types';
import { DijkstraStep } from '../../engine/graph';

interface RouteMapProps {
  zones: Zone[];
  roads: RoadEdge[];
  activePath: string[];
  alternativePaths?: { path: string[]; totalTime: number; deltaMinutes?: number }[];
  onSelectPath?: (path: string[]) => void;
  onToggleRoad?: (a: string, b: string) => void;
  theme?: 'paper' | 'night';
  traceStep?: DijkstraStep | null;
  isTracing?: boolean;
  vehicleProgress?: number; // 0.0 to 1.0 along activePath
}

export function RouteMap({
  zones,
  roads,
  activePath,
  alternativePaths = [],
  onSelectPath,
  onToggleRoad,
  theme = 'paper',
  traceStep,
  isTracing = false,
  vehicleProgress,
}: RouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);
  const vehicleMarkerRef = useRef<L.Marker | null>(null);

  // Initialize Map
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const map = L.map(container, {
      center: [9.9252, 78.132],
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
      vehicleMarkerRef.current = null;
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

  // Redraw Network, Active Route, Alternatives, Tracing States
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    vehicleMarkerRef.current = null;

    const zoneMap = new Map<string, Zone>();
    zones.forEach((z) => zoneMap.set(z.id, z));

    // 1. Draw All Road Corridors (Normal or Blocked)
    roads.forEach((road) => {
      const zA = zoneMap.get(road.a);
      const zB = zoneMap.get(road.b);
      if (!zA || !zB) return;

      const isBlocked = road.blocked;
      const poly = L.polyline(
        [
          [zA.lat, zA.lng],
          [zB.lat, zB.lng],
        ],
        {
          color: isBlocked ? '#E5322D' : theme === 'night' ? '#2A3540' : '#D1CABE',
          weight: isBlocked ? 3 : 2,
          dashArray: isBlocked ? '6, 6' : undefined,
          opacity: isBlocked ? 0.95 : 0.5,
        }
      );

      poly.on('click', () => onToggleRoad?.(road.a, road.b));
      poly.bindTooltip(
        `${road.a} ↔ ${road.b}: ${road.minutes.toFixed(1)}m ${
          isBlocked ? '⚠ BLOCKED (Click to unblock)' : '(Click to close road)'
        }`,
        { className: 'aura-map-tooltip', sticky: true }
      );

      poly.addTo(group);
    });

    // 2. Draw Alternative Routes (k-shortest) in neutral dashed lines
    alternativePaths.forEach((alt, idx) => {
      const coords: [number, number][] = alt.path
        .map((zId) => {
          const z = zoneMap.get(zId);
          return z ? [z.lat, z.lng] as [number, number] : null;
        })
        .filter((c): c is [number, number] => c !== null);

      if (coords.length < 2) return;

      const poly = L.polyline(coords, {
        color: theme === 'night' ? '#6B7785' : '#8A8578',
        weight: 3,
        dashArray: '5, 5',
        opacity: 0.65,
      });

      poly.on('click', () => onSelectPath?.(alt.path));
      poly.bindTooltip(
        `Alternative Route ${idx + 1}: ${alt.totalTime.toFixed(1)}m (+${alt.deltaMinutes ?? 0}m) · Click to select`,
        { className: 'aura-map-tooltip', sticky: true }
      );

      poly.addTo(group);
    });

    // 3. Draw Active Optimal Route (Thick Animated Flow Line)
    if (activePath.length >= 2) {
      const coords: [number, number][] = activePath
        .map((zId) => {
          const z = zoneMap.get(zId);
          return z ? [z.lat, z.lng] as [number, number] : null;
        })
        .filter((c): c is [number, number] => c !== null);

      if (coords.length >= 2) {
        // Shadow halo
        const halo = L.polyline(coords, {
          color: '#0F8B8D',
          weight: 7,
          opacity: 0.25,
          lineCap: 'round',
        });
        halo.addTo(group);

        // Core flowing dashed line
        const flowLine = L.polyline(coords, {
          color: '#0F8B8D',
          weight: 4,
          dashArray: '10, 8',
          lineCap: 'round',
          className: 'aura-flow-path',
        });
        flowLine.addTo(group);
      }
    }

    // 4. Draw Zones (with Ordinal numbers if on activePath, or Tracing distance badges)
    zones.forEach((zone) => {
      const pathIndex = activePath.indexOf(zone.id);
      const isOnPath = pathIndex !== -1;
      const isOrigin = pathIndex === 0;
      const isTarget = pathIndex === activePath.length - 1 && activePath.length > 1;

      // Tracing State
      const isVisitedInTrace = isTracing && traceStep?.visitedNodes.includes(zone.id);
      const isCurrentTraceNode = isTracing && traceStep?.currentNode === zone.id;
      const tentativeDist = isTracing ? traceStep?.tentativeDistances[zone.id] : undefined;

      // Soft disc
      const circle = L.circle([zone.lat, zone.lng], {
        radius: isTarget || isOrigin ? 480 : 380,
        color: isTarget ? '#E5322D' : isOrigin ? '#0F8B8D' : 'rgba(20, 22, 26, 0.18)',
        weight: isOnPath ? 1.5 : 1,
        fillColor: isTarget
          ? 'rgba(229, 50, 45, 0.15)'
          : isOrigin
          ? 'rgba(15, 139, 141, 0.15)'
          : theme === 'night'
          ? '#182028'
          : '#F4EFE6',
        fillOpacity: 0.5,
      });
      circle.addTo(group);

      // Custom HTML Marker Badge
      let badgeHtml = '';
      if (isTracing) {
        // Tracing mode badge: tentative distance display
        const distStr = tentativeDist === undefined || tentativeDist === Infinity ? '∞' : `${tentativeDist.toFixed(1)}m`;
        badgeHtml = `
          <div class="aura-trace-badge ${isCurrentTraceNode ? 'current' : isVisitedInTrace ? 'visited' : 'unvisited'}">
            <span class="node-id">${zone.id}</span>
            <span class="dist-val">${distStr}</span>
          </div>
        `;
      } else if (isOnPath) {
        // Ordinal node marker (1, 2, 3...)
        badgeHtml = `
          <div class="aura-ordinal-badge ${isOrigin ? 'origin' : isTarget ? 'target' : 'waypoint'}">
            <span class="ordinal-num">${pathIndex + 1}</span>
            <span class="zone-id">${zone.id}</span>
            <span class="zone-name">${zone.name}</span>
          </div>
        `;
      } else {
        // Default zone badge
        badgeHtml = `
          <div class="aura-zone-badge ${theme}">
            <span class="aura-zone-id">${zone.id}</span>
            <span class="aura-zone-name">${zone.name}</span>
          </div>
        `;
      }

      const icon = L.divIcon({
        className: 'aura-route-node-divicon',
        html: badgeHtml,
        iconSize: [isOnPath ? 130 : 90, 28],
        iconAnchor: [isOnPath ? 65 : 45, 14],
      });

      const marker = L.marker([zone.lat, zone.lng], { icon, interactive: false });
      marker.addTo(group);
    });

    // 5. Draw Simulated Vehicle 🚑 along route
    if (activePath.length >= 2 && vehicleProgress !== undefined && vehicleProgress >= 0) {
      const coords: [number, number][] = activePath
        .map((zId) => {
          const z = zoneMap.get(zId);
          return z ? [z.lat, z.lng] as [number, number] : null;
        })
        .filter((c): c is [number, number] => c !== null);

      if (coords.length >= 2) {
        // Calculate interpolated point along multi-segment polyline
        const totalSegments = coords.length - 1;
        const scaledProgress = Math.max(0, Math.min(1, vehicleProgress)) * totalSegments;
        const segmentIndex = Math.min(Math.floor(scaledProgress), totalSegments - 1);
        const segmentT = scaledProgress - segmentIndex;

        const p1 = coords[segmentIndex];
        const p2 = coords[segmentIndex + 1];

        const currentLat = p1[0] + (p2[0] - p1[0]) * segmentT;
        const currentLng = p1[1] + (p2[1] - p1[1]) * segmentT;

        const vehicleIcon = L.divIcon({
          className: 'aura-vehicle-divicon',
          html: `
            <div class="aura-vehicle-marker">
              <span class="vehicle-emoji">🚑</span>
              <div class="vehicle-pulse"></div>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const vMarker = L.marker([currentLat, currentLng], {
          icon: vehicleIcon,
          zIndexOffset: 1000,
        });
        vMarker.addTo(group);
        vehicleMarkerRef.current = vMarker;
      }
    }
  }, [zones, roads, activePath, alternativePaths, theme, traceStep, isTracing, vehicleProgress, onSelectPath, onToggleRoad]);

  return (
    <div className="relative w-full h-full min-h-[480px] overflow-hidden select-none">
      <div
        ref={mapContainerRef}
        className={`w-full h-full ${
          theme === 'paper' ? 'aura-map-paper-filter' : 'aura-map-night-filter'
        }`}
      />

      <style>{`
        /* Flow line animation */
        @keyframes flowDashAnim {
          0% {
            stroke-dashoffset: 36;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        .aura-flow-path {
          animation: flowDashAnim 1s linear infinite;
        }

        /* Ordinal Badge */
        .aura-ordinal-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2px 8px;
          border-radius: 6px;
          background: var(--surface-raised);
          border: 1px solid var(--line);
          color: var(--ink);
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
          white-space: nowrap;
        }
        .aura-ordinal-badge.origin {
          border-color: var(--unit-available);
          background: rgba(15, 139, 141, 0.12);
        }
        .aura-ordinal-badge.target {
          border-color: var(--critical);
          background: rgba(229, 50, 45, 0.12);
        }
        .ordinal-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--ink);
          color: var(--bg-app);
          font-family: 'Times New Roman', Times, serif;
          font-size: 12px;
          font-weight: bold;
        }
        .aura-ordinal-badge.origin .ordinal-num {
          background: var(--unit-available);
        }
        .aura-ordinal-badge.target .ordinal-num {
          background: var(--critical);
        }
        .zone-id {
          font-family: 'Times New Roman', Times, serif;
          font-size: 14px;
          font-weight: bold;
        }
        .zone-name {
          font-family: 'Times New Roman', Times, serif;
          font-size: 12px;
          text-transform: uppercase;
          color: var(--ink-muted);
        }

        /* Tracing State Badges */
        .aura-trace-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'Times New Roman', Times, serif;
          font-size: 12px;
          background: var(--surface);
          border: 1px solid var(--line);
        }
        .aura-trace-badge.current {
          border-color: var(--high);
          background: rgba(240, 138, 0, 0.18);
          color: var(--high);
          box-shadow: 0 0 0 3px rgba(240, 138, 0, 0.25);
          animation: pulse 1s ease-in-out infinite;
        }
        .aura-trace-badge.visited {
          border-color: var(--unit-available);
          color: var(--unit-available);
        }
        .aura-trace-badge.unvisited {
          color: var(--ink-subtle);
        }

        /* Moving Vehicle Marker */
        .aura-vehicle-marker {
          position: relative;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .vehicle-emoji {
          position: relative;
          z-index: 2;
          font-size: 20px;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }
        .vehicle-pulse {
          position: absolute;
          inset: 2px;
          border-radius: 50%;
          background: var(--unit-available);
          opacity: 0.3;
          animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .aura-flow-path {
            animation: none !important;
          }
          .vehicle-pulse {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
