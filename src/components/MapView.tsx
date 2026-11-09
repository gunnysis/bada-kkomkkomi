import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Compass,
  Copy,
  Eye,
  Globe,
  Layers,
  LocateFixed,
  Maximize,
  Minus,
  Mountain,
  Plus,
  RefreshCw,
  Satellite,
  X,
} from 'lucide-react';
import type { DockingFeature } from '../types/docking';
import type { PorpoiseRecord } from '../types/porpoise';
import type { MarinePort } from '../types/port';
import type { RouteLeg, RouteWaypoint } from '../types/route';
import type { MapLayerConfig } from '../types/config';
import type {
  KakaoBaseMapType,
  KakaoMapTypePreferences,
  KakaoMapsNamespace,
  KakaoOverlayMapType,
  RoadviewTargetLocation,
} from '../types/kakao';
import {
  getConfiguredKakaoApiKey,
  getMaskedApiKey,
  loadKakaoMapSdk,
  type KakaoSdkDiagnostics,
  type KakaoSdkErrorCode,
} from '../services/kakaoMapLoader';
import { KakaoMapCanvas } from './map/KakaoMapCanvas';

const LegacyLeafletCanvas = lazy(() =>
  import('./map/LegacyLeafletCanvas').then((m) => ({
    default: m.LegacyLeafletCanvas,
  })),
);
const Roadview3DModal = lazy(() =>
  import('./map/Roadview3DModal').then((m) => ({
    default: m.Roadview3DModal,
  })),
);

const MAP_TYPE_PREFS_STORAGE_KEY = 'bada_kkomkkomi_map_type_prefs_v1';

const VALID_BASE_MAP_TYPES: KakaoBaseMapType[] = ['roadmap', 'skyview', 'hybrid'];
const VALID_OVERLAY_MAP_TYPES: KakaoOverlayMapType[] = [
  'terrain',
  'use_district',
  'roadview',
  'traffic',
  'bicycle',
];

function loadSavedMapTypePreferences(): KakaoMapTypePreferences {
  if (typeof window === 'undefined') {
    return { baseMapType: 'roadmap', overlayMapTypes: [] };
  }
  try {
    const raw = window.localStorage.getItem(MAP_TYPE_PREFS_STORAGE_KEY);
    if (!raw) return { baseMapType: 'roadmap', overlayMapTypes: [] };
    const parsed = JSON.parse(raw);
    const baseMapType: KakaoBaseMapType = VALID_BASE_MAP_TYPES.includes(parsed?.baseMapType)
      ? parsed.baseMapType
      : 'roadmap';
    const overlayMapTypes: KakaoOverlayMapType[] = Array.isArray(parsed?.overlayMapTypes)
      ? parsed.overlayMapTypes.filter((item: unknown): item is KakaoOverlayMapType =>
          VALID_OVERLAY_MAP_TYPES.includes(item as KakaoOverlayMapType),
        )
      : [];
    return { baseMapType, overlayMapTypes };
  } catch {
    return { baseMapType: 'roadmap', overlayMapTypes: [] };
  }
}

interface UserGpsLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  isSimulated?: boolean;
}

export interface MapViewProps {
  activeMainTab: 'notebook' | 'navigation';
  navSubTab: 'route' | 'weather';

  // 3.1 꼬미의 바다수첩
  features: DockingFeature[];
  selectedFeature: DockingFeature | null;
  onSelectFeature: (feature: DockingFeature) => void;
  layers: MapLayerConfig[];
  geoJsonLayersData?: Record<string, any>;
  layerLoadErrorIds?: string[];
  onRetryGeoJsonLayers?: () => void;
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
  portsList?: MarinePort[];
  showPortMarkersOnMap?: boolean;
  onUpdateWaypointPos: (id: string, lat: number, lng: number) => void;
  onRemoveWaypoint?: (id: string) => void;
  onMapClickForRoute: (lat: number, lng: number) => void;

  // 3.2 바닷길 콕콕 (해상기상)
  weatherCoords: { lat: number; lng: number };
  weatherGrade: 'good' | 'moderate' | 'bad' | 'unknown';
  onUpdateWeatherCoords: (lat: number, lng: number) => void;

  // 공통
  userLocation: UserGpsLocation | null;
  onRequestGps: () => void;
  onSimulateFieldGps: () => void;
  flyTarget: { lat: number; lng: number; zoom: number; nonce: number } | null;
  onResetBounds: () => void;
  externalRoadviewTarget?: RoadviewTargetLocation | null;
  onClearExternalRoadviewTarget?: () => void;
}

export function MapView({
  activeMainTab,
  navSubTab,
  features,
  selectedFeature,
  onSelectFeature,
  layers,
  geoJsonLayersData: externalGeoJsonLayersData,
  layerLoadErrorIds: externalLayerLoadErrorIds,
  onRetryGeoJsonLayers,
  showPorpoiseLayer,
  isPorpoiseAddMode,
  isReportPickMode,
  porpoiseRecords,
  onSelectPorpoise,
  onMapClickForPorpoise,
  onMapClickForReport,
  routeWaypoints,
  routeLegs,
  portsList = [],
  showPortMarkersOnMap = true,
  onUpdateWaypointPos,
  onRemoveWaypoint,
  onMapClickForRoute,
  weatherCoords,
  weatherGrade,
  onUpdateWeatherCoords,
  userLocation,
  onRequestGps,
  onSimulateFieldGps,
  flyTarget,
  onResetBounds,
  externalRoadviewTarget,
  onClearExternalRoadviewTarget,
}: MapViewProps) {
  // 1. GIS 엔진 상태 ('kakao' 기본, Kakao SDK 차단/오프라인 시 'leaflet' 자동 폴백) 및 다중 맵/3D 설정
  const [preferredEngine, setPreferredEngine] = useState<'kakao' | 'leaflet'>('kakao');
  const [mapPrefs, setMapPrefs] = useState<KakaoMapTypePreferences>(() =>
    loadSavedMapTypePreferences(),
  );
  const [isMapTypePopoverOpen, setIsMapTypePopoverOpen] = useState<boolean>(false);
  const [internalRoadviewTarget, setInternalRoadviewTarget] =
    useState<RoadviewTargetLocation | null>(null);
  const [internalFlyOverride, setInternalFlyOverride] = useState<{
    lat: number;
    lng: number;
    zoom: number;
    nonce: number;
  } | null>(null);

  const baseMapType = mapPrefs.baseMapType;
  const overlayMapTypes = mapPrefs.overlayMapTypes;

  useEffect(() => {
    try {
      window.localStorage.setItem(MAP_TYPE_PREFS_STORAGE_KEY, JSON.stringify(mapPrefs));
    } catch {
      // ignore storage quota errors
    }
  }, [mapPrefs]);

  const handleSetBaseMapType = useCallback((nextBase: KakaoBaseMapType) => {
    setMapPrefs((prev) => ({
      ...prev,
      baseMapType: nextBase,
    }));
  }, []);

  const handleToggleOverlayMapType = useCallback((key: KakaoOverlayMapType) => {
    setMapPrefs((prev) => {
      const exists = prev.overlayMapTypes.includes(key);
      return {
        ...prev,
        overlayMapTypes: exists
          ? prev.overlayMapTypes.filter((item) => item !== key)
          : [...prev.overlayMapTypes, key],
      };
    });
  }, []);

  const handleApplyMapPreset = useCallback(
    (presetBase: KakaoBaseMapType, presetOverlays: KakaoOverlayMapType[]) => {
      setMapPrefs({
        baseMapType: presetBase,
        overlayMapTypes: presetOverlays,
      });
    },
    [],
  );

  const handleMapClickForRoadview = useCallback((lat: number, lng: number) => {
    setInternalRoadviewTarget({
      lat,
      lng,
      title: `해안·선착장 3D 로드뷰 (${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E)`,
    });
  }, []);

  const activeRoadviewTarget = externalRoadviewTarget ?? internalRoadviewTarget;

  const handleCloseRoadviewModal = useCallback(() => {
    setInternalRoadviewTarget(null);
    if (onClearExternalRoadviewTarget) {
      onClearExternalRoadviewTarget();
    }
  }, [onClearExternalRoadviewTarget]);

  const handleFallbackToSatelliteTerrain = useCallback((lat: number, lng: number) => {
    setMapPrefs((prev) => ({
      baseMapType: 'skyview',
      overlayMapTypes: prev.overlayMapTypes.includes('terrain')
        ? prev.overlayMapTypes.filter((item) => item !== 'roadview')
        : [...prev.overlayMapTypes.filter((item) => item !== 'roadview'), 'terrain'],
    }));
    setInternalFlyOverride({
      lat,
      lng,
      zoom: 16,
      nonce: Date.now(),
    });
  }, []);

  const effectiveFlyTarget = internalFlyOverride ?? flyTarget;
  const [viewport, setViewport] = useState<{ lat: number; lng: number; zoom: number }>({
    lat: 34.8195,
    lng: 128.552,
    zoom: 11,
  });
  const [kakaoNamespace, setKakaoNamespace] = useState<KakaoMapsNamespace | null>(null);
  const [diagnostics, setDiagnostics] = useState<KakaoSdkDiagnostics>(() => {
    const key = getConfiguredKakaoApiKey();
    return {
      status: 'loading',
      currentOrigin: typeof window !== 'undefined' ? window.location.origin : '',
      maskedKey: getMaskedApiKey(key),
      lastCheckedAt: new Date().toLocaleTimeString('ko-KR'),
    };
  });
  const [isDiagDismissed, setIsDiagDismissed] = useState<boolean>(false);
  const [isDiagModalOpen, setIsDiagModalOpen] = useState<boolean>(false);
  const [copiedOrigin, setCopiedOrigin] = useState<boolean>(false);
  const [zoomStepTrigger, setZoomStepTrigger] = useState<{
    delta: number;
    nonce: number;
  } | null>(null);

  // 2. QGIS 공간정보 레이어 GeoJSON 로드 및 상태/재시도 관리 (IndexedDB 운영본 + 정적 URL 통합)
  const [localGeoJsonLayersData, setLocalGeoJsonLayersData] = useState<Record<string, any>>({});
  const [localLayerLoadErrorIds, setLocalLayerLoadErrorIds] = useState<string[]>([]);
  const fetchedLayerIdsRef = useRef<Set<string>>(new Set());

  const fetchMissingGeoJsonLayers = useCallback(() => {
    if (externalGeoJsonLayersData !== undefined) return;
    layers.forEach((layer) => {
      if (layer.url && !fetchedLayerIdsRef.current.has(layer.id)) {
        fetchedLayerIdsRef.current.add(layer.id);
        const fullUrl = `${import.meta.env.BASE_URL}${layer.url.replace(/^\/+/, '')}`;
        fetch(fullUrl)
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .then((data) => {
            setLocalGeoJsonLayersData((prev) => ({ ...prev, [layer.id]: data }));
            setLocalLayerLoadErrorIds((prev) => prev.filter((id) => id !== layer.id));
          })
          .catch(() => {
            fetchedLayerIdsRef.current.delete(layer.id);
            setLocalLayerLoadErrorIds((prev) =>
              prev.includes(layer.id) ? prev : [...prev, layer.id],
            );
          });
      }
    });
  }, [layers, externalGeoJsonLayersData]);

  const geoJsonLayersData = {
    ...localGeoJsonLayersData,
    ...(externalGeoJsonLayersData ?? {}),
  };

  const layerLoadErrorIds =
    externalLayerLoadErrorIds ?? localLayerLoadErrorIds;

  const handleRetryGeoJsonLayers = useCallback(() => {
    if (onRetryGeoJsonLayers) {
      onRetryGeoJsonLayers();
    }
    localLayerLoadErrorIds.forEach((id) => fetchedLayerIdsRef.current.delete(id));
    setLocalLayerLoadErrorIds([]);
    fetchMissingGeoJsonLayers();
  }, [onRetryGeoJsonLayers, localLayerLoadErrorIds, fetchMissingGeoJsonLayers]);

  useEffect(() => {
    fetchMissingGeoJsonLayers();
  }, [fetchMissingGeoJsonLayers]);

  const handleViewportChange = useCallback((lat: number, lng: number, zoom: number) => {
    setViewport({ lat, lng, zoom });
  }, []);

  // 진단 모달 Escape 키 닫기 지원 (proposal P2 접근성 반영)
  useEffect(() => {
    if (!isDiagModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDiagModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDiagModalOpen]);

  // 3. Kakao Maps SDK 초기화 및 진단/자동 폴백
  const connectKakaoSdk = useCallback((forceRetry: boolean) => {
    const key = getConfiguredKakaoApiKey();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    loadKakaoMapSdk(forceRetry)
      .then((ns) => {
        setKakaoNamespace(ns);
        setPreferredEngine('kakao');
        setDiagnostics({
          status: 'ready',
          currentOrigin: origin,
          maskedKey: getMaskedApiKey(key),
          lastCheckedAt: new Date().toLocaleTimeString('ko-KR'),
        });
      })
      .catch(
        (err: {
          code?: KakaoSdkErrorCode;
          message?: string;
        }) => {
          setKakaoNamespace(null);
          // Kakao SDK 실패 시 무중단 현장 가용성을 위해 즉시 레거시(Leaflet) 엔진으로 폴백
          setPreferredEngine('leaflet');
          setIsDiagDismissed(false);
          setDiagnostics({
            status: 'error',
            errorCode: err?.code ?? 'DOMAIN_MISMATCH_OR_BLOCKED',
            errorMessage:
              err?.message ??
              '카카오맵 SDK 로드에 실패하여 레거시 지도(OSM)로 자동 전환되었습니다.',
            currentOrigin: origin,
            maskedKey: getMaskedApiKey(key),
            lastCheckedAt: new Date().toLocaleTimeString('ko-KR'),
          });
        },
      );
  }, []);

  const handleRetryKakaoEngine = useCallback(() => {
    const key = getConfiguredKakaoApiKey();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setDiagnostics({
      status: 'loading',
      currentOrigin: origin,
      maskedKey: getMaskedApiKey(key),
      lastCheckedAt: new Date().toLocaleTimeString('ko-KR'),
    });
    connectKakaoSdk(true);
  }, [connectKakaoSdk]);

  useEffect(() => {
    connectKakaoSdk(false);
  }, [connectKakaoSdk]);

  const handleToggleEngine = useCallback(() => {
    if (preferredEngine === 'kakao') {
      setPreferredEngine('leaflet');
      return;
    }
    if (kakaoNamespace) {
      setPreferredEngine('kakao');
    } else {
      handleRetryKakaoEngine();
    }
  }, [preferredEngine, kakaoNamespace, handleRetryKakaoEngine]);

  const handleCopyOrigin = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(diagnostics.currentOrigin);
      setCopiedOrigin(true);
      window.setTimeout(() => setCopiedOrigin(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  }, [diagnostics.currentOrigin]);

  const activeEngine: 'kakao' | 'leaflet' =
    preferredEngine === 'kakao' && kakaoNamespace ? 'kakao' : 'leaflet';

  return (
    <main
      className="bada-map-viewport relative h-dvh w-full"
      tabIndex={0}
      role="region"
      aria-label="통영·거제 해역 인터랙티브 지도"
    >
      {/* 1. 메인 지도 캔버스 (Kakao Map Primary vs Legacy Leaflet Fallback) */}
      {activeEngine === 'kakao' && kakaoNamespace ? (
        <KakaoMapCanvas
          kakaoMaps={kakaoNamespace}
          baseMapType={baseMapType}
          overlayMapTypes={overlayMapTypes}
          activeMainTab={activeMainTab}
          navSubTab={navSubTab}
          features={features}
          selectedFeature={selectedFeature}
          onSelectFeature={onSelectFeature}
          layers={layers}
          geoJsonLayersData={geoJsonLayersData}
          showPorpoiseLayer={showPorpoiseLayer}
          isPorpoiseAddMode={isPorpoiseAddMode}
          isReportPickMode={isReportPickMode}
          porpoiseRecords={porpoiseRecords}
          onSelectPorpoise={onSelectPorpoise}
          onMapClickForPorpoise={onMapClickForPorpoise}
          onMapClickForReport={onMapClickForReport}
          onMapClickForRoadview={handleMapClickForRoadview}
          routeWaypoints={routeWaypoints}
          routeLegs={routeLegs}
          portsList={portsList}
          showPortMarkersOnMap={showPortMarkersOnMap}
          onUpdateWaypointPos={onUpdateWaypointPos}
          onRemoveWaypoint={onRemoveWaypoint}
          onMapClickForRoute={onMapClickForRoute}
          weatherCoords={weatherCoords}
          weatherGrade={weatherGrade}
          onUpdateWeatherCoords={onUpdateWeatherCoords}
          userLocation={userLocation}
          viewport={viewport}
          onViewportChange={handleViewportChange}
          flyTarget={effectiveFlyTarget}
          zoomStepTrigger={zoomStepTrigger}
        />
      ) : (
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-[#0b192c] text-xs font-bold text-slate-300">
              해양 보조 지도 엔진 불러오는 중...
            </div>
          }
        >
          <LegacyLeafletCanvas
            baseMapType={baseMapType}
            overlayMapTypes={overlayMapTypes}
            activeMainTab={activeMainTab}
            navSubTab={navSubTab}
            features={features}
            selectedFeature={selectedFeature}
            onSelectFeature={onSelectFeature}
            layers={layers}
            geoJsonLayersData={geoJsonLayersData}
            showPorpoiseLayer={showPorpoiseLayer}
            isPorpoiseAddMode={isPorpoiseAddMode}
            isReportPickMode={isReportPickMode}
            porpoiseRecords={porpoiseRecords}
            onSelectPorpoise={onSelectPorpoise}
            onMapClickForPorpoise={onMapClickForPorpoise}
            onMapClickForReport={onMapClickForReport}
            routeWaypoints={routeWaypoints}
            routeLegs={routeLegs}
            portsList={portsList}
            showPortMarkersOnMap={showPortMarkersOnMap}
            onUpdateWaypointPos={onUpdateWaypointPos}
            onRemoveWaypoint={onRemoveWaypoint}
            onMapClickForRoute={onMapClickForRoute}
            weatherCoords={weatherCoords}
            weatherGrade={weatherGrade}
            onUpdateWeatherCoords={onUpdateWeatherCoords}
            userLocation={userLocation}
            viewport={viewport}
            onViewportChange={handleViewportChange}
            flyTarget={effectiveFlyTarget}
            zoomStepTrigger={zoomStepTrigger}
          />
        </Suspense>
      )}

      {/* 1-B. 공간정보 GeoJSON 레이어 로드 오류 발생 시 재시도 배너 */}
      {layerLoadErrorIds.length > 0 && (
        <div
          role="status"
          className="fixed bottom-24 left-2.5 z-[900] flex items-center gap-2 rounded-xl border border-rose-400/80 bg-slate-950/95 px-3 py-1.5 text-[11px] font-bold text-rose-200 shadow-lg"
        >
          <span>공간레이어 일부 로드 실패 ({layerLoadErrorIds.length}건)</span>
          <button
            type="button"
            onClick={handleRetryGeoJsonLayers}
            className="rounded-lg bg-rose-500/30 px-2 py-0.5 font-black text-white hover:bg-rose-500/50"
          >
            재시도
          </button>
        </div>
      )}

      {/* 2. Kakao SDK 도메인 미등록/오류 발생 시 상단 자동 폴백 & 진단 배너 */}
      {diagnostics.status === 'error' && !isDiagDismissed && (
        <div
          role="alert"
          className="fixed inset-x-2.5 top-[8.6rem] z-[900] mx-auto max-w-xl rounded-2xl border-2 border-amber-400/90 bg-slate-950/95 p-2.5 text-xs text-amber-100 shadow-2xl backdrop-blur-md sm:top-[10.2rem]"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div className="min-w-0">
                <p className="font-black text-amber-300">
                  카카오맵 도메인 승인 대기중 · 레거시 지도(OSM) 자동 폴백 가동됨
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-300">
                  카카오 개발자 콘솔 [플랫폼 &gt; Web]에{' '}
                  <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-sky-300">
                    {diagnostics.currentOrigin}
                  </code>{' '}
                  등록 후 재시도하세요.
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsDiagModalOpen(true)}
                    className="rounded-lg border border-amber-400/70 bg-amber-500/20 px-2 py-0.5 text-[11px] font-black text-amber-200 active:scale-95"
                  >
                    도메인 등록 방법 · 진단 보기
                  </button>
                  <button
                    type="button"
                    onClick={handleRetryKakaoEngine}
                    className="inline-flex items-center gap-1 rounded-lg border border-sky-400/70 bg-sky-500/20 px-2 py-0.5 text-[11px] font-black text-sky-200 active:scale-95"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>카카오맵 재연결</span>
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsDiagDismissed(true)}
              aria-label="진단 배너 닫기"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. 우측 상단(헤더 바로 아래) 도킹형 한 손 컨트롤러 */}
      <div
        className="fixed top-[8.75rem] right-2.5 z-[850] flex flex-col gap-1.5 sm:top-[10.5rem] sm:right-3 sm:gap-2"
        aria-label="지도 확대·축소, 배경지도 및 GPS 위치 컨트롤"
      >
        <button
          type="button"
          onClick={onRequestGps}
          aria-label="내 GPS 위치 찾기"
          title="실제 GPS 위치 조회"
          className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 shadow-xl transition active:scale-95 sm:h-11 sm:w-11 sm:rounded-2xl ${
            userLocation
              ? 'border-sky-300 bg-sky-500 text-slate-950'
              : 'border-slate-600 bg-[#0b192c]/95 text-sky-400'
          }`}
        >
          <LocateFixed className="h-4 w-4 stroke-[2.4] sm:h-5 sm:w-5" />
        </button>

        <button
          type="button"
          onClick={onSimulateFieldGps}
          aria-label="통영·거제 해상 선박 GPS 시뮬레이션"
          title="통영·거제 해역 가상 선박 GPS 시뮬레이션"
          className="flex h-9 w-9 flex-col items-center justify-center rounded-xl border-2 border-amber-500/70 bg-[#0b192c]/95 text-amber-300 shadow-xl transition active:scale-95 sm:h-11 sm:w-11 sm:rounded-2xl"
        >
          <Compass className="h-3.5 w-3.5 stroke-[2.3] sm:h-4 sm:w-4" />
          <span className="text-[8px] leading-none font-black sm:text-[9px]">현장GPS</span>
        </button>

        <button
          type="button"
          onClick={() => setIsMapTypePopoverOpen((prev) => !prev)}
          aria-label="배경지도 및 3D·중첩 레이어 선택"
          aria-expanded={isMapTypePopoverOpen}
          title="일반/순수위성/하이브리드 및 2.5D 지형·지적편집도·3D 로드뷰 선택"
          className={`relative flex h-9 w-9 flex-col items-center justify-center rounded-xl border-2 shadow-xl transition active:scale-95 sm:h-11 sm:w-11 sm:rounded-2xl ${
            isMapTypePopoverOpen || baseMapType !== 'roadmap' || overlayMapTypes.length > 0
              ? 'border-emerald-300 bg-emerald-500 text-slate-950'
              : 'border-slate-600 bg-[#0b192c]/95 text-emerald-300'
          }`}
        >
          <Satellite className="h-3.5 w-3.5 stroke-[2.3] sm:h-4 sm:w-4" />
          <span className="text-[8px] leading-none font-black sm:text-[9px]">
            {baseMapType === 'skyview'
              ? '순수위성'
              : baseMapType === 'hybrid'
                ? '하이브리드'
                : '지도·3D'}
          </span>
          {overlayMapTypes.length > 0 && (
            <span className="absolute -top-1.5 -left-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-slate-950 bg-amber-400 px-1 text-[9px] font-black text-slate-950 shadow">
              {overlayMapTypes.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={handleToggleEngine}
          aria-label="지도 엔진 전환 (카카오맵 ↔ 레거시 OSM)"
          title={
            activeEngine === 'kakao'
              ? '현재: 카카오맵 (클릭 시 레거시 OSM 지도로 전환)'
              : '현재: 레거시 OSM (클릭 시 카카오맵 재연결/전환)'
          }
          className={`flex h-9 w-9 flex-col items-center justify-center rounded-xl border-2 shadow-xl transition active:scale-95 sm:h-11 sm:w-11 sm:rounded-2xl ${
            activeEngine === 'kakao'
              ? 'border-yellow-400 bg-yellow-400 text-slate-950'
              : 'border-slate-600 bg-[#0b192c]/95 text-yellow-300'
          }`}
        >
          <Globe className="h-3.5 w-3.5 stroke-[2.3] sm:h-4 sm:w-4" />
          <span className="text-[8px] leading-none font-black sm:text-[9px]">
            {activeEngine === 'kakao' ? '카카오' : 'OSM'}
          </span>
        </button>

        <button
          type="button"
          onClick={onResetBounds}
          aria-label="전체 해역 보기"
          title="통영·거제 전체 해역 보기"
          className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-slate-600 bg-[#0b192c]/95 text-white shadow-xl transition active:scale-95 sm:h-11 sm:w-11 sm:rounded-2xl"
        >
          <Maximize className="h-4 w-4 stroke-[2.3] sm:h-5 sm:w-5" />
        </button>

        <div className="flex flex-col overflow-hidden rounded-xl border-2 border-slate-600 bg-[#0b192c]/95 shadow-xl sm:rounded-2xl">
          <button
            type="button"
            onClick={() => setZoomStepTrigger({ delta: 1, nonce: Date.now() })}
            aria-label="지도 확대"
            className="flex h-8 w-9 items-center justify-center border-b border-slate-700 text-white active:bg-slate-800 sm:h-11 sm:w-11"
          >
            <Plus className="h-4 w-4 stroke-[2.6] sm:h-5 sm:w-5" />
          </button>
          <button
            type="button"
            onClick={() => setZoomStepTrigger({ delta: -1, nonce: Date.now() })}
            aria-label="지도 축소"
            className="flex h-8 w-9 items-center justify-center text-white active:bg-slate-800 sm:h-11 sm:w-11"
          >
            <Minus className="h-4 w-4 stroke-[2.6] sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>

      {/* 3-B. 우측 독에서 펼쳐지는 지도유형 · 2.5D 지형 · 3D 로드뷰 선택 팝오버 카드 */}
      {isMapTypePopoverOpen && (
        <div
          role="dialog"
          aria-label="배경지도 및 2.5D 지형·3D 로드뷰 레이어 설정"
          className="fixed top-[8.75rem] right-13 z-[920] w-[17.5rem] rounded-2xl border-2 border-emerald-400/80 bg-[#0b192c]/98 p-3 text-white shadow-2xl backdrop-blur-md sm:top-[10.5rem] sm:right-16 sm:w-80 sm:p-3.5"
        >
          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
            <div className="flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-emerald-400" />
              <h3 className="text-xs font-black text-white sm:text-sm">
                배경지도 · 2.5D 지형 · 3D 뷰
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsMapTypePopoverOpen(false)}
              aria-label="지도유형 선택창 닫기"
              className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-slate-300 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 섹션 1: 현장 실무 원터치 프리셋 */}
          <div className="mt-2.5">
            <p className="text-[10px] font-extrabold text-amber-300">
              현장 실무 원터치 프리셋
            </p>
            <div className="mt-1 grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => handleApplyMapPreset('skyview', ['terrain'])}
                className={`rounded-xl border px-1.5 py-1.5 text-[10px] leading-tight font-black transition active:scale-95 ${
                  baseMapType === 'skyview' &&
                  overlayMapTypes.length === 1 &&
                  overlayMapTypes[0] === 'terrain'
                    ? 'border-emerald-300 bg-emerald-500 text-slate-950'
                    : 'border-slate-600 bg-slate-900/90 text-emerald-200'
                }`}
              >
                암초·선착장
                <span className="mt-0.5 block text-[9px] font-bold opacity-85">
                  순수위성+2.5D
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleApplyMapPreset('hybrid', ['use_district'])}
                className={`rounded-xl border px-1.5 py-1.5 text-[10px] leading-tight font-black transition active:scale-95 ${
                  baseMapType === 'hybrid' &&
                  overlayMapTypes.length === 1 &&
                  overlayMapTypes[0] === 'use_district'
                    ? 'border-amber-300 bg-amber-400 text-slate-950'
                    : 'border-slate-600 bg-slate-900/90 text-amber-200'
                }`}
              >
                관할·지적도
                <span className="mt-0.5 block text-[9px] font-bold opacity-85">
                  하이브리드+지적
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleApplyMapPreset('hybrid', ['roadview'])}
                className={`rounded-xl border px-1.5 py-1.5 text-[10px] leading-tight font-black transition active:scale-95 ${
                  baseMapType === 'hybrid' &&
                  overlayMapTypes.length === 1 &&
                  overlayMapTypes[0] === 'roadview'
                    ? 'border-sky-300 bg-sky-400 text-slate-950'
                    : 'border-slate-600 bg-slate-900/90 text-sky-200'
                }`}
              >
                3D 로드뷰
                <span className="mt-0.5 block text-[9px] font-bold opacity-85">
                  파란선 탭→3D
                </span>
              </button>
            </div>
          </div>

          {/* 섹션 2: 기본 배경지도 (Base MapTypeId 3종) */}
          <div className="mt-2.5">
            <p className="text-[10px] font-extrabold text-slate-300">
              1. 기본 배경지도 (MapTypeId 베이스 3종)
            </p>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'roadmap', label: '일반지도', desc: 'ROADMAP' },
                  { id: 'skyview', label: '순수위성', desc: '무라벨 원판' },
                  { id: 'hybrid', label: '하이브리드', desc: '위성+지명' },
                ] as const
              ).map((item) => {
                const isSelected = baseMapType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSetBaseMapType(item.id)}
                    aria-pressed={isSelected}
                    className={`rounded-xl border px-2 py-1.5 text-center transition active:scale-95 ${
                      isSelected
                        ? 'border-sky-300 bg-sky-500 font-black text-slate-950 shadow'
                        : 'border-slate-600 bg-slate-900/90 font-bold text-slate-200'
                    }`}
                  >
                    <span className="block text-[11px] leading-none font-black">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-[9px] opacity-80">
                      {item.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 섹션 3: 중첩 오버레이 레이어 (Overlay MapTypeId 5종 다중 선택) */}
          <div className="mt-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-extrabold text-slate-300">
                2. 중첩 레이어 (다중 선택 가능)
              </p>
              {overlayMapTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setMapPrefs((prev) => ({ ...prev, overlayMapTypes: [] }))
                  }
                  className="text-[10px] font-black text-rose-300 underline hover:text-rose-200"
                >
                  오버레이 모두 끄기
                </button>
              )}
            </div>

            <div className="mt-1 grid grid-cols-2 gap-1">
              {(
                [
                  {
                    id: 'terrain',
                    label: '2.5D 입체지형도',
                    sub: 'TERRAIN · 등고선/음영',
                  },
                  {
                    id: 'use_district',
                    label: '지적편집도',
                    sub: 'USE_DISTRICT · 필지',
                  },
                  {
                    id: 'roadview',
                    label: '3D 로드뷰 구간',
                    sub: 'ROADVIEW · 파란선',
                  },
                  {
                    id: 'traffic',
                    label: '실시간 교통정보',
                    sub: 'TRAFFIC · 소통현황',
                  },
                  {
                    id: 'bicycle',
                    label: '자전거·탐방길',
                    sub:
                      baseMapType === 'roadmap'
                        ? 'BICYCLE · 일반배경'
                        : 'BICYCLE_HYBRID · 위성용',
                  },
                ] as const
              ).map((ovl) => {
                const isChecked = overlayMapTypes.includes(ovl.id);
                return (
                  <button
                    key={ovl.id}
                    type="button"
                    onClick={() => handleToggleOverlayMapType(ovl.id)}
                    aria-pressed={isChecked}
                    className={`flex flex-col items-start rounded-xl border px-2 py-1.5 text-left transition active:scale-95 ${
                      isChecked
                        ? 'border-emerald-300 bg-emerald-500/25 text-emerald-200 shadow'
                        : 'border-slate-700 bg-slate-900/80 text-slate-300'
                    }`}
                  >
                    <span className="flex w-full items-center justify-between text-[11px] font-black">
                      <span>{ovl.label}</span>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isChecked ? 'bg-emerald-400' : 'bg-slate-600'
                        }`}
                      />
                    </span>
                    <span className="mt-0.5 text-[9px] text-slate-400">
                      {ovl.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 섹션 4: 현재 화면 중심 좌표 360° 3D 현장 로드뷰 바로 실행 */}
          <div className="mt-2.5 border-t border-slate-700 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsMapTypePopoverOpen(false);
                setInternalRoadviewTarget({
                  lat: viewport.lat,
                  lng: viewport.lng,
                  title: `현재 지도 중심 3D 현장뷰 (${viewport.lat.toFixed(4)}°N, ${viewport.lng.toFixed(4)}°E)`,
                });
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-xs font-black text-slate-950 shadow active:scale-95"
            >
              <Eye className="h-4 w-4 stroke-[2.5]" />
              <span>현재 화면 중심 360° 3D 로드뷰 열기</span>
            </button>
          </div>
        </div>
      )}

      {/* 3-C. 3D 로드뷰 구간(ROADVIEW) 오버레이 활성 시 상단 인터랙션 안내 배너 */}
      {overlayMapTypes.includes('roadview') && (
        <div
          role="status"
          className="fixed inset-x-3 top-[8.6rem] z-[880] mx-auto flex max-w-md items-center justify-between gap-2 rounded-2xl border-2 border-sky-400 bg-[#0b192c]/95 px-3 py-2 text-xs text-sky-100 shadow-2xl backdrop-blur-md sm:top-[10.3rem]"
        >
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 shrink-0 text-sky-400" />
            <span className="text-[11px] leading-snug font-extrabold">
              <strong className="text-sky-300">3D 로드뷰 탐색 켜짐:</strong> 파란색 해안도로·선착장 구간을 탭하면 360° 3D 현장뷰가 열립니다.
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleToggleOverlayMapType('roadview')}
            className="shrink-0 rounded-lg border border-sky-400/60 bg-sky-500/20 px-2 py-1 text-[10px] font-black text-sky-200 active:scale-95"
          >
            로드뷰 선 끄기
          </button>
        </div>
      )}

      {/* 3-D. 지적편집도(USE_DISTRICT) 활성 시 공식 법적 고지 배지 */}
      {overlayMapTypes.includes('use_district') && (
        <div
          role="note"
          className="pointer-events-none fixed bottom-20 left-2.5 z-[840] max-w-xs rounded-xl border border-amber-400/70 bg-slate-950/90 px-2.5 py-1 text-[10px] leading-tight font-bold text-amber-200 shadow-lg backdrop-blur-sm"
        >
          <Mountain className="mr-1 inline h-3 w-3 text-amber-400" />
          지적편집도는 현행 지적 정보와 일치하지 않을 수 있으며 참고 이외의 용도로 사용할 수 없습니다.
        </div>
      )}

      {/* 3-E. 360° 3D 구면 현장 로드뷰 모달 */}
      {activeRoadviewTarget && (
        <Suspense fallback={null}>
          <Roadview3DModal
            key={`${activeRoadviewTarget.lat.toFixed(5)}:${activeRoadviewTarget.lng.toFixed(5)}:${activeRoadviewTarget.pointId ?? ''}`}
            kakaoMaps={kakaoNamespace}
            target={activeRoadviewTarget}
            onClose={handleCloseRoadviewModal}
            onFallbackToSatelliteTerrain={handleFallbackToSatelliteTerrain}
          />
        </Suspense>
      )}

      {/* 4. Kakao Map GIS 진단 & 도메인 등록 안내 모달 */}
      {isDiagModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="kakao-diag-title"
          className="fixed inset-0 z-[1400] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setIsDiagModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border-2 border-amber-400/80 bg-[#0b192c] p-5 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <h2 id="kakao-diag-title" className="text-base font-black text-white">
                  Kakao Map GIS 연동 진단 및 조치 안내
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsDiagModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-200">
              <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3">
                <p className="font-extrabold text-sky-300">현재 GIS 엔진 진단 상태</p>
                <ul className="mt-1.5 space-y-1 text-[11px] text-slate-300">
                  <li>
                    • 활성 엔진:{' '}
                    <strong className="text-amber-300">
                      {activeEngine === 'kakao'
                        ? 'Kakao Maps SDK v3'
                        : 'Legacy Leaflet (OpenStreetMap 자동 폴백)'}
                    </strong>
                  </li>
                  <li>
                    • 인식된 API 키 (`.env`):{' '}
                    <code className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-300">
                      {diagnostics.maskedKey}
                    </code>
                  </li>
                  <li>• 최근 점검 시각: {diagnostics.lastCheckedAt}</li>
                  {diagnostics.errorMessage && (
                    <li className="text-rose-300">• 사유: {diagnostics.errorMessage}</li>
                  )}
                </ul>
              </div>

              <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-3">
                <p className="font-extrabold text-amber-300">
                  [사용자 필수 조치] 카카오 개발자 콘솔 웹 도메인 등록
                </p>
                <p className="mt-1 text-[11px] text-slate-300">
                  카카오맵 JS SDK는 보안 정책상 등록된 도메인에서만 지도를 렌더링합니다.
                  카카오 개발자 콘솔(developers.kakao.com) ➔ <strong>내 애플리케이션</strong> ➔{' '}
                  <strong>앱 설정 &gt; 플랫폼 &gt; Web 사이트 도메인</strong>에 아래 주소를 추가해 주세요:
                </p>

                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2">
                  <code className="truncate font-mono text-xs font-bold text-sky-300">
                    {diagnostics.currentOrigin}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyOrigin}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-sky-500 px-2.5 py-1 text-[11px] font-black text-slate-950 active:scale-95"
                  >
                    {copiedOrigin ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>복사됨</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>주소 복사</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="mt-2 text-[11px] text-slate-400">
                  권장 등록 도메인 목록:
                  <br />• 로컬 개발: <code className="text-slate-200">http://localhost:5173</code>,{' '}
                  <code className="text-slate-200">http://127.0.0.1:5173</code>
                  <br />• 운영 배포: <code className="text-slate-200">https://gunnysis.github.io</code>
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDiagModalOpen(false);
                  handleRetryKakaoEngine();
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-400 py-2.5 text-xs font-black text-slate-950 shadow active:scale-95"
              >
                <RefreshCw className="h-4 w-4" />
                <span>도메인 등록 완료 · 카카오맵 즉시 재연결</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDiagModalOpen(false)}
                className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-200"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
