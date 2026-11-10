import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import {
  Circle,
  GeoJSON,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { DockingFeature, MarkerColor } from '../../types/docking';
import type { PorpoiseRecord } from '../../types/porpoise';
import type { MarinePort } from '../../types/port';
import type { RouteLeg, RouteWaypoint } from '../../types/route';
import type { MapLayerConfig } from '../../types/config';
import type { KakaoBaseMapType, KakaoOverlayMapType } from '../../types/kakao';
import {
  buildDockingMarkerSpec,
  buildGpsPulseSpec,
  buildNavPortPinSpec,
  buildPorpoiseSpec,
  buildRouteDirectionArrowSpec,
  buildRouteLegBadgeSpec,
  buildRouteWaypointSpec,
  buildSeaWaypointGuideSpec,
  buildWeatherPinSpec,
  getDockingMarkerLeafletZOffset,
} from './mapMarkerTemplates';

export interface LegacyLeafletCanvasProps {
  baseMapType: KakaoBaseMapType;
  overlayMapTypes: KakaoOverlayMapType[];
  activeMainTab: 'notebook' | 'navigation';
  navSubTab: 'route' | 'weather';

  // 3.1 꼬미의 바다수첩
  features: DockingFeature[];
  selectedFeature: DockingFeature | null;
  onSelectFeature: (feature: DockingFeature) => void;
  layers: MapLayerConfig[];
  geoJsonLayersData: Record<string, any>;
  showPorpoiseLayer: boolean;
  isPorpoiseAddMode: boolean;
  isReportPickMode: boolean;
  porpoiseRecords: PorpoiseRecord[];
  onSelectPorpoise: (record: PorpoiseRecord) => void;
  onMapClickForPorpoise: (lat: number, lng: number) => void;
  onMapClickForReport: (lat: number, lng: number) => void;

  // 3.2 바닷길 콕콕 (경로 계산 & 소규모 선착장/항포구 마커)
  routeWaypoints: RouteWaypoint[];
  routeLegs: RouteLeg[];
  portsList: MarinePort[];
  showPortMarkersOnMap: boolean;
  selectedLegIndex?: number | null;
  onSelectLeg?: (legIndex: number | null) => void;
  showDirectionArrows?: boolean;
  fitRouteBoundsTrigger?: number;
  onUpdateWaypointPos: (id: string, lat: number, lng: number) => void;
  onRemoveWaypoint?: (id: string) => void;
  onMapClickForRoute: (lat: number, lng: number) => void;

  // 3.2 바닷길 콕콕 (해상기상)
  weatherCoords: { lat: number; lng: number };
  weatherGrade: 'good' | 'moderate' | 'bad' | 'unknown';
  onUpdateWeatherCoords: (lat: number, lng: number) => void;

  // 공통
  userLocation: {
    lat: number;
    lng: number;
    accuracy?: number;
    isSimulated?: boolean;
  } | null;
  viewport: { lat: number; lng: number; zoom: number };
  onViewportChange: (lat: number, lng: number, zoom: number) => void;
  flyTarget: { lat: number; lng: number; zoom: number; nonce: number } | null;
  zoomStepTrigger: { delta: number; nonce: number } | null;
}

const DEFAULT_ZOOM = 11;

/**
 * 모듈 레벨 L.DivIcon 캐시:
 * 불필요한 DOM 마커 재생성(teardown/rebuild)을 방지하여 모바일 60fps 드래그 성능을 보장합니다.
 */
const iconCache = new Map<string, L.DivIcon>();

function getCachedDivIcon(key: string, factory: () => L.DivIcon): L.DivIcon {
  const cached = iconCache.get(key);
  if (cached) return cached;
  const created = factory();
  iconCache.set(key, created);
  return created;
}

function getDockingMarkerIcon(
  color: MarkerColor,
  pointCode: string,
  isSelected: boolean,
): L.DivIcon {
  const cacheKey = `docking:${color}:${pointCode}:${isSelected ? 1 : 0}`;
  return getCachedDivIcon(cacheKey, () => {
    const spec = buildDockingMarkerSpec(color, pointCode, isSelected);
    return L.divIcon({
      className: 'bada-custom-marker',
      html: spec.html,
      iconSize: [spec.width, spec.height],
      iconAnchor: [spec.anchorX, spec.anchorY],
    });
  });
}

function getNavPortPinIcon(port: MarinePort, showLabel: boolean): L.DivIcon {
  const isSmallBerth = port.subCategory === 'small_berth' || port.category === 'docking';
  const cacheKey = `navport:${port.id}:${isSmallBerth ? 'sb' : 'pt'}:${showLabel ? 'lbl' : 'dot'}`;
  return getCachedDivIcon(cacheKey, () => {
    const spec = buildNavPortPinSpec(port, showLabel);
    return L.divIcon({
      className: 'bada-custom-marker',
      html: spec.html,
      iconSize: [spec.width, spec.height],
      iconAnchor: [spec.anchorX, spec.anchorY],
    });
  });
}

function getPorpoiseIcon(count: number): L.DivIcon {
  const cacheKey = `porpoise:${count}`;
  return getCachedDivIcon(cacheKey, () => {
    const spec = buildPorpoiseSpec(count);
    return L.divIcon({
      className: 'bada-custom-marker',
      html: spec.html,
      iconSize: [spec.width, spec.height],
      iconAnchor: [spec.anchorX, spec.anchorY],
    });
  });
}

function getRouteWaypointIcon(
  type: 'start' | 'waypoint' | 'end',
  label: string,
  orderIdx: number,
  waypointId?: string,
): L.DivIcon {
  const shortLabel = label.length > 12 ? `${label.slice(0, 12)}…` : label;
  const cacheKey = `wp:${type}:${orderIdx}:${shortLabel}:${waypointId ?? ''}`;
  return getCachedDivIcon(cacheKey, () => {
    const spec = buildRouteWaypointSpec(type, label, orderIdx, waypointId);
    return L.divIcon({
      className: 'bada-custom-marker',
      html: spec.html,
      iconSize: [spec.width, spec.height],
      iconAnchor: [spec.anchorX, spec.anchorY],
    });
  });
}

function getRouteLegBadgeIcon(
  durationMinutes: number,
  distanceNm: number,
  bearingDeg: number,
  cardinal: string,
  legIndex: number,
  safetyLevel: 'safe' | 'caution' | 'danger' = 'safe',
  isSelected = false,
): L.DivIcon {
  const mins = Math.round(durationMinutes);
  const nmStr = distanceNm.toFixed(1);
  const cacheKey = `legbadge:${mins}:${nmStr}:${bearingDeg}:${legIndex}:${safetyLevel}:${isSelected ? 1 : 0}`;
  return getCachedDivIcon(cacheKey, () => {
    const spec = buildRouteLegBadgeSpec(durationMinutes, distanceNm, bearingDeg, cardinal, {
      legIndex,
      safetyLevel,
      isSelected,
    });
    return L.divIcon({
      className: 'bada-custom-marker',
      html: spec.html,
      iconSize: [spec.width, spec.height],
      iconAnchor: [spec.anchorX, spec.anchorY],
    });
  });
}

function getRouteDirectionArrowIcon(
  bearingDeg: number,
  safetyLevel: 'safe' | 'caution' | 'danger' = 'safe',
  isSelected = false,
): L.DivIcon {
  const quantizedDeg = ((Math.round(bearingDeg / 5) * 5) % 360 + 360) % 360;
  const cacheKey = `dirarrow:${quantizedDeg}:${safetyLevel}:${isSelected ? 1 : 0}`;
  return getCachedDivIcon(cacheKey, () => {
    const spec = buildRouteDirectionArrowSpec(quantizedDeg, safetyLevel, isSelected);
    return L.divIcon({
      className: 'bada-custom-marker',
      html: spec.html,
      iconSize: [spec.width, spec.height],
      iconAnchor: [spec.anchorX, spec.anchorY],
    });
  });
}

function getSeaWaypointGuideIcon(name: string, isSelected = false): L.DivIcon {
  const cacheKey = `wpguide:${name}:${isSelected ? 1 : 0}`;
  return getCachedDivIcon(cacheKey, () => {
    const spec = buildSeaWaypointGuideSpec(name, isSelected);
    return L.divIcon({
      className: 'bada-custom-marker',
      html: spec.html,
      iconSize: [spec.width, spec.height],
      iconAnchor: [spec.anchorX, spec.anchorY],
    });
  });
}

function getWeatherPinIcon(
  grade: 'good' | 'moderate' | 'bad' | 'unknown',
): L.DivIcon {
  const cacheKey = `weather:${grade}`;
  return getCachedDivIcon(cacheKey, () => {
    const spec = buildWeatherPinSpec(grade);
    return L.divIcon({
      className: 'bada-custom-marker',
      html: spec.html,
      iconSize: [spec.width, spec.height],
      iconAnchor: [spec.anchorX, spec.anchorY],
    });
  });
}

function getGpsPulseIcon(): L.DivIcon {
  return getCachedDivIcon('gps:pulse', () => {
    const spec = buildGpsPulseSpec();
    return L.divIcon({
      className: 'bada-custom-marker',
      html: spec.html,
      iconSize: [spec.width, spec.height],
      iconAnchor: [spec.anchorX, spec.anchorY],
    });
  });
}

function MapEventsAndCameraController({
  activeMainTab,
  navSubTab,
  isPorpoiseAddMode,
  isReportPickMode,
  onMapClickForPorpoise,
  onMapClickForReport,
  onMapClickForRoute,
  onUpdateWeatherCoords,
  onZoomChange,
  onViewportChange,
  flyTarget,
  zoomStepTrigger,
  fitRouteBoundsTrigger,
  routeBoundsPositions,
}: {
  activeMainTab: 'notebook' | 'navigation';
  navSubTab: 'route' | 'weather';
  isPorpoiseAddMode: boolean;
  isReportPickMode: boolean;
  onMapClickForPorpoise: (lat: number, lng: number) => void;
  onMapClickForReport: (lat: number, lng: number) => void;
  onMapClickForRoute: (lat: number, lng: number) => void;
  onUpdateWeatherCoords: (lat: number, lng: number) => void;
  onZoomChange: (zoom: number) => void;
  onViewportChange: (lat: number, lng: number, zoom: number) => void;
  flyTarget: { lat: number; lng: number; zoom: number; nonce: number } | null;
  zoomStepTrigger: { delta: number; nonce: number } | null;
  fitRouteBoundsTrigger?: number;
  routeBoundsPositions?: [number, number][];
}) {
  const map = useMap();

  useMapEvents({
    zoomend() {
      const z = map.getZoom();
      const c = map.getCenter();
      onZoomChange(z);
      onViewportChange(c.lat, c.lng, z);
    },
    moveend() {
      const z = map.getZoom();
      const c = map.getCenter();
      onViewportChange(c.lat, c.lng, z);
    },
    click(e) {
      const { lat, lng } = e.latlng;
      if (isReportPickMode) {
        onMapClickForReport(lat, lng);
        return;
      }
      if (isPorpoiseAddMode) {
        onMapClickForPorpoise(lat, lng);
        return;
      }
      if (activeMainTab === 'navigation') {
        if (navSubTab === 'route') {
          onMapClickForRoute(lat, lng);
        } else if (navSubTab === 'weather') {
          onUpdateWeatherCoords(lat, lng);
        }
      }
    },
  });

  useEffect(() => {
    if (!flyTarget) return;
    map.flyTo([flyTarget.lat, flyTarget.lng], flyTarget.zoom, {
      animate: true,
      duration: 0.75,
    });
  }, [flyTarget, map]);

  useEffect(() => {
    if (!zoomStepTrigger) return;
    if (zoomStepTrigger.delta > 0) {
      map.zoomIn();
    } else if (zoomStepTrigger.delta < 0) {
      map.zoomOut();
    }
  }, [zoomStepTrigger, map]);

  useEffect(() => {
    if (!fitRouteBoundsTrigger || !routeBoundsPositions || routeBoundsPositions.length < 2) {
      return;
    }
    try {
      const bounds = L.latLngBounds(routeBoundsPositions);
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          paddingTopLeft: [48, 72],
          paddingBottomRight: [48, 280],
          maxZoom: 14,
          animate: true,
        });
      }
    } catch {
      // ignore invalid bounds
    }
  }, [fitRouteBoundsTrigger, routeBoundsPositions, map]);

  return null;
}

export function LegacyLeafletCanvas({
  baseMapType,
  overlayMapTypes,
  activeMainTab,
  navSubTab,
  features,
  selectedFeature,
  onSelectFeature,
  layers,
  geoJsonLayersData,
  showPorpoiseLayer,
  isPorpoiseAddMode,
  isReportPickMode,
  porpoiseRecords,
  onSelectPorpoise,
  onMapClickForPorpoise,
  onMapClickForReport,
  routeWaypoints,
  routeLegs,
  portsList,
  showPortMarkersOnMap,
  selectedLegIndex = null,
  onSelectLeg,
  showDirectionArrows = true,
  fitRouteBoundsTrigger = 0,
  onUpdateWaypointPos,
  onRemoveWaypoint,
  onMapClickForRoute,
  weatherCoords,
  weatherGrade,
  onUpdateWeatherCoords,
  userLocation,
  viewport,
  onViewportChange,
  flyTarget,
  zoomStepTrigger,
}: LegacyLeafletCanvasProps) {
  const gpsPulseIcon = useMemo(() => getGpsPulseIcon(), []);
  const [currentZoom, setCurrentZoom] = useState<number>(viewport.zoom || DEFAULT_ZOOM);
  const initialCenter = useMemo<[number, number]>(
    () => [viewport.lat, viewport.lng],
    // 초기 마운트 시점의 viewport로만 MapContainer 초기화
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialZoom = useMemo<number>(
    () => viewport.zoom || DEFAULT_ZOOM,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const activeWaypointPortIds = useMemo(() => {
    const set = new Set<string>();
    for (const wp of routeWaypoints) {
      if (wp.matchedPortId) set.add(wp.matchedPortId);
    }
    return set;
  }, [routeWaypoints]);

  const polylinePositions = useMemo(() => {
    if (
      routeLegs.length > 0 &&
      routeLegs.some((leg) => leg.pathPositions && leg.pathPositions.length >= 2)
    ) {
      const merged: [number, number][] = [];
      for (const leg of routeLegs) {
        const pts =
          leg.pathPositions && leg.pathPositions.length >= 2
            ? leg.pathPositions
            : ([
                [leg.from.lat, leg.from.lng],
                [leg.to.lat, leg.to.lng],
              ] as [number, number][]);
        for (let i = 0; i < pts.length; i++) {
          if (merged.length === 0 || i > 0) {
            merged.push(pts[i]);
          }
        }
      }
      return merged;
    }
    return routeWaypoints.map((wp) => [wp.lat, wp.lng] as [number, number]);
  }, [routeLegs, routeWaypoints]);

  const routeArrowZoomTier = currentZoom <= 10 ? 0 : currentZoom <= 12 ? 1 : 2;
  const showSeaChannelGuides = currentZoom >= 12;

  const visibleDirectionArrows = useMemo(() => {
    if (!showDirectionArrows) return [];
    const maxTotalArrows = routeArrowZoomTier === 0 ? 6 : routeArrowZoomTier === 1 ? 14 : 24;
    const list: {
      key: string;
      lat: number;
      lng: number;
      bearingDeg: number;
      safetyLevel: 'safe' | 'caution' | 'danger';
      isSelected: boolean;
    }[] = [];

    routeLegs.forEach((leg, legIdx) => {
      const isSelected = selectedLegIndex === legIdx;
      const arrows = leg.directionArrows ?? [];
      const filtered =
        routeArrowZoomTier === 0
          ? arrows.slice(0, 1)
          : routeArrowZoomTier === 1
            ? arrows.filter((_, i) => i % 2 === 0).slice(0, 3)
            : arrows;
      filtered.forEach((a, aIdx) => {
        if (list.length >= maxTotalArrows) return;
        list.push({
          key: `dir-arrow-${leg.id}-${aIdx}`,
          lat: a.lat,
          lng: a.lng,
          bearingDeg: a.bearingDeg,
          safetyLevel: leg.safetyLevel ?? 'safe',
          isSelected,
        });
      });
    });
    return list;
  }, [showDirectionArrows, routeArrowZoomTier, routeLegs, selectedLegIndex]);

  const visibleChannelGuides = useMemo(() => {
    if (!showDirectionArrows || !showSeaChannelGuides) return [];
    const seen = new Set<string>();
    const list: { id: string; name: string; lat: number; lng: number; isSelected: boolean }[] = [];
    routeLegs.forEach((leg, legIdx) => {
      const isSelected = selectedLegIndex === legIdx;
      for (const wpGuide of leg.activeWaypoints ?? []) {
        if (seen.has(wpGuide.id)) continue;
        seen.add(wpGuide.id);
        list.push({
          id: wpGuide.id,
          name: wpGuide.name,
          lat: wpGuide.lat,
          lng: wpGuide.lng,
          isSelected,
        });
      }
    });
    return list;
  }, [showDirectionArrows, showSeaChannelGuides, routeLegs, selectedLegIndex]);

  return (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      minZoom={7}
      maxZoom={18}
      zoomControl={false}
      bounceAtZoomLimits={false}
      worldCopyJump={false}
      className="h-full w-full"
    >
      {baseMapType === 'skyview' || baseMapType === 'hybrid' ? (
        <TileLayer
          attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={18}
        />
      ) : overlayMapTypes.includes('terrain') ? (
        <TileLayer
          attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
          url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          maxZoom={17}
        />
      ) : (
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
      )}

      <MapEventsAndCameraController
        activeMainTab={activeMainTab}
        navSubTab={navSubTab}
        isPorpoiseAddMode={isPorpoiseAddMode}
        isReportPickMode={isReportPickMode}
        onMapClickForPorpoise={onMapClickForPorpoise}
        onMapClickForReport={onMapClickForReport}
        onMapClickForRoute={onMapClickForRoute}
        onUpdateWeatherCoords={onUpdateWeatherCoords}
        onZoomChange={setCurrentZoom}
        onViewportChange={onViewportChange}
        flyTarget={flyTarget}
        zoomStepTrigger={zoomStepTrigger}
        fitRouteBoundsTrigger={fitRouteBoundsTrigger}
        routeBoundsPositions={polylinePositions}
      />

      {/* 1. QGIS 공간정보 레이어 (Polygon, LineString, Point 및 동적 스타일/라벨) */}
      {layers.map((layer) => {
        const fc = geoJsonLayersData[layer.id];
        if (!layer.visible || layer.id === 'docking' || layer.isSystemLayer || !fc) {
          return null;
        }
        const strokeColor = layer.style?.strokeColor || layer.color || '#10b981';
        const strokeWidth =
          layer.style?.strokeWidth ?? (layer.id === 'national_park' ? 2.5 : 3);
        const strokeOpacity = layer.style?.strokeOpacity ?? 0.92;
        const strokeDash =
          layer.style?.strokeDash ??
          (layer.id === 'protected_area' ? 'shortdash' : 'solid');
        const dashArray =
          strokeDash === 'shortdash'
            ? '8 5'
            : strokeDash === 'shortdot'
              ? '3 5'
              : undefined;
        const fillColor = layer.style?.fillColor || layer.color || '#10b981';
        const fillOpacity =
          layer.style?.fillOpacity ?? (layer.id === 'national_park' ? 0.08 : 0.16);
        const pointRadius = layer.style?.pointRadius ?? 7;
        const labelField = layer.style?.labelField || 'name';
        const showLabels = layer.style?.showLabels !== false;
        const versionKey = `${layer.id}:${layer.color}:${strokeColor}:${strokeWidth}:${strokeDash}:${fillColor}:${fillOpacity}:${pointRadius}:${labelField}:${showLabels}:${fc?.features?.length ?? 0}:${layer.sourceMeta?.dataSha256 ?? ''}`;

        return (
          <GeoJSON
            key={versionKey}
            data={fc}
            style={() => ({
              color: strokeColor,
              weight: strokeWidth,
              opacity: strokeOpacity,
              fillColor,
              fillOpacity,
              dashArray,
            })}
            pointToLayer={(_feature, latlng) =>
              L.circleMarker(latlng, {
                radius: pointRadius,
                color: '#ffffff',
                weight: 2,
                fillColor,
                fillOpacity: 0.92,
              })
            }
            onEachFeature={(feature, leafletLayer) => {
              if (!showLabels) return;
              const props = feature?.properties ?? {};
              const lbl =
                props[labelField] ?? props.name ?? props.명칭 ?? props.이름 ?? '';
              if (lbl) {
                leafletLayer.bindTooltip(String(lbl), {
                  permanent: false,
                  direction: 'top',
                });
              }
            }}
          />
        );
      })}

      {/* 2. [3.1 꼬미의 바다수첩] 갯바위 접안 및 소규모 선착장 마커 */}
      {activeMainTab === 'notebook' &&
        layers.find((l) => l.id === 'docking')?.visible !== false &&
        features.map((feature) => {
          const [lng, lat] = feature.geometry.coordinates;
          const isSelected =
            selectedFeature?.properties.id === feature.properties.id;
          const icon = getDockingMarkerIcon(
            feature.properties.color,
            feature.properties.id,
            isSelected,
          );

          return (
            <Marker
              key={feature.properties.id}
              position={[lat, lng]}
              icon={icon}
              zIndexOffset={getDockingMarkerLeafletZOffset(
                feature.properties.color,
                isSelected,
              )}
              eventHandlers={{
                click: () => onSelectFeature(feature),
              }}
            />
          );
        })}

      {/* 3. [3.1 꼬미의 바다수첩] 개인 상괭이 관찰기록 마커 */}
      {activeMainTab === 'notebook' &&
        showPorpoiseLayer &&
        porpoiseRecords.map((record) => (
          <Marker
            key={record.id}
            position={[record.lat, record.lng]}
            icon={getPorpoiseIcon(record.count)}
            eventHandlers={{
              click: () => onSelectPorpoise(record),
            }}
          />
        ))}

      {/* 4. [3.2 바닷길 콕콕 - 시간계산기] */}
      {activeMainTab === 'navigation' && navSubTab === 'route' && (
        <>
          {showPortMarkersOnMap &&
            portsList
              .filter((port) => !activeWaypointPortIds.has(port.id))
              .map((port) => (
                <Marker
                  key={`nav-port-${port.id}`}
                  position={[port.lat, port.lng]}
                  icon={getNavPortPinIcon(port, currentZoom >= 13)}
                  zIndexOffset={150}
                  eventHandlers={{
                    click: () => onMapClickForRoute(port.lat, port.lng),
                  }}
                />
              ))}

          {/* 선택된 구간이 있을 때만 해당 구간의 직선 대권 참고선 표시 */}
          {selectedLegIndex !== null && routeLegs[selectedLegIndex] && (
            <Polyline
              positions={[
                [
                  routeLegs[selectedLegIndex].from.lat,
                  routeLegs[selectedLegIndex].from.lng,
                ],
                [routeLegs[selectedLegIndex].to.lat, routeLegs[selectedLegIndex].to.lng],
              ]}
              pathOptions={{
                color: '#94a3b8',
                weight: 1.5,
                dashArray: '4 6',
                opacity: 0.55,
              }}
            />
          )}

          {/* 구간별 3중 케이싱(3-Tier Casing) 해상 실항로 폴리라인 */}
          {routeLegs.map((leg, legIdx) => {
            const pts =
              leg.pathPositions && leg.pathPositions.length >= 2
                ? leg.pathPositions
                : ([
                    [leg.from.lat, leg.from.lng],
                    [leg.to.lat, leg.to.lng],
                  ] as [number, number][]);
            if (pts.length < 2) return null;
            const isSelected = selectedLegIndex === legIdx;
            const mainColor = isSelected
              ? '#34d399'
              : leg.safetyLevel === 'danger'
                ? '#f59e0b'
                : '#00e5ff';

            return (
              <span key={`leg-poly-group-${leg.id}`}>
                <Polyline
                  positions={pts}
                  pathOptions={{
                    color: '#020617',
                    weight: isSelected ? 11 : 8.5,
                    opacity: 0.88,
                  }}
                />
                <Polyline
                  positions={pts}
                  pathOptions={{
                    color: mainColor,
                    weight: isSelected ? 6.5 : 4.8,
                    opacity: 0.96,
                  }}
                />
                <Polyline
                  positions={pts}
                  pathOptions={{
                    color: isSelected ? '#ecfdf5' : '#e0f2fe',
                    weight: isSelected ? 2.2 : 1.6,
                    dashArray: '8 6',
                    opacity: 0.9,
                  }}
                />
              </span>
            );
          })}

          {/* 진행 방향 화살표(➤) */}
          {visibleDirectionArrows.map((arrow) => (
            <Marker
              key={arrow.key}
              position={[arrow.lat, arrow.lng]}
              icon={getRouteDirectionArrowIcon(
                arrow.bearingDeg,
                arrow.safetyLevel,
                arrow.isSelected,
              )}
              interactive={false}
              zIndexOffset={arrow.isSelected ? 390 : 340}
            />
          ))}

          {/* 해상 변침점 수로 가이드(◆) */}
          {visibleChannelGuides.map((guide) => (
            <Marker
              key={`wp-guide-${guide.id}`}
              position={[guide.lat, guide.lng]}
              icon={getSeaWaypointGuideIcon(guide.name, guide.isSelected)}
              interactive={false}
              zIndexOffset={guide.isSelected ? 385 : 330}
            />
          ))}

          {/* 구간 진중점(50% Arc-Length) 소요시간·해리·회전 침로 배지 */}
          {routeLegs.map((leg, legIdx) => {
            const isSelected = selectedLegIndex === legIdx;
            return (
              <Marker
                key={`leg-badge-${leg.id}`}
                position={[leg.midLat, leg.midLng]}
                icon={getRouteLegBadgeIcon(
                  leg.durationMinutes,
                  leg.distanceNm,
                  leg.bearingDeg,
                  leg.cardinal,
                  legIdx,
                  leg.safetyLevel ?? 'safe',
                  isSelected,
                )}
                interactive={Boolean(onSelectLeg)}
                zIndexOffset={isSelected ? 460 : 420}
                eventHandlers={
                  onSelectLeg
                    ? {
                        click: (e) => {
                          e.originalEvent?.stopPropagation();
                          onSelectLeg(isSelected ? null : legIdx);
                        },
                      }
                    : undefined
                }
              />
            );
          })}

          {routeWaypoints.map((wp, idx) => (
            <Marker
              key={wp.id}
              position={[wp.lat, wp.lng]}
              icon={getRouteWaypointIcon(wp.type, wp.name, idx, wp.id)}
              draggable={true}
              zIndexOffset={700}
              eventHandlers={{
                click: (e) => {
                  const origTarget = e.originalEvent?.target as HTMLElement | null;
                  const removeBtn = origTarget?.closest(
                    '[data-remove-waypoint-id]',
                  ) as HTMLElement | null;
                  if (removeBtn && onRemoveWaypoint) {
                    e.originalEvent?.stopPropagation();
                    onRemoveWaypoint(wp.id);
                  }
                },
                dragend: (e) => {
                  const latlng = e.target.getLatLng();
                  onUpdateWaypointPos(wp.id, latlng.lat, latlng.lng);
                },
              }}
            />
          ))}
        </>
      )}

      {/* 5. [3.2 바닷길 콕콕 - 해상기상] 3단계 신호등 드래그 마커 */}
      {activeMainTab === 'navigation' && navSubTab === 'weather' && (
        <Marker
          position={[weatherCoords.lat, weatherCoords.lng]}
          icon={getWeatherPinIcon(weatherGrade)}
          draggable={true}
          zIndexOffset={800}
          eventHandlers={{
            dragend: (e) => {
              const latlng = e.target.getLatLng();
              onUpdateWeatherCoords(latlng.lat, latlng.lng);
            },
          }}
        />
      )}

      {/* 6. GPS 현재 위치 펄스 마커 */}
      {userLocation && (
        <>
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={userLocation.accuracy ?? 120}
            pathOptions={{
              color: '#38bdf8',
              fillColor: '#0ea5e9',
              fillOpacity: 0.14,
              weight: 1.5,
            }}
          />
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={gpsPulseIcon}
            zIndexOffset={1000}
          />
        </>
      )}
    </MapContainer>
  );
}
