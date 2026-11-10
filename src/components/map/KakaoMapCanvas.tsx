import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DockingFeature } from '../../types/docking';
import type { PorpoiseRecord } from '../../types/porpoise';
import type { MarinePort } from '../../types/port';
import type { RouteLeg, RouteWaypoint } from '../../types/route';
import type { MapLayerConfig } from '../../types/config';
import type {
  KakaoBaseMapType,
  KakaoCircle,
  KakaoCustomOverlay,
  KakaoLatLng,
  KakaoMap,
  KakaoMapsNamespace,
  KakaoMouseEvent,
  KakaoOverlayMapType,
  KakaoPolygon,
  KakaoPolyline,
} from '../../types/kakao';
import {
  kakaoLevelToLeafletZoom,
  leafletZoomToKakaoLevel,
} from '../../services/kakaoMapLoader';
import {
  buildDockingMarkerSpec,
  buildGpsPulseSpec,
  buildNavPortPinSpec,
  buildPorpoiseSpec,
  buildRouteDirectionArrowSpec,
  buildRouteLegBadgeSpec,
  buildRouteWaypointSpec,
  buildSeaWaypointGuideSpec,
  buildSpatialLayerLabelSpec,
  buildSpatialLayerPointSpec,
  buildWeatherPinSpec,
  getDockingMarkerZIndex,
  type MarkerTemplateSpec,
} from './mapMarkerTemplates';

export interface KakaoMapCanvasProps {
  kakaoMaps: KakaoMapsNamespace;
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
  onMapClickForRoadview: (lat: number, lng: number) => void;

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

const DEFAULT_LEAFLET_ZOOM = 11;

/**
 * 마커 HTML 문자열을 실제 DOM Element로 변환하고,
 * 클릭/포인터 이벤트가 하단 Kakao Map으로 전파(버블링)되는 것을 차단하는 헬퍼
 */
function createOverlayElement(
  kakaoMaps: KakaoMapsNamespace,
  spec: MarkerTemplateSpec,
  onClick?: () => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = spec.html.trim();
  const el = (wrapper.firstElementChild as HTMLElement) ?? wrapper;

  const stopMapPropagation = (e: Event) => {
    e.stopPropagation();
    try {
      kakaoMaps.event.preventMap();
    } catch {
      // ignore if outside map event loop
    }
  };

  if (onClick) {
    el.addEventListener('pointerdown', stopMapPropagation);
    el.addEventListener('mousedown', stopMapPropagation);
    el.addEventListener('touchstart', stopMapPropagation, { passive: true });
    el.addEventListener('click', (e) => {
      stopMapPropagation(e);
      onClick();
    });
  }

  return el;
}

/**
 * Kakao CustomOverlay에 포인터 캡처 기반 60fps 드래그(Pointer-Capture Drag)를 부여하는 헬퍼
 * - modern-web-guidance (drag) 준수:
 *   1) 마커 내부 인터랙티브 버튼([data-remove-waypoint-id] 취소 버튼 등) 클릭 시 드래그 진입 차단 및 즉시 취소 콜백 실행
 *   2) 포인터 이동 거리 4px 초과(Math.hypot > 4) 시에만 실제 드래그 상태로 전환하여 단순 탭 시 불필요한 onDragEnd 오발화 원천 차단
 */
function attachDraggableToCustomOverlay(
  kakaoMaps: KakaoMapsNamespace,
  map: KakaoMap,
  containerEl: HTMLElement,
  overlay: KakaoCustomOverlay,
  el: HTMLElement,
  onDragEnd: (lat: number, lng: number) => void,
  onRemoveWaypoint?: (id: string) => void,
): void {
  let isPointerDown = false;
  let hasMoved = false;
  let startX = 0;
  let startY = 0;
  let activePointerId: number | null = null;

  const stopBubble = (e: Event) => {
    e.stopPropagation();
    try {
      kakaoMaps.event.preventMap();
    } catch {
      // ignore
    }
  };

  el.addEventListener('mousedown', stopBubble);
  el.addEventListener('touchstart', stopBubble, { passive: true });
  el.addEventListener('click', (e: MouseEvent) => {
    stopBubble(e);
    const target = e.target as HTMLElement | null;
    const removeBtn = target?.closest('[data-remove-waypoint-id]') as HTMLElement | null;
    if (removeBtn && onRemoveWaypoint) {
      const wpId = removeBtn.getAttribute('data-remove-waypoint-id');
      if (wpId) {
        onRemoveWaypoint(wpId);
      }
    }
  });

  el.addEventListener('pointerdown', (e: PointerEvent) => {
    stopBubble(e);
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, a')) {
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') {
      return;
    }
    isPointerDown = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    activePointerId = e.pointerId;
    map.setDraggable(false);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // ignore if unsupported
    }
  });

  el.addEventListener('pointermove', (e: PointerEvent) => {
    if (!isPointerDown || e.pointerId !== activePointerId) return;
    stopBubble(e);

    if (!hasMoved) {
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist <= 4) return;
      hasMoved = true;
      el.style.cursor = 'grabbing';
    }

    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const proj = map.getProjection();
    if (!proj) return;
    const nextLatLng = proj.coordsFromContainerPoint(new kakaoMaps.Point(x, y));
    if (nextLatLng) {
      overlay.setPosition(nextLatLng);
    }
  });

  const finishDrag = (e: PointerEvent) => {
    if (!isPointerDown || e.pointerId !== activePointerId) return;
    stopBubble(e);
    const didMove = hasMoved;
    isPointerDown = false;
    hasMoved = false;
    activePointerId = null;
    el.style.cursor = 'grab';
    map.setDraggable(true);

    try {
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (didMove) {
      const finalPos = overlay.getPosition();
      onDragEnd(finalPos.getLat(), finalPos.getLng());
    }
  };

  el.addEventListener('pointerup', finishDrag);
  el.addEventListener('pointercancel', finishDrag);
}

interface ParsedKakaoLayerPrimitives {
  polygons: { rings: KakaoLatLng[][]; label?: string; center?: KakaoLatLng }[];
  polylines: { path: KakaoLatLng[]; label?: string; center?: KakaoLatLng }[];
  points: { position: KakaoLatLng; label: string }[];
}

/**
 * GeoJSON FeatureCollection 내의 모든 도형(Polygon, MultiPolygon, LineString, MultiLineString, Point, MultiPoint)을
 * Kakao Map 프리미티브 배열로 파싱하는 헬퍼
 */
function parseGeoJsonToKakaoPrimitives(
  kakaoMaps: KakaoMapsNamespace,
  geojson: any,
  labelField = 'name',
): ParsedKakaoLayerPrimitives {
  const result: ParsedKakaoLayerPrimitives = {
    polygons: [],
    polylines: [],
    points: [],
  };
  if (!geojson || !Array.isArray(geojson.features)) return result;

  const convertCoords = (coords: number[][]): KakaoLatLng[] =>
    coords
      .filter((pt) => Array.isArray(pt) && pt.length >= 2)
      .map(([lng, lat]) => new kakaoMaps.LatLng(lat, lng));

  const computeCenter = (pts: KakaoLatLng[]): KakaoLatLng | undefined => {
    if (pts.length === 0) return undefined;
    let sumLat = 0;
    let sumLng = 0;
    for (const p of pts) {
      sumLat += p.getLat();
      sumLng += p.getLng();
    }
    return new kakaoMaps.LatLng(sumLat / pts.length, sumLng / pts.length);
  };

  for (const feature of geojson.features) {
    const geom = feature?.geometry;
    if (!geom) continue;
    const props = feature?.properties ?? {};
    const rawLabel =
      props[labelField] ?? props.name ?? props.명칭 ?? props.이름 ?? props.id ?? '';
    const labelStr = rawLabel ? String(rawLabel) : '';

    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
      const rings = geom.coordinates.map(convertCoords).filter((r: KakaoLatLng[]) => r.length >= 3);
      if (rings.length > 0) {
        result.polygons.push({
          rings,
          label: labelStr,
          center: computeCenter(rings[0]),
        });
      }
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      for (const polyCoords of geom.coordinates) {
        if (Array.isArray(polyCoords)) {
          const rings = polyCoords.map(convertCoords).filter((r: KakaoLatLng[]) => r.length >= 3);
          if (rings.length > 0) {
            result.polygons.push({
              rings,
              label: labelStr,
              center: computeCenter(rings[0]),
            });
          }
        }
      }
    } else if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
      const path = convertCoords(geom.coordinates);
      if (path.length >= 2) {
        result.polylines.push({
          path,
          label: labelStr,
          center: path[Math.floor(path.length / 2)],
        });
      }
    } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
      for (const lineCoords of geom.coordinates) {
        if (Array.isArray(lineCoords)) {
          const path = convertCoords(lineCoords);
          if (path.length >= 2) {
            result.polylines.push({
              path,
              label: labelStr,
              center: path[Math.floor(path.length / 2)],
            });
          }
        }
      }
    } else if (geom.type === 'Point' && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
      const [lng, lat] = geom.coordinates;
      result.points.push({
        position: new kakaoMaps.LatLng(lat, lng),
        label: labelStr,
      });
    } else if (geom.type === 'MultiPoint' && Array.isArray(geom.coordinates)) {
      for (const pt of geom.coordinates) {
        if (Array.isArray(pt) && pt.length >= 2) {
          result.points.push({
            position: new kakaoMaps.LatLng(pt[1], pt[0]),
            label: labelStr,
          });
        }
      }
    }
  }

  return result;
}

export function KakaoMapCanvas({
  kakaoMaps,
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
  onMapClickForRoadview,
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
}: KakaoMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const appliedOverlayTypeIdsRef = useRef<number[]>([]);
  const initialViewportRef = useRef(viewport);
  const onViewportChangeRef = useRef(onViewportChange);
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);
  const [currentLeafletZoom, setCurrentLeafletZoom] = useState<number>(
    viewport.zoom || DEFAULT_LEAFLET_ZOOM,
  );

  // 각 레이어별 오버레이/도형 인스턴스 Ref (메모리 누수 및 좀비 마커 원천 방지)
  const polygonsRef = useRef<KakaoPolygon[]>([]);
  const spatialPolylinesRef = useRef<KakaoPolyline[]>([]);
  const spatialOverlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const dockingOverlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const porpoiseOverlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const portOverlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const polylinesRef = useRef<KakaoPolyline[]>([]);
  const legBadgeOverlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const waypointOverlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const weatherOverlayRef = useRef<KakaoCustomOverlay | null>(null);
  const gpsCircleRef = useRef<KakaoCircle | null>(null);
  const gpsOverlayRef = useRef<KakaoCustomOverlay | null>(null);

  // 최신 클릭 핸들러 컨텍스트를 Ref로 유지 (지도 및 폴리곤 클릭 이벤트 브릿징용)
  const clickContextRef = useRef({
    activeMainTab,
    navSubTab,
    isPorpoiseAddMode,
    isReportPickMode,
    overlayMapTypes,
    onMapClickForPorpoise,
    onMapClickForReport,
    onMapClickForRoadview,
    onMapClickForRoute,
    onUpdateWeatherCoords,
  });

  useEffect(() => {
    clickContextRef.current = {
      activeMainTab,
      navSubTab,
      isPorpoiseAddMode,
      isReportPickMode,
      overlayMapTypes,
      onMapClickForPorpoise,
      onMapClickForReport,
      onMapClickForRoadview,
      onMapClickForRoute,
      onUpdateWeatherCoords,
    };
  }, [
    activeMainTab,
    navSubTab,
    isPorpoiseAddMode,
    isReportPickMode,
    overlayMapTypes,
    onMapClickForPorpoise,
    onMapClickForReport,
    onMapClickForRoadview,
    onMapClickForRoute,
    onUpdateWeatherCoords,
  ]);

  const handleCoordinateClick = useCallback((lat: number, lng: number) => {
    const ctx = clickContextRef.current;
    if (ctx.isReportPickMode) {
      ctx.onMapClickForReport(lat, lng);
      return;
    }
    if (ctx.isPorpoiseAddMode) {
      ctx.onMapClickForPorpoise(lat, lng);
      return;
    }
    // 트러블슈팅 RC-03: 3D 로드뷰 구간(ROADVIEW) 오버레이 활성화 시 국립공원 폴리곤 내부 해안도로 클릭도 최우선으로 3D 로드뷰로 브릿징
    if (ctx.overlayMapTypes.includes('roadview')) {
      ctx.onMapClickForRoadview(lat, lng);
      return;
    }
    if (ctx.activeMainTab === 'navigation') {
      if (ctx.navSubTab === 'route') {
        ctx.onMapClickForRoute(lat, lng);
      } else if (ctx.navSubTab === 'weather') {
        ctx.onUpdateWeatherCoords(lat, lng);
      }
    }
  }, []);

  // 1. Kakao Map 인스턴스 초기화 및 ResizeObserver 등록
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initVp = initialViewportRef.current;
    const initialLevel = leafletZoomToKakaoLevel(initVp.zoom);
    const map = new kakaoMaps.Map(container, {
      center: new kakaoMaps.LatLng(initVp.lat, initVp.lng),
      level: initialLevel,
    });
    mapRef.current = map;

    const onMapClick = (mouseEvent: KakaoMouseEvent) => {
      if (!mouseEvent?.latLng) return;
      handleCoordinateClick(mouseEvent.latLng.getLat(), mouseEvent.latLng.getLng());
    };

    const syncViewportToParent = () => {
      const c = map.getCenter();
      const z = kakaoLevelToLeafletZoom(map.getLevel());
      setCurrentLeafletZoom(z);
      onViewportChangeRef.current(c.getLat(), c.getLng(), z);
    };

    kakaoMaps.event.addListener(map, 'click', onMapClick);
    kakaoMaps.event.addListener(map, 'zoom_changed', syncViewportToParent);
    kakaoMaps.event.addListener(map, 'dragend', syncViewportToParent);

    // 트러블슈팅 #6: 컨테이너 리사이즈(모바일 주소창 변화/모달 전환) 시 중심점 유지 relayout
    const resizeObserver = new ResizeObserver(() => {
      if (!mapRef.current) return;
      const prevCenter = mapRef.current.getCenter();
      mapRef.current.relayout();
      mapRef.current.setCenter(prevCenter);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      kakaoMaps.event.removeListener(map, 'click', onMapClick);
      kakaoMaps.event.removeListener(map, 'zoom_changed', syncViewportToParent);
      kakaoMaps.event.removeListener(map, 'dragend', syncViewportToParent);
      appliedOverlayTypeIdsRef.current = [];
      mapRef.current = null;
      container.innerHTML = '';
    };
  }, [kakaoMaps, handleCoordinateClick]);

  // 2. 베이스 맵 3종(ROADMAP / SKYVIEW / HYBRID) 및 중첩 오버레이 5종(TERRAIN / USE_DISTRICT / ROADVIEW / TRAFFIC / BICYCLE) 원자적 동기화
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const targetBaseTypeId =
      baseMapType === 'skyview'
        ? kakaoMaps.MapTypeId.SKYVIEW
        : baseMapType === 'hybrid'
          ? kakaoMaps.MapTypeId.HYBRID
          : kakaoMaps.MapTypeId.ROADMAP;
    map.setMapTypeId(targetBaseTypeId);

    const isDarkSatelliteBase = baseMapType === 'skyview' || baseMapType === 'hybrid';
    const desiredOverlayIds: number[] = [];

    for (const key of overlayMapTypes) {
      if (key === 'terrain' && kakaoMaps.MapTypeId.TERRAIN) {
        desiredOverlayIds.push(kakaoMaps.MapTypeId.TERRAIN);
      } else if (key === 'use_district' && kakaoMaps.MapTypeId.USE_DISTRICT) {
        desiredOverlayIds.push(kakaoMaps.MapTypeId.USE_DISTRICT);
      } else if (key === 'roadview' && kakaoMaps.MapTypeId.ROADVIEW) {
        desiredOverlayIds.push(kakaoMaps.MapTypeId.ROADVIEW);
      } else if (key === 'traffic' && kakaoMaps.MapTypeId.TRAFFIC) {
        desiredOverlayIds.push(kakaoMaps.MapTypeId.TRAFFIC);
      } else if (key === 'bicycle') {
        const bikeId = isDarkSatelliteBase
          ? (kakaoMaps.MapTypeId.BICYCLE_HYBRID ?? kakaoMaps.MapTypeId.BICYCLE)
          : kakaoMaps.MapTypeId.BICYCLE;
        if (bikeId) desiredOverlayIds.push(bikeId);
      }
    }

    const prevIds = appliedOverlayTypeIdsRef.current;
    for (const prevId of prevIds) {
      if (!desiredOverlayIds.includes(prevId)) {
        try {
          map.removeOverlayMapTypeId(prevId);
        } catch {
          // ignore
        }
      }
    }

    for (const nextId of desiredOverlayIds) {
      if (!prevIds.includes(nextId)) {
        try {
          map.addOverlayMapTypeId(nextId);
        } catch {
          // ignore
        }
      }
    }

    appliedOverlayTypeIdsRef.current = desiredOverlayIds;
  }, [kakaoMaps, baseMapType, overlayMapTypes]);

  // 3. 카메라 이동 (flyTarget) 반영 (setLevel 애니메이션과 panTo 동시 호출 시 panTo가 무시되는 Kakao SDK 레이스 컨디션 방지)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTarget) return;
    const targetLevel = leafletZoomToKakaoLevel(flyTarget.zoom);
    const targetLatLng = new kakaoMaps.LatLng(flyTarget.lat, flyTarget.lng);
    map.setCenter(targetLatLng);
    map.setLevel(targetLevel);
    setCurrentLeafletZoom(flyTarget.zoom);
    onViewportChangeRef.current(flyTarget.lat, flyTarget.lng, flyTarget.zoom);
  }, [kakaoMaps, flyTarget]);

  // 4. 우측 컨트롤 독 +/- 줌 버튼 제어
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomStepTrigger) return;
    const currentLevel = map.getLevel();
    // Kakao는 level이 작을수록 확대(Zoom In)이므로 delta 부호를 반전
    const nextLevel = Math.max(1, Math.min(13, currentLevel - zoomStepTrigger.delta));
    map.setLevel(nextLevel, { animate: true });
  }, [zoomStepTrigger]);

  const showSpatialLabels = currentLeafletZoom >= 11 && activeMainTab !== 'navigation';
  const showPortLabels = currentLeafletZoom >= 13;

  // 공간 레이어 GeoJSON 파싱 결과를 메모이제이션하여 줌 변경 시 재파싱 비용 제거
  const parsedSpatialPrimitivesById = useMemo(() => {
    const mapById: Record<string, ParsedKakaoLayerPrimitives> = {};
    for (const layer of layers) {
      if (!layer.visible || layer.id === 'docking' || layer.isSystemLayer) continue;
      const rawGeoJson = geoJsonLayersData[layer.id];
      if (!rawGeoJson) continue;
      const labelField = layer.style?.labelField || 'name';
      mapById[layer.id] = parseGeoJsonToKakaoPrimitives(
        kakaoMaps,
        rawGeoJson,
        labelField,
      );
    }
    return mapById;
  }, [kakaoMaps, layers, geoJsonLayersData]);

  // 5. QGIS 공간정보 전 도형(Polygon, LineString, Point) 및 라벨 렌더링 & 클릭 브릿징
  useEffect(() => {
    const map = mapRef.current;
    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];
    spatialPolylinesRef.current.forEach((l) => l.setMap(null));
    spatialPolylinesRef.current = [];
    spatialOverlaysRef.current.forEach((o) => o.setMap(null));
    spatialOverlaysRef.current = [];
    if (!map) return;

    const createdPolygons: KakaoPolygon[] = [];
    const polygonListeners: {
      polygon: KakaoPolygon;
      handler: (mouseEvent: KakaoMouseEvent) => void;
    }[] = [];
    const createdLines: KakaoPolyline[] = [];
    const createdOverlays: KakaoCustomOverlay[] = [];

    for (const layer of layers) {
      if (!layer.visible || layer.id === 'docking' || layer.isSystemLayer) continue;
      const primitives = parsedSpatialPrimitivesById[layer.id];
      if (!primitives) continue;

      const isNavMode = activeMainTab === 'navigation';
      const strokeColor = layer.style?.strokeColor || layer.color || '#10b981';
      const strokeWeight =
        layer.style?.strokeWidth ?? (layer.id === 'national_park' ? 2.5 : 3);
      const baseStrokeOpacity = layer.style?.strokeOpacity ?? 0.92;
      const strokeOpacity = isNavMode ? baseStrokeOpacity * 0.45 : baseStrokeOpacity;
      const strokeStyle =
        layer.style?.strokeDash ??
        (layer.id === 'protected_area' ? 'shortdash' : 'solid');
      const fillColor = layer.style?.fillColor || layer.color || '#10b981';
      const baseFillOpacity =
        layer.style?.fillOpacity ?? (layer.id === 'national_park' ? 0.08 : 0.16);
      const fillOpacity = isNavMode ? baseFillOpacity * 0.45 : baseFillOpacity;
      const pointRadius = layer.style?.pointRadius ?? 7;
      const showLabels = layer.style?.showLabels !== false && !isNavMode;
      const zIndex = layer.style?.zIndex ?? 15;

      for (const polyItem of primitives.polygons) {
        const polygon = new kakaoMaps.Polygon({
          map,
          path: polyItem.rings,
          strokeWeight,
          strokeColor,
          strokeOpacity,
          strokeStyle,
          fillColor,
          fillOpacity,
          zIndex,
        });

        const onPolyClick = (mouseEvent: KakaoMouseEvent) => {
          if (!mouseEvent?.latLng) return;
          handleCoordinateClick(mouseEvent.latLng.getLat(), mouseEvent.latLng.getLng());
        };
        kakaoMaps.event.addListener(polygon, 'click', onPolyClick);
        polygonListeners.push({ polygon, handler: onPolyClick });

        createdPolygons.push(polygon);

        if (showLabels && polyItem.label && polyItem.center && showSpatialLabels) {
          const lblSpec = buildSpatialLayerLabelSpec(strokeColor, polyItem.label);
          const lblEl = createOverlayElement(kakaoMaps, lblSpec);
          createdOverlays.push(
            new kakaoMaps.CustomOverlay({
              map,
              position: polyItem.center,
              content: lblEl,
              xAnchor: lblSpec.xAnchorRatio,
              yAnchor: lblSpec.yAnchorRatio,
              zIndex: zIndex + 5,
              clickable: false,
            }),
          );
        }
      }

      for (const lineItem of primitives.polylines) {
        const polyline = new kakaoMaps.Polyline({
          map,
          path: lineItem.path,
          strokeWeight,
          strokeColor,
          strokeOpacity,
          strokeStyle,
          zIndex: zIndex + 2,
        });
        createdLines.push(polyline);

        if (showLabels && lineItem.label && lineItem.center && showSpatialLabels) {
          const lblSpec = buildSpatialLayerLabelSpec(strokeColor, lineItem.label);
          const lblEl = createOverlayElement(kakaoMaps, lblSpec);
          createdOverlays.push(
            new kakaoMaps.CustomOverlay({
              map,
              position: lineItem.center,
              content: lblEl,
              xAnchor: lblSpec.xAnchorRatio,
              yAnchor: lblSpec.yAnchorRatio,
              zIndex: zIndex + 6,
              clickable: false,
            }),
          );
        }
      }

      for (const ptItem of primitives.points) {
        const ptSpec = buildSpatialLayerPointSpec(
          fillColor,
          ptItem.label,
          pointRadius,
          showLabels,
        );
        const ptEl = createOverlayElement(kakaoMaps, ptSpec);
        createdOverlays.push(
          new kakaoMaps.CustomOverlay({
            map,
            position: ptItem.position,
            content: ptEl,
            xAnchor: ptSpec.xAnchorRatio,
            yAnchor: ptSpec.yAnchorRatio,
            zIndex: zIndex + 10,
            clickable: false,
          }),
        );
      }
    }

    polygonsRef.current = createdPolygons;
    spatialPolylinesRef.current = createdLines;
    spatialOverlaysRef.current = createdOverlays;

    return () => {
      polygonListeners.forEach(({ polygon, handler }) => {
        try {
          kakaoMaps.event.removeListener(polygon, 'click', handler);
        } catch {
          // ignore
        }
      });
      createdPolygons.forEach((p) => p.setMap(null));
      createdLines.forEach((l) => l.setMap(null));
      createdOverlays.forEach((o) => o.setMap(null));
    };
  }, [
    kakaoMaps,
    activeMainTab,
    layers,
    parsedSpatialPrimitivesById,
    showSpatialLabels,
    handleCoordinateClick,
  ]);

  // 6. [3.1 꼬미의 바다수첩] 55개 갯바위 접안 및 소규모 선착장 5색 마커
  useEffect(() => {
    const map = mapRef.current;
    dockingOverlaysRef.current.forEach((o) => o.setMap(null));
    dockingOverlaysRef.current = [];
    if (!map) return;

    const isDockingVisible = layers.find((l) => l.id === 'docking')?.visible !== false;
    if (activeMainTab !== 'notebook' || !isDockingVisible) return;

    const created: KakaoCustomOverlay[] = [];
    for (const feature of features) {
      const [lng, lat] = feature.geometry.coordinates;
      const isSelected = selectedFeature?.properties.id === feature.properties.id;
      const spec = buildDockingMarkerSpec(
        feature.properties.color,
        feature.properties.id,
        isSelected,
      );
      const el = createOverlayElement(kakaoMaps, spec, () => onSelectFeature(feature));

      const overlay = new kakaoMaps.CustomOverlay({
        map,
        position: new kakaoMaps.LatLng(lat, lng),
        content: el,
        xAnchor: spec.xAnchorRatio,
        yAnchor: spec.yAnchorRatio,
        zIndex: getDockingMarkerZIndex(feature.properties.color, isSelected),
        clickable: true,
      });
      created.push(overlay);
    }

    dockingOverlaysRef.current = created;
    return () => {
      created.forEach((o) => o.setMap(null));
    };
  }, [kakaoMaps, activeMainTab, layers, features, selectedFeature, onSelectFeature]);

  // 7. [3.1 꼬미의 바다수첩] 개인 상괭이 관찰기록 마커
  useEffect(() => {
    const map = mapRef.current;
    porpoiseOverlaysRef.current.forEach((o) => o.setMap(null));
    porpoiseOverlaysRef.current = [];
    if (!map || activeMainTab !== 'notebook' || !showPorpoiseLayer) return;

    const created: KakaoCustomOverlay[] = [];
    for (const record of porpoiseRecords) {
      const spec = buildPorpoiseSpec(record.count);
      const el = createOverlayElement(kakaoMaps, spec, () => onSelectPorpoise(record));
      const overlay = new kakaoMaps.CustomOverlay({
        map,
        position: new kakaoMaps.LatLng(record.lat, record.lng),
        content: el,
        xAnchor: spec.xAnchorRatio,
        yAnchor: spec.yAnchorRatio,
        zIndex: 450,
        clickable: true,
      });
      created.push(overlay);
    }

    porpoiseOverlaysRef.current = created;
    return () => {
      created.forEach((o) => o.setMap(null));
    };
  }, [kakaoMaps, activeMainTab, showPorpoiseLayer, porpoiseRecords, onSelectPorpoise]);

  // 활성 경로에 포함된 항구 ID 집합 (선착장 핀 중복 표시 제외용)
  const activeWaypointPortIds = useMemo(() => {
    const set = new Set<string>();
    for (const wp of routeWaypoints) {
      if (wp.matchedPortId) set.add(wp.matchedPortId);
    }
    return set;
  }, [routeWaypoints]);

  // 8. [3.2 바닷길 콕콕 - 시간계산] 135개 항포구/소규모 선착장 빠른 탭 마커 (줌 반응형 도트/라벨)
  useEffect(() => {
    const map = mapRef.current;
    portOverlaysRef.current.forEach((o) => o.setMap(null));
    portOverlaysRef.current = [];
    if (
      !map ||
      activeMainTab !== 'navigation' ||
      navSubTab !== 'route' ||
      !showPortMarkersOnMap
    ) {
      return;
    }

    const showLabel = showPortLabels;
    const created: KakaoCustomOverlay[] = [];

    for (const port of portsList) {
      if (activeWaypointPortIds.has(port.id)) continue;
      const spec = buildNavPortPinSpec(port, showLabel);
      const el = createOverlayElement(kakaoMaps, spec, () =>
        onMapClickForRoute(port.lat, port.lng),
      );
      const overlay = new kakaoMaps.CustomOverlay({
        map,
        position: new kakaoMaps.LatLng(port.lat, port.lng),
        content: el,
        xAnchor: spec.xAnchorRatio,
        yAnchor: spec.yAnchorRatio,
        zIndex: showLabel ? 220 : 160,
        clickable: true,
      });
      created.push(overlay);
    }

    portOverlaysRef.current = created;
    return () => {
      created.forEach((o) => o.setMap(null));
    };
  }, [
    kakaoMaps,
    activeMainTab,
    navSubTab,
    showPortMarkersOnMap,
    portsList,
    activeWaypointPortIds,
    showPortLabels,
    onMapClickForRoute,
  ]);

  // 바닷길 콕콕 실항로 좌표선 계산
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

  // 8-B. [전체항로 보기 (Fit Bounds)] 초기 바닷길 시간계산 진입 시 1회 자동 프레이밍 + 수동 트리거 반영 (하단 계산기 패널 여백 320px 확보)
  const lastFittedTriggerRef = useRef<number>(-1);
  const wasInRouteNavRef = useRef<boolean>(false);

  useEffect(() => {
    const map = mapRef.current;
    const isRouteNav = activeMainTab === 'navigation' && navSubTab === 'route';
    if (!isRouteNav) {
      wasInRouteNavRef.current = false;
      return;
    }
    if (!map || polylinePositions.length < 2) return;

    const enteredRouteNav = !wasInRouteNavRef.current;
    const manualTriggered =
      fitRouteBoundsTrigger > 0 && fitRouteBoundsTrigger !== lastFittedTriggerRef.current;

    if (!enteredRouteNav && !manualTriggered) return;

    wasInRouteNavRef.current = true;
    lastFittedTriggerRef.current = fitRouteBoundsTrigger;

    try {
      const bounds = new kakaoMaps.LatLngBounds();
      for (const [lat, lng] of polylinePositions) {
        bounds.extend(new kakaoMaps.LatLng(lat, lng));
      }
      if (!bounds.isEmpty()) {
        map.setBounds(bounds, 96, 44, 320, 44);
        const c = map.getCenter();
        const z = kakaoLevelToLeafletZoom(map.getLevel());
        setCurrentLeafletZoom(z);
        onViewportChangeRef.current(c.getLat(), c.getLng(), z);
      }
    } catch {
      // ignore if bounds invalid
    }
  }, [kakaoMaps, activeMainTab, navSubTab, fitRouteBoundsTrigger, polylinePositions]);

  // 줌 단계별 방향 화살표 샘플링 티어 (0: zoom<=10, 1: zoom 11~12, 2: zoom>=13)
  const routeArrowZoomTier =
    currentLeafletZoom <= 10 ? 0 : currentLeafletZoom <= 12 ? 1 : 2;
  const showSeaChannelGuides = currentLeafletZoom >= 12;

  // 9. [3.2 바닷길 콕콕 - 시간계산] 구간별 3중 케이싱 폴리라인 + 진행 방향 화살표(➤) + 수로 가이드(◆) + 구간 배지 + 드래그 마커
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    legBadgeOverlaysRef.current.forEach((o) => o.setMap(null));
    legBadgeOverlaysRef.current = [];
    waypointOverlaysRef.current.forEach((o) => o.setMap(null));
    waypointOverlaysRef.current = [];

    if (!map || !container || activeMainTab !== 'navigation' || navSubTab !== 'route') {
      return;
    }

    const createdLines: KakaoPolyline[] = [];
    const createdLegBadges: KakaoCustomOverlay[] = [];
    const createdWaypoints: KakaoCustomOverlay[] = [];

    // 9-A. 구간 선택(포커스) 시에만 해당 구간의 직선 대권 참고선을 보조 점선으로 표시 (육지 관통 오인 방지)
    if (selectedLegIndex !== null && routeLegs[selectedLegIndex]) {
      const selLeg = routeLegs[selectedLegIndex];
      const directPath = [
        new kakaoMaps.LatLng(selLeg.from.lat, selLeg.from.lng),
        new kakaoMaps.LatLng(selLeg.to.lat, selLeg.to.lng),
      ];
      createdLines.push(
        new kakaoMaps.Polyline({
          map,
          path: directPath,
          strokeWeight: 1.5,
          strokeColor: '#94a3b8',
          strokeOpacity: 0.55,
          strokeStyle: 'shortdot',
          zIndex: 255,
        }),
      );
    }

    // 9-B. 구간(Leg)별 3중 케이싱(3-Tier Casing) 해상 실항로 폴리라인
    routeLegs.forEach((leg, legIdx) => {
      const pts =
        leg.pathPositions && leg.pathPositions.length >= 2
          ? leg.pathPositions
          : ([
              [leg.from.lat, leg.from.lng],
              [leg.to.lat, leg.to.lng],
            ] as [number, number][]);
      if (pts.length < 2) return;

      const isSelected = selectedLegIndex === legIdx;
      const seaPath = pts.map(([lat, lng]) => new kakaoMaps.LatLng(lat, lng));
      const mainColor = isSelected
        ? '#34d399'
        : leg.safetyLevel === 'danger'
          ? '#f59e0b'
          : '#00e5ff';

      // Tier 1: 심해 다크 외곽 케이싱 (위성/지형 배경과 완벽 분리)
      createdLines.push(
        new kakaoMaps.Polyline({
          map,
          path: seaPath,
          strokeWeight: isSelected ? 11 : 8.5,
          strokeColor: '#020617',
          strokeOpacity: 0.88,
          strokeStyle: 'solid',
          zIndex: isSelected ? 310 : 280,
        }),
      );

      // Tier 2: 안전등급 / 선택 상태 메인 코어 라인
      createdLines.push(
        new kakaoMaps.Polyline({
          map,
          path: seaPath,
          strokeWeight: isSelected ? 6.5 : 4.8,
          strokeColor: mainColor,
          strokeOpacity: 0.96,
          strokeStyle: 'solid',
          zIndex: isSelected ? 315 : 285,
        }),
      );

      // Tier 3: 내부 방향성 점선 하이라이트 코어
      createdLines.push(
        new kakaoMaps.Polyline({
          map,
          path: seaPath,
          strokeWeight: isSelected ? 2.2 : 1.6,
          strokeColor: isSelected ? '#ecfdf5' : '#e0f2fe',
          strokeOpacity: 0.9,
          strokeStyle: 'shortdash',
          zIndex: isSelected ? 320 : 290,
        }),
      );
    });

    // 9-C. 폴리라인 위 진행 방향 화살표(➤) 및 해상 변침점 수로 가이드(◆) 렌더링
    if (showDirectionArrows) {
      let totalArrowsRendered = 0;
      const maxTotalArrows = routeArrowZoomTier === 0 ? 6 : routeArrowZoomTier === 1 ? 14 : 24;
      const renderedGuideIds = new Set<string>();

      routeLegs.forEach((leg, legIdx) => {
        const isSelected = selectedLegIndex === legIdx;
        const arrows = leg.directionArrows ?? [];
        const filteredArrows =
          routeArrowZoomTier === 0
            ? arrows.slice(0, 1)
            : routeArrowZoomTier === 1
              ? arrows.filter((_, i) => i % 2 === 0).slice(0, 3)
              : arrows;

        for (const arrow of filteredArrows) {
          if (totalArrowsRendered >= maxTotalArrows) break;
          const arrowSpec = buildRouteDirectionArrowSpec(
            arrow.bearingDeg,
            leg.safetyLevel ?? 'safe',
            isSelected,
          );
          const arrowEl = createOverlayElement(kakaoMaps, arrowSpec);
          createdLegBadges.push(
            new kakaoMaps.CustomOverlay({
              map,
              position: new kakaoMaps.LatLng(arrow.lat, arrow.lng),
              content: arrowEl,
              xAnchor: arrowSpec.xAnchorRatio,
              yAnchor: arrowSpec.yAnchorRatio,
              zIndex: isSelected ? 390 : 340,
              clickable: false,
            }),
          );
          totalArrowsRendered++;
        }

        if (showSeaChannelGuides && leg.activeWaypoints) {
          for (const wpGuide of leg.activeWaypoints) {
            if (renderedGuideIds.has(wpGuide.id)) continue;
            renderedGuideIds.add(wpGuide.id);
            const guideSpec = buildSeaWaypointGuideSpec(wpGuide.name, isSelected);
            const guideEl = createOverlayElement(kakaoMaps, guideSpec);
            createdLegBadges.push(
              new kakaoMaps.CustomOverlay({
                map,
                position: new kakaoMaps.LatLng(wpGuide.lat, wpGuide.lng),
                content: guideEl,
                xAnchor: guideSpec.xAnchorRatio,
                yAnchor: guideSpec.yAnchorRatio,
                zIndex: isSelected ? 385 : 330,
                clickable: false,
              }),
            );
          }
        }
      });
    }

    // 9-D. 구간 진중점(50% Arc-Length) 소요시간·해리·회전 침로 화살표 배지 (클릭 시 구간 포커스)
    routeLegs.forEach((leg, legIdx) => {
      const isSelected = selectedLegIndex === legIdx;
      const spec = buildRouteLegBadgeSpec(
        leg.durationMinutes,
        leg.distanceNm,
        leg.bearingDeg,
        leg.cardinal,
        {
          legIndex: legIdx,
          safetyLevel: leg.safetyLevel,
          isSelected,
        },
      );
      const el = createOverlayElement(
        kakaoMaps,
        spec,
        onSelectLeg
          ? () => onSelectLeg(isSelected ? null : legIdx)
          : undefined,
      );
      const badgeOverlay = new kakaoMaps.CustomOverlay({
        map,
        position: new kakaoMaps.LatLng(leg.midLat, leg.midLng),
        content: el,
        xAnchor: spec.xAnchorRatio,
        yAnchor: spec.yAnchorRatio,
        zIndex: isSelected ? 460 : 420,
        clickable: Boolean(onSelectLeg),
      });
      createdLegBadges.push(badgeOverlay);
    });

    // 9-E. 출발·경유·도착지 드래그 가능 마커 (Pointer-Capture 60fps 드래그 엔진 + 경유지 [×] 즉시 취소)
    routeWaypoints.forEach((wp, idx) => {
      const spec = buildRouteWaypointSpec(wp.type, wp.name, idx, wp.id);
      const el = createOverlayElement(kakaoMaps, spec);
      const wpOverlay = new kakaoMaps.CustomOverlay({
        map,
        position: new kakaoMaps.LatLng(wp.lat, wp.lng),
        content: el,
        xAnchor: spec.xAnchorRatio,
        yAnchor: spec.yAnchorRatio,
        zIndex: 700 + idx,
        clickable: true,
      });

      attachDraggableToCustomOverlay(
        kakaoMaps,
        map,
        container,
        wpOverlay,
        el,
        (nextLat, nextLng) => {
          onUpdateWaypointPos(wp.id, nextLat, nextLng);
        },
        onRemoveWaypoint,
      );

      createdWaypoints.push(wpOverlay);
    });

    polylinesRef.current = createdLines;
    legBadgeOverlaysRef.current = createdLegBadges;
    waypointOverlaysRef.current = createdWaypoints;

    return () => {
      createdLines.forEach((p) => p.setMap(null));
      createdLegBadges.forEach((o) => o.setMap(null));
      createdWaypoints.forEach((o) => o.setMap(null));
    };
  }, [
    kakaoMaps,
    activeMainTab,
    navSubTab,
    routeWaypoints,
    routeLegs,
    selectedLegIndex,
    onSelectLeg,
    showDirectionArrows,
    routeArrowZoomTier,
    showSeaChannelGuides,
    onUpdateWaypointPos,
    onRemoveWaypoint,
  ]);

  // 10. [3.2 바닷길 콕콕 - 해상기상] 3단계 신호등 드래그 마커
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (weatherOverlayRef.current) {
      weatherOverlayRef.current.setMap(null);
      weatherOverlayRef.current = null;
    }

    if (!map || !container || activeMainTab !== 'navigation' || navSubTab !== 'weather') {
      return;
    }

    const spec = buildWeatherPinSpec(weatherGrade);
    const el = createOverlayElement(kakaoMaps, spec);
    const overlay = new kakaoMaps.CustomOverlay({
      map,
      position: new kakaoMaps.LatLng(weatherCoords.lat, weatherCoords.lng),
      content: el,
      xAnchor: spec.xAnchorRatio,
      yAnchor: spec.yAnchorRatio,
      zIndex: 800,
      clickable: true,
    });

    attachDraggableToCustomOverlay(
      kakaoMaps,
      map,
      container,
      overlay,
      el,
      (nextLat, nextLng) => {
        onUpdateWeatherCoords(nextLat, nextLng);
      },
    );

    weatherOverlayRef.current = overlay;
    return () => {
      overlay.setMap(null);
    };
  }, [
    kakaoMaps,
    activeMainTab,
    navSubTab,
    weatherCoords.lat,
    weatherCoords.lng,
    weatherGrade,
    onUpdateWeatherCoords,
  ]);

  // 11. GPS 현재 위치 정확도 반경 Circle & 펄스 마커
  useEffect(() => {
    const map = mapRef.current;
    if (gpsCircleRef.current) {
      gpsCircleRef.current.setMap(null);
      gpsCircleRef.current = null;
    }
    if (gpsOverlayRef.current) {
      gpsOverlayRef.current.setMap(null);
      gpsOverlayRef.current = null;
    }
    if (!map || !userLocation) return;

    const pos = new kakaoMaps.LatLng(userLocation.lat, userLocation.lng);
    const circle = new kakaoMaps.Circle({
      map,
      center: pos,
      radius: userLocation.accuracy ?? 120,
      strokeWeight: 1.5,
      strokeColor: '#38bdf8',
      strokeOpacity: 0.9,
      strokeStyle: 'solid',
      fillColor: '#0ea5e9',
      fillOpacity: 0.14,
      zIndex: 900,
    });

    const spec = buildGpsPulseSpec();
    const el = createOverlayElement(kakaoMaps, spec);
    const pulseOverlay = new kakaoMaps.CustomOverlay({
      map,
      position: pos,
      content: el,
      xAnchor: spec.xAnchorRatio,
      yAnchor: spec.yAnchorRatio,
      zIndex: 1000,
      clickable: false,
    });

    gpsCircleRef.current = circle;
    gpsOverlayRef.current = pulseOverlay;

    return () => {
      circle.setMap(null);
      pulseOverlay.setMap(null);
    };
  }, [kakaoMaps, userLocation]);

  return (
    <div
      ref={containerRef}
      className="bada-kakao-map h-full w-full"
      aria-label="카카오맵 해역 캔버스"
    />
  );
}
