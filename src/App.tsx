import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronLeft,
  Download,
  Layers,
  Mail,
  Navigation,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Waves,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';

import { HomeScreen, type NotebookLaunchPreset } from './components/home/HomeScreen';
import type { RouteMapTapMode } from './components/navigation/RouteTimeCalculator';
import type { SettingsInitialSection } from './components/navigation/WeatherThresholdSettings';
import { APP_VERSION_DISPLAY } from './config/appVersion';

const MapView = lazy(() =>
  import('./components/MapView').then((m) => ({ default: m.MapView })),
);
const DockingDetailSheet = lazy(() =>
  import('./components/DockingDetailSheet').then((m) => ({
    default: m.DockingDetailSheet,
  })),
);
const LayerControlModal = lazy(() =>
  import('./components/notebook/LayerControlModal').then((m) => ({
    default: m.LayerControlModal,
  })),
);
const FieldReportModal = lazy(() =>
  import('./components/notebook/FieldReportModal').then((m) => ({
    default: m.FieldReportModal,
  })),
);
const PorpoiseObservationModal = lazy(() =>
  import('./components/notebook/PorpoiseObservationModal').then((m) => ({
    default: m.PorpoiseObservationModal,
  })),
);
const RouteTimeCalculator = lazy(() =>
  import('./components/navigation/RouteTimeCalculator').then((m) => ({
    default: m.RouteTimeCalculator,
  })),
);
const PortSelectModal = lazy(() =>
  import('./components/navigation/PortSelectModal').then((m) => ({
    default: m.PortSelectModal,
  })),
);
const MarineWeatherPanel = lazy(() =>
  import('./components/navigation/MarineWeatherPanel').then((m) => ({
    default: m.MarineWeatherPanel,
  })),
);
const WeatherThresholdSettings = lazy(() =>
  import('./components/navigation/WeatherThresholdSettings').then((m) => ({
    default: m.WeatherThresholdSettings,
  })),
);

import type {
  DockingFeature,
  DockingFeatureCollection,
  MarkerColor,
} from './types/docking';
import {
  ALL_MARKER_COLORS,
  MARKER_COLOR_MAP,
  MARKER_PRIORITY_ORDER,
  SECONDARY_MARKER_COLORS,
} from './types/docking';
import type { PorpoiseRecord } from './types/porpoise';
import type { MarinePort, MarineWaypointNode, PortsDataset } from './types/port';
import type { RouteWaypoint } from './types/route';
import type { RoadviewTargetLocation } from './types/kakao';

import { useAppConfig } from './hooks/useAppConfig';
import { useAppRoute, type NavPanelType } from './hooks/useAppRoute';
import { usePorpoiseStorage } from './hooks/usePorpoiseStorage';
import { useMarineWeather } from './hooks/useMarineWeather';
import {
  calculateRouteSummary,
  describeNearestPortArea,
  resolveSmartWaypoint,
} from './services/routeGeoService';

interface UserGpsState {
  lat: number;
  lng: number;
  accuracy?: number;
  isSimulated?: boolean;
}

const INITIAL_WAYPOINTS: RouteWaypoint[] = [
  {
    id: 'wp_start',
    name: '통영 당동항 보조물양장',
    lat: 34.8378,
    lng: 128.4278,
    type: 'start',
    matchedPortId: 'TY-001',
    isCustomCoord: false,
    subCategory: 'official_docking',
    facilityLabel: '물양장 안벽',
    minDepthMeters: 1.4,
    tidalSensitivity: 'HIGH',
    maxVesselTons: 20,
    hazards: ['수중 폐로프 주의', '대조기 간조 수심 1.4m 주의'],
  },
  {
    id: 'wp_end',
    name: '한산도 제승당 부잔교',
    lat: 34.7735,
    lng: 128.4621,
    type: 'end',
    matchedPortId: 'TY-002',
    isCustomCoord: false,
    subCategory: 'official_docking',
    facilityLabel: '부잔교(폰툰)',
    minDepthMeters: 3.8,
    tidalSensitivity: 'LOW',
    maxVesselTons: 30,
    hazards: ['여객선 항주파 주의', '창조류 유속 1.8kt'],
  },
];

export function App() {
  const {
    config,
    layers,
    geoJsonLayersData,
    layerLoadErrorIds,
    releaseId,
    lastSavedAt,
    remoteSyncStatus,
    remoteCommitUrl,
    snapshots,
    toggleLayer,
    saveOperationalLayers,
    retryFailedGeoJsonLayers,
    updateAdminEmail,
  } = useAppConfig();
  const {
    records: porpoiseRecords,
    addRecord: addPorpoise,
    updateRecord: updatePorpoise,
    deleteRecord: deletePorpoise,
  } = usePorpoiseStorage();

  // 1. 라우트(Home / Notebook / Navigation) 및 서브 탭 상태 (URL Query & History API 양방향 동기화)
  const {
    route,
    navigateToScreen,
    switchWorkspaceScreen,
    navigateHome,
    replaceNavPanel,
  } = useAppRoute();
  const isHomeScreen = route.screen === 'home';
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState<boolean>(
    () => route.screen !== 'home',
  );
  const [lastTriggeredCardId, setLastTriggeredCardId] = useState<
    'notebook' | 'navigation' | null
  >(() => (route.screen !== 'home' ? route.screen : null));
  const workspaceHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // 브라우저 앞으로/뒤로 가기(popstate)로 작업공간에 진입했을 때도 hasEnteredWorkspace 및 최근 카드 ID를 동기화
  useEffect(() => {
    const handlePopStateSync = () => {
      const params = new URLSearchParams(window.location.search);
      const screenParam = params.get('screen');
      if (screenParam === 'notebook' || screenParam === 'navigation') {
        setHasEnteredWorkspace(true);
        setLastTriggeredCardId(screenParam);
      }
    };
    window.addEventListener('popstate', handlePopStateSync);
    return () => window.removeEventListener('popstate', handlePopStateSync);
  }, []);

  const activeMainTab: 'notebook' | 'navigation' =
    route.screen === 'navigation' ? 'navigation' : 'notebook';
  const navSubTab: 'route' | 'weather' = route.panel;

  // 2. 정적 데이터 (접안 포인트 GeoJSON + 주요 항포구·소규모 선착장·변침점 JSON)
  const [collection, setCollection] = useState<DockingFeatureCollection | null>(null);
  const [portsList, setPortsList] = useState<MarinePort[]>([]);
  const [marineWaypoints, setMarineWaypoints] = useState<MarineWaypointNode[]>([]);
  const [snapRadiusMeters, setSnapRadiusMeters] = useState<number>(500);
  const [showPortMarkersOnMap, setShowPortMarkersOnMap] = useState<boolean>(true);
  const [showDirectionArrows, setShowDirectionArrows] = useState<boolean>(true);
  const [selectedLegIndex, setSelectedLegIndex] = useState<number | null>(null);
  const [fitRouteBoundsTrigger, setFitRouteBoundsTrigger] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  // '위험주의(red)' 우선 인지(Hazard-First) 기본값 + 권역(전체/통영/거제) 및 검색어 필터
  const [selectedColors, setSelectedColors] = useState<MarkerColor[]>(['red']);
  const [selectedRegion, setSelectedRegion] = useState<'all' | 'tongyeong' | 'geoje'>('all');
  const [dockingSearchQuery, setDockingSearchQuery] = useState<string>('');
  const [isColorFilterOpen, setIsColorFilterOpen] = useState<boolean>(false);
  const colorFilterPopoverRef = useRef<HTMLDivElement | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<DockingFeature | null>(null);

  // 3. 모달 및 지도 인터랙션 모드 상태
  const [isLayerModalOpen, setIsLayerModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTargetFeature, setReportTargetFeature] = useState<DockingFeature | null>(null);
  const [customReportCoords, setCustomReportCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isReportPickMode, setIsReportPickMode] = useState(false);

  const [showPorpoiseLayer, setShowPorpoiseLayer] = useState(true);
  const [isPorpoiseAddMode, setIsPorpoiseAddMode] = useState(false);
  const [porpoiseModalCoords, setPorpoiseModalCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedPorpoise, setSelectedPorpoise] = useState<PorpoiseRecord | null>(null);

  const [isWeatherSettingsOpen, setIsWeatherSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SettingsInitialSection>('thresholds');
  const [externalRoadviewTarget, setExternalRoadviewTarget] =
    useState<RoadviewTargetLocation | null>(null);
  const [portSelectorTarget, setPortSelectorTarget] = useState<{
    waypointId: string;
    label: string;
  } | null>(null);

  const handleOpenWorkspaceFromHome = useCallback(
    (target: 'notebook' | 'navigation') => {
      setLastTriggeredCardId(target);
      setHasEnteredWorkspace(true);
      navigateToScreen(target, 'route');
      window.setTimeout(() => {
        workspaceHeadingRef.current?.focus({ preventScroll: true });
      }, 60);
    },
    [navigateToScreen],
  );

  // 인트로 허브에서 '꼬미의 바다수첩' 세부 프리셋(위험주의 9 / 전체 55 / 공간 레이어)으로 직행
  const handleOpenNotebookPresetFromHome = useCallback(
    (preset: NotebookLaunchPreset) => {
      setLastTriggeredCardId('notebook');
      setHasEnteredWorkspace(true);
      setIsPorpoiseAddMode(false);
      setIsReportPickMode(false);
      setIsColorFilterOpen(false);
      if (preset === 'hazard') {
        setSelectedColors(['red']);
        setSelectedRegion('all');
        setDockingSearchQuery('');
      } else if (preset === 'all') {
        setSelectedColors([...ALL_MARKER_COLORS]);
        setSelectedRegion('all');
        setDockingSearchQuery('');
      } else if (preset === 'layers') {
        setIsLayerModalOpen(true);
      }
      navigateToScreen('notebook', 'route');
      window.setTimeout(() => {
        workspaceHeadingRef.current?.focus({ preventScroll: true });
      }, 60);
    },
    [navigateToScreen],
  );

  // 인트로 허브에서 '바닷길 콕콕' 세부 탭(시간계산 / 해상기상 판정)으로 직행
  const handleOpenNavigationPanelFromHome = useCallback(
    (panel: NavPanelType) => {
      setLastTriggeredCardId('navigation');
      setHasEnteredWorkspace(true);
      setIsPorpoiseAddMode(false);
      setIsReportPickMode(false);
      setIsColorFilterOpen(false);
      navigateToScreen('navigation', panel);
      window.setTimeout(() => {
        workspaceHeadingRef.current?.focus({ preventScroll: true });
      }, 60);
    },
    [navigateToScreen],
  );

  const handleReturnToHome = useCallback(() => {
    // Home 복귀 시 일시적인 픽커 모드 및 모달은 종료하고 주요 작업 상태(항로/필터/카메라)는 보존
    setIsPorpoiseAddMode(false);
    setIsReportPickMode(false);
    setIsColorFilterOpen(false);
    setIsLayerModalOpen(false);
    setIsReportModalOpen(false);
    setIsWeatherSettingsOpen(false);
    setExternalRoadviewTarget(null);
    setPortSelectorTarget(null);
    navigateHome(navSubTab);
  }, [navigateHome, navSubTab]);

  // 4. GPS, 온라인 상태 및 PWA 설치 프롬프트
  const [userLocation, setUserLocation] = useState<UserGpsState | null>(null);
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [flyTarget, setFlyTarget] = useState<{
    lat: number;
    lng: number;
    zoom: number;
    nonce: number;
  } | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  });

  // 5. 바닷길 콕콕 - 시간계산기 상태 & 최대 10단계 실행취소(Undo) 히스토리 스택 (선박 속력 기기 영속 저장 지원)
  const [speedKnots, setSpeedKnotsState] = useState<number>(() => {
    try {
      const saved = window.localStorage.getItem('bada_vessel_speed_knots_v1');
      if (saved !== null) {
        const num = Number(saved);
        if (Number.isFinite(num) && num >= 5 && num <= 45) {
          return num;
        }
      }
    } catch {
      // ignore storage error
    }
    return config.route_defaults?.default_speed_knots || 15;
  });

  const setSpeedKnots = useCallback((nextSpeed: number) => {
    if (!Number.isFinite(nextSpeed) || nextSpeed < 5 || nextSpeed > 45) return;
    setSpeedKnotsState(nextSpeed);
    try {
      window.localStorage.setItem('bada_vessel_speed_knots_v1', String(nextSpeed));
    } catch {
      // ignore storage error
    }
  }, []);
  const [routeWaypoints, setRouteWaypoints] = useState<RouteWaypoint[]>(INITIAL_WAYPOINTS);
  const [routeUndoStack, setRouteUndoStack] = useState<RouteWaypoint[][]>([]);
  const [routeMapTapMode, setRouteMapTapMode] = useState<RouteMapTapMode>('add_waypoint');

  const commitRouteWaypoints = useCallback(
    (updater: (prev: RouteWaypoint[]) => RouteWaypoint[]) => {
      setRouteWaypoints((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        setRouteUndoStack((stack) => [...stack.slice(-9), prev]);
        return next;
      });
    },
    [],
  );

  // 6. 바닷길 콕콕 - 해상기상 상태판정 훅 (ECMWF IFS HRES + WAM HRES 전용, app_config.json 단일 원천 연결)
  const marineWeather = useMarineWeather(34.8195, 128.552, config.weather_defaults);
  const { updateCoordinates: updateWeatherCoordinates } = marineWeather;

  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string, durationMs = 2800) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setGpsStatusMsg(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setGpsStatusMsg(null);
      toastTimerRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // PWA 설치 이벤트 리스너
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      showToast('바다꼼꼬미 앱이 기기에 설치되었습니다!');
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [showToast]);

  // 온라인/오프라인 감지
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 정적 GeoJSON 및 항포구·소규모 선착장(ports.json) 비동기 로드
  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL;
    const geoJsonUrl = `${base}data/docking_points.geojson`;
    const portsUrl = `${base}data/ports.json`;

    Promise.all([
      fetch(geoJsonUrl, {
        headers: { Accept: 'application/geo+json, application/json' },
        signal: controller.signal,
      }),
      fetch(portsUrl, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }).catch(() => null),
    ])
      .then(async ([geoRes, portsRes]) => {
        if (!geoRes.ok) {
          throw new Error(`HTTP ${geoRes.status}: 접안 포인트 GeoJSON을 찾을 수 없습니다.`);
        }
        const geoData = (await geoRes.json()) as DockingFeatureCollection;
        if (!geoData || geoData.type !== 'FeatureCollection' || !Array.isArray(geoData.features)) {
          throw new Error('GeoJSON 형식이 올바르지 않습니다 (FeatureCollection 필요).');
        }
        setCollection(geoData);

        if (portsRes && portsRes.ok) {
          const portsData = (await portsRes.json()) as PortsDataset;
          if (Array.isArray(portsData.ports)) {
            setPortsList(portsData.ports);
          }
          if (Array.isArray(portsData.waypoints)) {
            setMarineWaypoints(portsData.waypoints);
          }
          if (typeof portsData.snap_radius_meters === 'number') {
            setSnapRadiusMeters(portsData.snap_radius_meters);
          }
        }
        setErrorMsg(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setErrorMsg(err instanceof Error ? err.message : '데이터 로드 실패');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [reloadNonce]);

  const handleManualReload = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    setReloadNonce((n) => n + 1);
  }, []);

  // 접안지 등급별 건수 사전 집계
  const colorCounts = useMemo<Record<MarkerColor, number>>(() => {
    const counts: Record<MarkerColor, number> = {
      red: 0,
      amber: 0,
      green: 0,
      blue: 0,
      purple: 0,
    };
    if (!collection) return counts;
    for (const f of collection.features) {
      const c = f.properties.color;
      if (c in counts) {
        counts[c] += 1;
      }
    }
    return counts;
  }, [collection]);

  const totalDockingCount = collection?.features.length ?? 0;

  // 권역별(전체 / 통영권 / 거제권) 건수 사전 집계
  const regionCounts = useMemo(() => {
    const counts = { all: 0, tongyeong: 0, geoje: 0 };
    if (!collection) return counts;
    for (const f of collection.features) {
      counts.all += 1;
      if (f.properties.id.includes('GJ')) {
        counts.geoje += 1;
      } else {
        counts.tongyeong += 1;
      }
    }
    return counts;
  }, [collection]);

  // 접안 포인트 다중 필터링(등급 + 권역 + 검색어) + 위험도 우선순위(red→amber→green→blue→purple) 자동 정렬
  const filteredFeatures = useMemo(() => {
    if (!collection) return [];
    const activeSet = new Set<MarkerColor>(selectedColors);
    const query = dockingSearchQuery.trim().toLowerCase();
    return collection.features
      .filter((f) => {
        if (!activeSet.has(f.properties.color)) return false;
        if (selectedRegion === 'geoje' && !f.properties.id.includes('GJ')) return false;
        if (selectedRegion === 'tongyeong' && f.properties.id.includes('GJ')) return false;
        if (query) {
          const hay = `${f.properties.id} ${f.properties.name} ${f.properties.purpose} ${f.properties.hazard}`.toLowerCase();
          if (!hay.includes(query)) return false;
        }
        return true;
      })
      .slice()
      .sort(
        (a, b) =>
          (MARKER_PRIORITY_ORDER[a.properties.color] ?? 99) -
          (MARKER_PRIORITY_ORDER[b.properties.color] ?? 99),
      );
  }, [collection, selectedColors, selectedRegion, dockingSearchQuery]);

  const isRedOnly =
    selectedColors.length === 1 && selectedColors[0] === 'red';
  const isAllColorsSelected =
    selectedColors.length === ALL_MARKER_COLORS.length;
  const extraSelectedCount = useMemo(
    () =>
      selectedColors.filter((c) => c !== 'red').length,
    [selectedColors],
  );

  // 등급 선택 팝오버 외부 클릭 및 Escape 닫기 가드
  useEffect(() => {
    if (!isColorFilterOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        colorFilterPopoverRef.current &&
        !colorFilterPopoverRef.current.contains(e.target as Node)
      ) {
        setIsColorFilterOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsColorFilterOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isColorFilterOpen]);

  const handleToggleColor = useCallback(
    (colorKey: MarkerColor) => {
      setSelectedColors((prev) => {
        const exists = prev.includes(colorKey);
        if (exists) {
          const next = prev.filter((c) => c !== colorKey);
          // 최소 1개 등급 활성 보장 가드 (빈 지도 방지)
          if (next.length === 0) {
            showToast('최소 1개 등급이 필요하여 위험주의(기본) 상태로 유지됩니다.');
            return ['red'];
          }
          if (selectedFeature && !next.includes(selectedFeature.properties.color)) {
            setSelectedFeature(null);
          }
          return next;
        }
        const next = [...prev, colorKey].sort(
          (a, b) => MARKER_PRIORITY_ORDER[a] - MARKER_PRIORITY_ORDER[b],
        );
        return next;
      });
    },
    [selectedFeature, showToast],
  );

  const handleResetToHazardOnly = useCallback(() => {
    setSelectedColors(['red']);
    if (selectedFeature && selectedFeature.properties.color !== 'red') {
      setSelectedFeature(null);
    }
    showToast('위험주의(9개소) 집중 표시 모드로 전환되었습니다.');
  }, [selectedFeature, showToast]);

  const handleSelectAllColors = useCallback(() => {
    setSelectedColors([...ALL_MARKER_COLORS]);
    showToast(`전체 ${totalDockingCount || 55}개소(5개 등급)가 모두 표시됩니다.`);
  }, [totalDockingCount, showToast]);

  const handleHazardPrimaryChipClick = useCallback(() => {
    if (!selectedColors.includes('red') || selectedColors.length > 1) {
      setSelectedColors(['red']);
      if (selectedFeature && selectedFeature.properties.color !== 'red') {
        setSelectedFeature(null);
      }
      showToast('위험주의(9개소) 단독 표시 모드로 전환되었습니다.');
      return;
    }
    // 이미 위험주의 단독 모드일 때 탭하면 통영·거제 전체 위험지점 시야로 리셋 안내
    setFlyTarget({ lat: 34.8195, lng: 128.552, zoom: 11, nonce: Date.now() });
    showToast('통영·거제 위험주의 9개소 집중 표시 중 (우측 [+등급 선택]에서 타 등급 추가 가능)');
  }, [selectedColors, selectedFeature, showToast]);

  const isDockingLayerVisible = useMemo(
    () => layers.find((l) => l.id === 'docking')?.visible !== false,
    [layers],
  );

  // 항해 경로 연산 결과 (해상 변침점 A* 우회 및 소규모 선착장 수심/위험도 반영)
  const routeCalculation = useMemo(() => {
    return calculateRouteSummary(routeWaypoints, speedKnots, portsList, marineWaypoints);
  }, [routeWaypoints, speedKnots, portsList, marineWaypoints]);

  // GPS 위치 요청
  const handleRequestGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      showToast('GPS 위치 기능을 지원하지 않는 기기입니다.');
      return;
    }
    showToast('위성 GPS 신호 수신 중...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLoc: UserGpsState = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          isSimulated: false,
        };
        setUserLocation(nextLoc);
        showToast('실제 GPS 위치 수신 완료');
        setFlyTarget({ lat: nextLoc.lat, lng: nextLoc.lng, zoom: 13, nonce: Date.now() });
      },
      () => {
        const fallbackLoc: UserGpsState = {
          lat: 34.8125,
          lng: 128.5085,
          accuracy: 95,
          isSimulated: true,
        };
        setUserLocation(fallbackLoc);
        showToast('실내/권한 제한 감지 → 통영·거제 해역 가상 선박 위치로 이동');
        setFlyTarget({
          lat: fallbackLoc.lat,
          lng: fallbackLoc.lng,
          zoom: 12,
          nonce: Date.now(),
        });
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 },
    );
  }, [showToast]);

  const handleSimulateFieldGps = useCallback(() => {
    const simLoc: UserGpsState = {
      lat: 34.8125,
      lng: 128.5085,
      accuracy: 85,
      isSimulated: true,
    };
    setUserLocation(simLoc);
    showToast('통영·거제 한산수도 조사선 GPS(시뮬레이션) 활성화');
    setFlyTarget({ lat: simLoc.lat, lng: simLoc.lng, zoom: 12, nonce: Date.now() });
  }, [showToast]);

  const handleResetBounds = useCallback(() => {
    setFlyTarget({ lat: 34.8195, lng: 128.552, zoom: 11, nonce: Date.now() });
  }, []);

  const handleFlyToPoint = useCallback((lat: number, lng: number, zoom = 14) => {
    setFlyTarget({ lat, lng, zoom, nonce: Date.now() });
  }, []);

  // PWA 앱 설치 핸들러
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') setDeferredPrompt(null);
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        alert(
          '아이폰/아이패드 설치 방법:\n하단 공유 버튼(네모+화살표)을 누르고 "홈 화면에 추가"를 선택하세요.',
        );
      } else {
        alert(
          '브라우저 우측 상단 점 3개 메뉴를 누르고 "앱 설치" 또는 "홈 화면에 추가"를 선택하세요.',
        );
      }
    }
  };

  // [3.2.C 바닷길 시간계산기] 핀 드래그 시 항구/소규모 선착장 500m 스냅 및 해상 좌표 실시간 동기화
  const handleUpdateWaypointPos = useCallback(
    (id: string, lat: number, lng: number) => {
      commitRouteWaypoints((prev) =>
        prev.map((wp, idx) => {
          if (wp.id !== id) return wp;
          const fallbackRole =
            wp.type === 'start' ? '해상 출발지' : wp.type === 'end' ? '해상 목적지' : `경유지 ${idx}`;
          const resolved = resolveSmartWaypoint(
            lat,
            lng,
            portsList,
            fallbackRole,
            snapRadiusMeters,
          );
          if (resolved.matchedPortId) {
            showToast(`자동 스냅: ${resolved.name}`);
          }
          return {
            ...wp,
            name: resolved.name,
            lat: resolved.lat,
            lng: resolved.lng,
            matchedPortId: resolved.matchedPortId,
            isCustomCoord: resolved.isCustomCoord,
            subCategory: resolved.subCategory,
            facilityLabel: resolved.facilityLabel,
            minDepthMeters: resolved.minDepthMeters,
            tidalSensitivity: resolved.tidalSensitivity,
            maxVesselTons: resolved.maxVesselTons,
            hazards: resolved.hazards,
          };
        }),
      );
    },
    [commitRouteWaypoints, portsList, snapRadiusMeters, showToast],
  );

  // [3.2.C] 지도 탭으로 포인트 지정 (이동 잠금 / 경유지 추가 / 출발지 1회 지정 후 자동 잠금 / 목적지 1회 지정 후 자동 잠금)
  const handleMapClickForRoute = useCallback(
    (lat: number, lng: number) => {
      if (routeMapTapMode === 'pan_only') {
        return;
      }
      if (routeMapTapMode === 'set_start') {
        const startWp = routeWaypoints[0];
        if (startWp) {
          handleUpdateWaypointPos(startWp.id, lat, lng);
          setRouteMapTapMode('pan_only');
          showToast('출발지 지정 완료 · 실수 방지를 위해 [이동만] 모드로 전환됨');
        }
        return;
      }
      if (routeMapTapMode === 'set_end') {
        const endWp = routeWaypoints[routeWaypoints.length - 1];
        if (endWp) {
          handleUpdateWaypointPos(endWp.id, lat, lng);
          setRouteMapTapMode('pan_only');
          showToast('목적지 지정 완료 · 실수 방지를 위해 [이동만] 모드로 전환됨');
        }
        return;
      }
      // 'add_waypoint': 목적지 바로 앞에 신규 경유지 삽입
      const wpIndex = routeWaypoints.length - 1;
      const resolved = resolveSmartWaypoint(
        lat,
        lng,
        portsList,
        `경유지 ${wpIndex}`,
        snapRadiusMeters,
      );
      const newWp: RouteWaypoint = {
        id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: resolved.name,
        lat: resolved.lat,
        lng: resolved.lng,
        type: 'waypoint',
        matchedPortId: resolved.matchedPortId,
        isCustomCoord: resolved.isCustomCoord,
        subCategory: resolved.subCategory,
        facilityLabel: resolved.facilityLabel,
        minDepthMeters: resolved.minDepthMeters,
        tidalSensitivity: resolved.tidalSensitivity,
        maxVesselTons: resolved.maxVesselTons,
        hazards: resolved.hazards,
      };
      commitRouteWaypoints((prev) => {
        const next = [...prev];
        next.splice(next.length - 1, 0, newWp);
        return next;
      });
      showToast(`경유지 추가됨: ${resolved.name} ([실행취소] 또는 마커 [✕]로 취소 가능)`);
    },
    [
      routeMapTapMode,
      routeWaypoints,
      handleUpdateWaypointPos,
      portsList,
      snapRadiusMeters,
      commitRouteWaypoints,
      showToast,
    ],
  );

  // 버튼으로 경유지 추가 (중복 유령 구간 생성 방지를 위해 오프셋 분산 적용)
  const handleAddWaypointButton = useCallback(() => {
    const newIdx = routeWaypoints.length - 1;
    const prevWp = routeWaypoints[newIdx - 1] || routeWaypoints[0];
    const endWp = routeWaypoints[routeWaypoints.length - 1];
    // 연속 추가 시 동일 항구 중복 스냅을 피하기 위해 경유지 순번에 따라 수직·수평 오프셋 분산
    const stepOffset = 0.007 * ((newIdx % 3) + 1);
    const dirSign = newIdx % 2 === 1 ? 1 : -1;
    const midLat = (prevWp.lat + endWp.lat) / 2 + stepOffset * dirSign;
    const midLng = (prevWp.lng + endWp.lng) / 2 + stepOffset;

    let resolved = resolveSmartWaypoint(
      midLat,
      midLng,
      portsList,
      `경유지 ${newIdx}`,
      snapRadiusMeters,
    );

    // 만약 직전 지점 또는 도착 지점과 동일한 항구로 스냅되었다면 순수 해상 중간 좌표로 보존하여 0.00 NM 유령 구간 방지
    if (
      resolved.matchedPortId &&
      (resolved.matchedPortId === prevWp.matchedPortId ||
        resolved.matchedPortId === endWp.matchedPortId)
    ) {
      resolved = {
        name: `해상 경유지 ${newIdx} (${midLat.toFixed(3)}°N, ${midLng.toFixed(3)}°E)`,
        lat: midLat,
        lng: midLng,
        matchedPortId: undefined,
        isCustomCoord: true,
      };
    }

    const newWp: RouteWaypoint = {
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: resolved.name,
      lat: resolved.lat,
      lng: resolved.lng,
      type: 'waypoint',
      matchedPortId: resolved.matchedPortId,
      isCustomCoord: resolved.isCustomCoord,
      subCategory: resolved.subCategory,
      facilityLabel: resolved.facilityLabel,
      minDepthMeters: resolved.minDepthMeters,
      tidalSensitivity: resolved.tidalSensitivity,
      maxVesselTons: resolved.maxVesselTons,
      hazards: resolved.hazards,
    };

    commitRouteWaypoints((prev) => {
      const next = [...prev];
      next.splice(next.length - 1, 0, newWp);
      return next;
    });
    handleFlyToPoint(resolved.lat, resolved.lng, 12);
    showToast(`경유지 ${newIdx} 추가됨: ${resolved.name}`);
  }, [routeWaypoints, portsList, snapRadiusMeters, commitRouteWaypoints, handleFlyToPoint, showToast]);

  const handleRemoveWaypoint = useCallback(
    (id: string) => {
      const target = routeWaypoints.find((wp) => wp.id === id);
      commitRouteWaypoints((prev) =>
        prev.filter((wp) => wp.id !== id || wp.type !== 'waypoint'),
      );
      if (target) {
        showToast(`경유지 취소됨: ${target.name} ([실행취소]로 복구 가능)`);
      }
    },
    [routeWaypoints, commitRouteWaypoints, showToast],
  );

  // 중간 경유지 일괄 비우기 (출발지와 목적지만 유지)
  const handleClearWaypoints = useCallback(() => {
    const intermediateCount = Math.max(0, routeWaypoints.length - 2);
    if (intermediateCount === 0) return;
    commitRouteWaypoints((prev) => prev.filter((wp) => wp.type !== 'waypoint'));
    showToast(`중간 경유지 ${intermediateCount}곳이 모두 취소되었습니다 ([실행취소]로 복구 가능)`);
  }, [routeWaypoints.length, commitRouteWaypoints, showToast]);

  // 다중 경유지 순서 위/아래 이동
  const handleMoveWaypoint = useCallback(
    (id: string, direction: 'up' | 'down') => {
      commitRouteWaypoints((prev) => {
        const idx = prev.findIndex((wp) => wp.id === id && wp.type === 'waypoint');
        if (idx < 1 || idx >= prev.length - 1) return prev;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 1 || targetIdx >= prev.length - 1) return prev;
        const next = [...prev];
        const [moved] = next.splice(idx, 1);
        next.splice(targetIdx, 0, moved);
        return next;
      });
      showToast(
        direction === 'up'
          ? '경유지 순서를 앞으로 이동했습니다.'
          : '경유지 순서를 뒤로 이동했습니다.',
      );
    },
    [commitRouteWaypoints, showToast],
  );

  // 직전 경로 변경 실행취소(Undo)
  const handleUndoRoute = useCallback(() => {
    setRouteUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previousWaypoints = stack[stack.length - 1];
      setRouteWaypoints(previousWaypoints);
      return stack.slice(0, -1);
    });
    showToast('↩ 직전 항로 상태로 되돌렸습니다.');
  }, [showToast]);

  const handleReverseRoute = useCallback(() => {
    commitRouteWaypoints((prev) => {
      if (prev.length < 2) return prev;
      const reversed = [...prev].reverse();
      return reversed.map((wp, idx) => ({
        ...wp,
        type: idx === 0 ? 'start' : idx === reversed.length - 1 ? 'end' : 'waypoint',
      }));
    });
    showToast('출발지와 목적지 경로가 반전되었습니다.');
  }, [commitRouteWaypoints, showToast]);

  const handleResetRoute = useCallback(() => {
    commitRouteWaypoints(() => INITIAL_WAYPOINTS);
    handleFlyToPoint(34.805, 128.445, 12);
    showToast('기본 항로(당동항 → 제승당)로 복원되었습니다.');
  }, [commitRouteWaypoints, handleFlyToPoint, showToast]);

  // 항구 선택 모달에서 항구·소규모 선착장 선택 시 반영
  const handleSelectPortForWaypoint = useCallback(
    (port: MarinePort) => {
      if (!portSelectorTarget) return;
      commitRouteWaypoints((prev) =>
        prev.map((wp) =>
          wp.id === portSelectorTarget.waypointId
            ? {
                ...wp,
                name: port.name,
                lat: port.lat,
                lng: port.lng,
                matchedPortId: port.id,
                isCustomCoord: false,
                subCategory: port.subCategory,
                facilityLabel: port.facilityLabel,
                minDepthMeters: port.minDepthMeters,
                tidalSensitivity: port.tidalSensitivity,
                maxVesselTons: port.maxVesselTons,
                hazards: port.hazards,
              }
            : wp,
        ),
      );
      handleFlyToPoint(port.lat, port.lng, 13);
      showToast(`${portSelectorTarget.label}: ${port.name} 설정 완료`);
    },
    [portSelectorTarget, commitRouteWaypoints, handleFlyToPoint, showToast],
  );

  // 항구 선택 모달에서 '내 선박 현재 GPS 위치' 선택 시 반영
  const handleSelectUserGpsForWaypoint = useCallback(() => {
    if (!portSelectorTarget) return;
    const lat = userLocation?.lat ?? 34.8125;
    const lng = userLocation?.lng ?? 128.5085;
    if (!userLocation) {
      setUserLocation({ lat, lng, accuracy: 85, isSimulated: true });
    }
    commitRouteWaypoints((prev) =>
      prev.map((wp) =>
        wp.id === portSelectorTarget.waypointId
          ? {
              ...wp,
              name: `내 선박 GPS (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)`,
              lat,
              lng,
              matchedPortId: undefined,
              isCustomCoord: true,
              subCategory: undefined,
              facilityLabel: undefined,
              minDepthMeters: undefined,
              tidalSensitivity: undefined,
              maxVesselTons: undefined,
              hazards: undefined,
            }
          : wp,
      ),
    );
    handleFlyToPoint(lat, lng, 13);
    showToast(`${portSelectorTarget.label}: 현재 선박 GPS 위치 적용`);
  }, [portSelectorTarget, userLocation, commitRouteWaypoints, handleFlyToPoint, showToast]);

  // [교차 기능 브릿지] 3.1 꼬미의 바다수첩 상세 시트에서 선택한 접안지를 목적지(end)로 설정하고 3.2 바닷길 콕콕으로 즉시 이동
  const handleNavigateToDockingPoint = useCallback(
    (feature: DockingFeature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const p = feature.properties;
      const matchedPort = portsList.find((port) => port.id === p.id);
      commitRouteWaypoints((prev) => {
        if (prev.length === 0) return prev;
        return prev.map((wp, idx) =>
          idx === prev.length - 1
            ? {
                ...wp,
                name: p.name,
                lat,
                lng,
                matchedPortId: p.id,
                isCustomCoord: false,
                subCategory: matchedPort?.subCategory ?? 'official_docking',
                facilityLabel: matchedPort?.facilityLabel ?? (p.purpose || '접안시설'),
                minDepthMeters: matchedPort?.minDepthMeters,
                tidalSensitivity:
                  matchedPort?.tidalSensitivity ??
                  (p.color === 'red' || p.color === 'amber' ? 'HIGH' : 'MEDIUM'),
                maxVesselTons: matchedPort?.maxVesselTons,
                hazards:
                  matchedPort?.hazards && matchedPort.hazards.length > 0
                    ? matchedPort.hazards
                    : p.hazard
                      ? [p.hazard]
                      : undefined,
              }
            : wp,
        );
      });
      updateWeatherCoordinates(lat, lng);
      setSelectedFeature(null);
      setIsPorpoiseAddMode(false);
      setIsReportPickMode(false);
      setIsColorFilterOpen(false);
      setLastTriggeredCardId('navigation');
      switchWorkspaceScreen('navigation', 'route');
      handleFlyToPoint(lat, lng, 13);
      showToast(`'${p.name}' 목적지 설정 · 바닷길 시간·기상 계산 모드 전환`);
    },
    [
      portsList,
      commitRouteWaypoints,
      updateWeatherCoordinates,
      switchWorkspaceScreen,
      handleFlyToPoint,
      showToast,
    ],
  );

  // [기상 -> 항로 역방향 브릿지] 해상기상 상태판정에서 조회 중인 해역을 항로 경유지로 즉시 추가
  const handleAddWeatherCoordAsWaypoint = useCallback(() => {
    const wpIndex = routeWaypoints.length - 1;
    const resolved = resolveSmartWaypoint(
      marineWeather.lat,
      marineWeather.lng,
      portsList,
      `기상확인 해역 ${wpIndex}`,
      snapRadiusMeters,
    );
    const newWp: RouteWaypoint = {
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: resolved.name,
      lat: resolved.lat,
      lng: resolved.lng,
      type: 'waypoint',
      matchedPortId: resolved.matchedPortId,
      isCustomCoord: resolved.isCustomCoord,
      subCategory: resolved.subCategory,
      facilityLabel: resolved.facilityLabel,
      minDepthMeters: resolved.minDepthMeters,
      tidalSensitivity: resolved.tidalSensitivity,
      maxVesselTons: resolved.maxVesselTons,
      hazards: resolved.hazards,
    };
    commitRouteWaypoints((prev) => {
      const next = [...prev];
      next.splice(next.length - 1, 0, newWp);
      return next;
    });
    replaceNavPanel('route');
    handleFlyToPoint(resolved.lat, resolved.lng, 12);
    showToast(`'${resolved.name}' 경유지 추가 및 시간계산 탭 전환`);
  }, [
    routeWaypoints.length,
    marineWeather.lat,
    marineWeather.lng,
    portsList,
    snapRadiusMeters,
    commitRouteWaypoints,
    replaceNavPanel,
    handleFlyToPoint,
    showToast,
  ]);

  const nearestWeatherAreaLabel = useMemo(
    () => describeNearestPortArea(marineWeather.lat, marineWeather.lng, portsList),
    [marineWeather.lat, marineWeather.lng, portsList],
  );

  // MapView 및 하위 컴포넌트에 전달되는 핸들러/좌표 객체 참조 안정화 (불필요한 Kakao CustomOverlay 재렌더링 방지)
  const handleSelectFeatureOnMap = useCallback(
    (feature: DockingFeature) => {
      setSelectedFeature(feature);
      const [lng, lat] = feature.geometry.coordinates;
      handleFlyToPoint(lat, lng, 14);
    },
    [handleFlyToPoint],
  );

  const handleSelectPorpoiseOnMap = useCallback((record: PorpoiseRecord) => {
    setSelectedPorpoise(record);
  }, []);

  const handleMapClickForPorpoise = useCallback((lat: number, lng: number) => {
    setPorpoiseModalCoords({ lat, lng });
    setSelectedPorpoise(null);
    setIsPorpoiseAddMode(false);
  }, []);

  const handleMapClickForReport = useCallback((lat: number, lng: number) => {
    setCustomReportCoords({ lat, lng });
    setReportTargetFeature(null);
    setIsReportPickMode(false);
    setIsReportModalOpen(true);
  }, []);

  const handleClearExternalRoadviewTarget = useCallback(() => {
    setExternalRoadviewTarget(null);
  }, []);

  const weatherCoordsMemo = useMemo(
    () => ({ lat: marineWeather.lat, lng: marineWeather.lng }),
    [marineWeather.lat, marineWeather.lng],
  );

  const handleCheckWeatherAtRoutePoint = useCallback(
    (lat: number, lng: number, name: string) => {
      updateWeatherCoordinates(lat, lng);
      replaceNavPanel('weather');
      handleFlyToPoint(lat, lng, 13);
      showToast(`'${name}' 해역 기상상태판정 탭으로 전환되었습니다.`);
    },
    [updateWeatherCoordinates, replaceNavPanel, handleFlyToPoint, showToast],
  );

  // 인트로 복귀 시 상단 이어하기 배너 요약 문구
  const activeWorkspaceSummary = useMemo(() => {
    const startWp = routeWaypoints[0]?.name ?? '출발지';
    const endWp = routeWaypoints[routeWaypoints.length - 1]?.name ?? '목적지';
    if (lastTriggeredCardId === 'navigation') {
      return `바닷길 콕콕 · ${startWp} → ${endWp} (${Math.round(routeCalculation.totalDurationMinutes)}분)`;
    }
    return isRedOnly
      ? `꼬미의 바다수첩 · 위험주의 ${filteredFeatures.length}개소 집중 표시 중`
      : `꼬미의 바다수첩 · ${filteredFeatures.length}/${totalDockingCount || 55}개소 표시 중`;
  }, [
    lastTriggeredCardId,
    routeWaypoints,
    routeCalculation.totalDurationMinutes,
    isRedOnly,
    filteredFeatures.length,
    totalDockingCount,
  ]);

  const reportLat = reportTargetFeature
    ? reportTargetFeature.geometry.coordinates[1]
    : (customReportCoords?.lat ?? userLocation?.lat ?? 34.8195);
  const reportLng = reportTargetFeature
    ? reportTargetFeature.geometry.coordinates[0]
    : (customReportCoords?.lng ?? userLocation?.lng ?? 128.552);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#061c24] text-white select-none">
      {/* 1. 초기 접속 인트로 허브 (HomeScreen): 새 접속 시 지도/SDK를 미리 로드하지 않고 즉시 표시하며,
          한 번 작업공간에 진입한 뒤 홈으로 복귀하면 오버레이로 열려 하단 작업공간 상태를 보존합니다. */}
      {isHomeScreen && (
        <HomeScreen
          lastTriggeredCardId={lastTriggeredCardId}
          onSelectFeatureCard={handleOpenWorkspaceFromHome}
          onSelectNotebookPreset={handleOpenNotebookPresetFromHome}
          onSelectNavigationPanel={handleOpenNavigationPanelFromHome}
          onOpenSettings={(section = 'thresholds') => {
            setSettingsInitialSection(section);
            setIsWeatherSettingsOpen(true);
          }}
          isCustomThresholds={marineWeather.isCustomThresholds}
          hasActiveWorkspace={hasEnteredWorkspace}
          activeWorkspaceSummary={activeWorkspaceSummary}
          onResumeWorkspace={() =>
            handleOpenWorkspaceFromHome(lastTriggeredCardId ?? 'notebook')
          }
          hazardCount={colorCounts.red || 9}
          totalDockingCount={totalDockingCount || 55}
          totalPortsCount={portsList.length || 136}
          isOnline={isOnline}
          isStandalone={isStandalone}
          onInstallClick={handleInstallClick}
        />
      )}

      {/* 2. 메인 작업공간 (WorkspaceScreen): 첫 기능 카드 선택 또는 직접 URL(?screen=...) 진입 시 마운트 후 유지 */}
      {(hasEnteredWorkspace || !isHomeScreen) && (
        <div
          aria-hidden={isHomeScreen}
          inert={isHomeScreen ? true : undefined}
          className={`relative h-dvh w-full ${
            isHomeScreen
              ? 'pointer-events-none invisible [content-visibility:hidden]'
              : ''
          }`}
        >
          {/* 상단 고정 2단 슬림 HUD 헤더 (페이지 전용 타이틀 + 원터치 교차 전환 스위치) */}
          <header
            className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex flex-col gap-1 px-2 py-1 sm:gap-1.5 sm:p-3"
            style={{ paddingTop: 'calc(var(--safe-top) + 0.25rem)' }}
          >
            {/* Row 1: 홈 복귀 + 현재 페이지 전용 정체성 타이틀(국립공원공단 배지) + 상대 페이지 원터치 스위치 + 상태 유틸 */}
            <div className="knps-hud-surface pointer-events-auto relative mx-auto flex w-full max-w-3xl items-center justify-between gap-1.5 overflow-hidden rounded-2xl border-2 border-emerald-500/45 bg-[#061c24]/95 px-2 py-1 shadow-2xl backdrop-blur-md sm:gap-2 sm:px-3 sm:py-2">
              <div
                aria-hidden="true"
                className="knps-tricolor-bar pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-95"
              />
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={handleReturnToHome}
                  aria-label="인트로 홈 화면으로 돌아가기"
                  title="홈 화면으로 이동"
                  className="flex h-8 shrink-0 items-center gap-0.5 rounded-xl border border-emerald-500/45 bg-[#0a2733]/95 px-2 text-xs font-black text-emerald-300 shadow transition hover:border-emerald-400 active:scale-95 focus-visible:outline-2 focus-visible:outline-emerald-400 sm:h-9 sm:px-2.5"
                >
                  <ChevronLeft className="h-4 w-4 stroke-[2.6]" aria-hidden="true" />
                  <span>홈</span>
                </button>
                <img
                  src={`${import.meta.env.BASE_URL}images/brand/${
                    activeMainTab === 'notebook'
                      ? 'icon_notebook_map_alpha.png'
                      : 'icon_navigation_clock_alpha.png'
                  }`}
                  alt=""
                  aria-hidden="true"
                  className="h-8 w-9 shrink-0 rounded-xl bg-white/95 object-contain p-0.5 shadow sm:h-9 sm:w-10"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <h1
                      ref={workspaceHeadingRef}
                      tabIndex={-1}
                      className="truncate text-xs leading-none font-black tracking-tight text-white outline-none sm:text-base"
                    >
                      {activeMainTab === 'notebook' ? '꼬미의 바다수첩' : '바닷길 콕콕'}
                    </h1>
                    <span className="hidden shrink-0 items-center gap-1 rounded-md border border-emerald-400/50 bg-emerald-950/90 px-1.5 py-0.5 text-[10px] font-black text-emerald-200 sm:inline-flex">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      국립공원 · {APP_VERSION_DISPLAY}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] font-bold tabular-nums text-emerald-100/90 sm:text-[11px]">
                    {activeMainTab === 'notebook'
                      ? isRedOnly && selectedRegion === 'all' && !dockingSearchQuery
                        ? `위험주의 ${filteredFeatures.length}개소 집중 표시`
                        : `${
                            selectedRegion === 'tongyeong'
                              ? '통영권 '
                              : selectedRegion === 'geoje'
                                ? '거제권 '
                                : ''
                          }${filteredFeatures.length}/${totalDockingCount}개 접안지 표시`
                      : `실항로 ${routeCalculation.totalDistanceKm.toFixed(1)}km · 약 ${Math.round(routeCalculation.totalDurationMinutes)}분`}
                  </p>
                </div>
                <img
                  src={`${import.meta.env.BASE_URL}images/brand/${
                    activeMainTab === 'notebook'
                      ? 'kkomi_header_clipboard.png'
                      : 'kkomi_header_binoculars.png'
                  }`}
                  alt=""
                  aria-hidden="true"
                  className="hidden h-8 w-auto shrink-0 object-contain drop-shadow min-[380px]:block sm:h-9"
                />
              </div>

              <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                {/* 교차 작업공간 원터치 스위치 버튼 (기존 2행 대메뉴 바를 대체하여 지도 시야 44px 확보) */}
                <button
                  type="button"
                  onClick={() => {
                    const targetScreen =
                      activeMainTab === 'notebook' ? 'navigation' : 'notebook';
                    setLastTriggeredCardId(targetScreen);
                    setIsPorpoiseAddMode(false);
                    setIsReportPickMode(false);
                    setIsColorFilterOpen(false);
                    switchWorkspaceScreen(targetScreen, navSubTab);
                  }}
                  title={
                    activeMainTab === 'notebook'
                      ? '바닷길 콕콕(항로·기상)으로 전환'
                      : '꼬미의 바다수첩(접안지·레이어)으로 전환'
                  }
                  className={`flex h-8 shrink-0 items-center gap-1 rounded-xl border-2 px-2 text-[11px] font-black shadow-md transition active:scale-95 sm:h-9 sm:px-2.5 sm:text-xs ${
                    activeMainTab === 'notebook'
                      ? 'border-sky-400/90 bg-[#072a42]/95 text-sky-200 hover:bg-[#093554]'
                      : 'border-emerald-400/90 bg-[#063229]/95 text-emerald-200 hover:bg-[#084236]'
                  }`}
                >
                  <ArrowLeftRight className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                  <span>{activeMainTab === 'notebook' ? '바닷길 콕콕' : '바다수첩'}</span>
                </button>

                {!isStandalone && (
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="hidden h-8 items-center gap-1 rounded-xl border-2 border-amber-400 bg-amber-500 px-2 text-[11px] font-black text-slate-950 shadow-md transition active:scale-95 sm:flex sm:h-9 sm:px-2.5 sm:text-xs"
                    title="앱 설치"
                  >
                    <Download className="h-3.5 w-3.5 stroke-[2.8]" />
                    <span>앱 설치</span>
                  </button>
                )}

                <div
                  role="status"
                  title={isOnline ? '온라인 연결됨' : '오프라인 캐시 모드'}
                  className={`flex h-8 items-center gap-1 rounded-xl border px-1.5 text-xs font-extrabold sm:h-9 sm:px-2 ${
                    isOnline
                      ? 'border-emerald-500/50 bg-emerald-950/90 text-emerald-300'
                      : 'border-amber-400 bg-amber-950/95 text-amber-200'
                  }`}
                >
                  {isOnline ? (
                    <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  <span className="hidden md:inline">{isOnline ? '온라인' : '오프라인'}</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSettingsInitialSection('thresholds');
                    setIsWeatherSettingsOpen(true);
                  }}
                  aria-label="설정 및 이용 안내 열기"
                  title="기상 판정 기준 설정 및 이용 안내"
                  className="relative flex h-8 shrink-0 items-center gap-1 rounded-xl border border-emerald-500/45 bg-[#0a2733]/95 px-2 text-xs font-extrabold text-teal-200 transition hover:border-teal-400 active:scale-95 sm:h-9 sm:px-2.5"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-teal-300 sm:h-4 sm:w-4" aria-hidden="true" />
                  <span className="hidden md:inline">설정</span>
                  {marineWeather.isCustomThresholds && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-slate-950 bg-teal-400"
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleManualReload}
                  aria-label="데이터 새로고침"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/45 bg-[#0a2733]/95 text-emerald-300 active:scale-95 sm:h-9 sm:w-9"
                >
                  <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

        {/* 3.1 꼬미의 바다수첩 서브 컨트롤 바 (모바일 가로 잘림 제로 · '위험주의' 고정 + 선택형 다중 등급 확장) */}
        {activeMainTab === 'notebook' && (
          <div
            ref={colorFilterPopoverRef}
            className="pointer-events-auto relative mx-auto flex w-full max-w-3xl flex-col gap-1.5"
          >
            <div className="flex w-full items-center justify-between gap-1 overflow-x-auto scrollbar-none sm:gap-1.5">
              {/* 좌측 유틸리티 버튼 3종 */}
              <div className="flex min-w-0 items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsColorFilterOpen(false);
                    setIsLayerModalOpen(true);
                  }}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-xl border-2 border-emerald-500/80 bg-emerald-950/90 px-2 text-[11px] font-black text-emerald-300 shadow active:scale-95 sm:h-9 sm:px-3 sm:text-xs"
                >
                  <Layers className="hidden h-3.5 w-3.5 shrink-0 sm:inline" />
                  <span className="sm:hidden">레이어</span>
                  <span className="hidden sm:inline">공간 레이어</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsColorFilterOpen(false);
                    setReportTargetFeature(null);
                    setIsReportModalOpen(true);
                  }}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-xl border-2 border-amber-500/80 bg-amber-950/90 px-2 text-[11px] font-black text-amber-300 shadow active:scale-95 sm:h-9 sm:px-3 sm:text-xs"
                >
                  <Mail className="hidden h-3.5 w-3.5 shrink-0 sm:inline" />
                  <span className="sm:hidden">제보</span>
                  <span className="hidden sm:inline">현장 제보</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsColorFilterOpen(false);
                    const next = !isPorpoiseAddMode;
                    setIsPorpoiseAddMode(next);
                    setIsReportPickMode(false);
                    if (next) {
                      showToast('지도에서 상괭이를 목격한 위치를 탭하세요.');
                    }
                  }}
                  className={`flex h-8 shrink-0 items-center gap-1 rounded-xl border-2 px-2 text-[11px] font-black shadow active:scale-95 sm:h-9 sm:px-3 sm:text-xs ${
                    isPorpoiseAddMode
                      ? 'border-teal-300 bg-teal-400 text-slate-950 animate-pulse'
                      : 'border-teal-500/80 bg-teal-950/90 text-teal-300'
                  }`}
                >
                  <img
                    src={`${import.meta.env.BASE_URL}images/brand/icon_porpoise.png`}
                    alt=""
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 rounded bg-white/90 object-contain p-0.5"
                  />
                  <span className="sm:hidden">
                    {isPorpoiseAddMode ? '탭대기' : '상괭이'}
                  </span>
                  <span className="hidden sm:inline">
                    {isPorpoiseAddMode ? '위치 탭 대기중' : '상괭이 관찰'}
                  </span>
                </button>
              </div>

              {/* 우측: '위험주의' 고정 경보 칩 + 필요한 사용자만 여는 '[+ 등급 선택 ▾]' 버튼 */}
              <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={handleHazardPrimaryChipClick}
                  title="위험·암초 주의 접안지 최우선 표시 (탭하면 위험주의 단독 모드로 즉시 전환)"
                  className={`flex h-8 shrink-0 items-center gap-1 rounded-xl border-2 px-2 text-[11px] font-black tabular-nums shadow-lg transition active:scale-95 sm:h-9 sm:gap-1.5 sm:px-3 sm:text-xs ${
                    selectedColors.includes('red')
                      ? 'border-red-400 bg-red-950/95 text-red-100 shadow-[0_0_14px_rgba(239,68,68,0.45)]'
                      : 'border-red-500/50 bg-[#061c24]/95 text-red-300/85 hover:border-red-400'
                  }`}
                >
                  <span className="relative flex h-2 w-2 shrink-0 sm:h-2.5 sm:w-2.5">
                    {selectedColors.includes('red') && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    )}
                    <span
                      className="relative inline-flex h-2 w-2 rounded-full border border-white/90 sm:h-2.5 sm:w-2.5"
                      style={{ backgroundColor: MARKER_COLOR_MAP.red.hex }}
                    />
                  </span>
                  <span>{MARKER_COLOR_MAP.red.shortLabel}</span>
                  <span className="rounded bg-red-500/30 px-1 py-0.2 text-[10px] font-black text-red-200">
                    {colorCounts.red}
                  </span>
                </button>

                <button
                  type="button"
                  aria-expanded={isColorFilterOpen}
                  aria-controls="docking-color-filter-popover"
                  onClick={() => setIsColorFilterOpen((open) => !open)}
                  className={`flex h-8 shrink-0 items-center gap-1 rounded-xl border-2 px-2 text-[11px] font-black tabular-nums shadow transition active:scale-95 sm:h-9 sm:px-3 sm:text-xs ${
                    isColorFilterOpen
                      ? 'border-emerald-300 bg-emerald-400 text-slate-950'
                      : isAllColorsSelected || selectedRegion !== 'all' || dockingSearchQuery
                        ? 'border-emerald-400/90 bg-emerald-950/95 text-emerald-200'
                        : extraSelectedCount > 0
                          ? 'border-amber-400/90 bg-amber-950/95 text-amber-200'
                          : 'border-emerald-500/45 bg-[#061c24]/95 text-slate-200 hover:border-emerald-400'
                  }`}
                >
                  <SlidersHorizontal className="hidden h-3.5 w-3.5 shrink-0 sm:inline" />
                  <span className="sm:hidden">
                    {isAllColorsSelected
                      ? `전체(${filteredFeatures.length})`
                      : extraSelectedCount > 0
                        ? `+${extraSelectedCount}등급`
                        : '+등급'}
                  </span>
                  <span className="hidden sm:inline">
                    {isAllColorsSelected
                      ? `전체 (${filteredFeatures.length})`
                      : extraSelectedCount > 0
                        ? `+${extraSelectedCount}등급·권역`
                        : '+등급·권역'}
                  </span>
                  <ChevronDown
                    className={`h-3 w-3 shrink-0 transition-transform sm:h-3.5 sm:w-3.5 ${
                      isColorFilterOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* 온디맨드 다중 등급 + 권역·검색 통합 팝오버 (필요한 사용자만 열어서 조석주의·안전접안·전용부두·비상거점·권역 선택) */}
            {isColorFilterOpen && (
              <section
                id="docking-color-filter-popover"
                aria-label="접안지 등급 및 권역 표시 설정"
                className="knps-modal-surface w-full rounded-2xl border-2 border-emerald-400/70 bg-[#061c24]/98 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 pb-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                    <span className="text-xs font-black text-white sm:text-sm">
                      접안지 등급 · 권역 필터
                    </span>
                    <span className="rounded-md border border-sky-400/40 bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-300">
                      복수 선택 가능 · {filteredFeatures.length}곳 표시 중
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRegion('all');
                        setDockingSearchQuery('');
                        handleResetToHazardOnly();
                      }}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-black transition active:scale-95 ${
                        isRedOnly && selectedRegion === 'all' && !dockingSearchQuery
                          ? 'border-red-400 bg-red-500/25 text-red-200'
                          : 'border-slate-600 bg-slate-800/90 text-slate-200 hover:border-red-400'
                      }`}
                    >
                      위험주의만 (기본)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRegion('all');
                        setDockingSearchQuery('');
                        handleSelectAllColors();
                      }}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-black transition active:scale-95 ${
                        isAllColorsSelected && selectedRegion === 'all' && !dockingSearchQuery
                          ? 'border-sky-300 bg-sky-400 text-slate-950'
                          : 'border-slate-600 bg-slate-800/90 text-slate-200 hover:border-sky-400'
                      }`}
                    >
                      전체 {totalDockingCount}곳 보기
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsColorFilterOpen(false)}
                      aria-label="등급 선택 창 닫기"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* 권역 퀵 필터 + 접안지 빠른 검색 */}
                <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div
                    role="group"
                    aria-label="해역 권역 필터"
                    className="grid grid-cols-3 gap-1"
                  >
                    {(
                      [
                        { id: 'all', label: `전체 (${regionCounts.all || 55})` },
                        { id: 'tongyeong', label: `통영권 (${regionCounts.tongyeong || 29})` },
                        { id: 'geoje', label: `거제권 (${regionCounts.geoje || 26})` },
                      ] as const
                    ).map((reg) => {
                      const active = selectedRegion === reg.id;
                      return (
                        <button
                          key={reg.id}
                          type="button"
                          onClick={() => {
                            setSelectedRegion(reg.id);
                            if (reg.id === 'tongyeong') {
                              handleFlyToPoint(34.812, 128.435, 11);
                            } else if (reg.id === 'geoje') {
                              handleFlyToPoint(34.835, 128.625, 11);
                            } else {
                              handleResetBounds();
                            }
                          }}
                          className={`rounded-xl border px-2 py-1 text-[11px] font-black transition active:scale-95 ${
                            active
                              ? 'border-sky-300 bg-sky-500/30 text-sky-200'
                              : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          {reg.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative flex-1 sm:max-w-[230px]">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={dockingSearchQuery}
                      onChange={(e) => setDockingSearchQuery(e.target.value)}
                      placeholder="접안지명·코드·위험요소 검색"
                      aria-label="접안지명 또는 코드 검색"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/90 py-1 pr-2.5 pl-8 text-xs font-bold text-white placeholder-slate-400 focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 1순위: 위험주의 (기본 노출 등급) */}
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={() => handleToggleColor('red')}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-left transition active:scale-[0.99] ${
                      selectedColors.includes('red')
                        ? 'border-red-400 bg-red-950/75 text-white shadow-md'
                        : 'border-slate-700 bg-slate-900/70 text-slate-300 opacity-75 hover:border-red-500/60'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                          selectedColors.includes('red')
                            ? 'border-red-300 bg-red-500 text-white'
                            : 'border-slate-500 bg-slate-900 text-transparent'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full border border-white"
                            style={{ backgroundColor: MARKER_COLOR_MAP.red.hex }}
                          />
                          <span className="text-xs font-black text-red-200 sm:text-sm">
                            {MARKER_COLOR_MAP.red.label} ({MARKER_COLOR_MAP.red.shortLabel})
                          </span>
                          <span className="rounded bg-red-500/30 px-1.5 py-0.5 text-[10px] font-black text-red-200">
                            기본 우선 표시
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] font-bold text-slate-300">
                          {MARKER_COLOR_MAP.red.description}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-black text-red-200 sm:text-sm">
                      {colorCounts.red}곳
                    </span>
                  </button>
                </div>

                {/* 2순위: 필요한 사용자만 선택하는 4개 부가 등급 (2x2 그리드) */}
                <p className="mt-2.5 mb-1.5 text-[11px] font-extrabold text-slate-300">
                  추가 표시할 접안지 등급 선택 (필요한 항목만 클릭하여 함께 표시)
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {SECONDARY_MARKER_COLORS.map((colorKey) => {
                    const meta = MARKER_COLOR_MAP[colorKey];
                    const count = colorCounts[colorKey];
                    const isChecked = selectedColors.includes(colorKey);

                    return (
                      <button
                        key={colorKey}
                        type="button"
                        onClick={() => handleToggleColor(colorKey)}
                        className={`flex items-start justify-between gap-2 rounded-xl border-2 p-2.5 text-left transition active:scale-[0.98] ${
                          isChecked
                            ? `${meta.borderClass} bg-slate-800/95 text-white shadow-md`
                            : 'border-slate-700/90 bg-slate-900/75 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <span
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              isChecked
                                ? 'border-white bg-sky-400 text-slate-950'
                                : 'border-slate-500 bg-slate-950 text-transparent'
                            }`}
                          >
                            <Check className="h-3 w-3 stroke-[3]" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/80"
                                style={{ backgroundColor: meta.hex }}
                              />
                              <span className="truncate text-xs font-black text-white">
                                {meta.shortLabel}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-[10px] font-bold text-slate-300">
                              {meta.description}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] font-black text-sky-300">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2.5 flex items-center justify-between border-t border-slate-800 pt-2">
                  <span className="text-[11px] font-bold text-slate-300">
                    선택된 등급:{' '}
                    <strong className="font-black text-sky-300">
                      {selectedColors.map((c) => MARKER_COLOR_MAP[c].shortLabel).join(' · ')}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsColorFilterOpen(false)}
                    className="rounded-xl border border-sky-300 bg-sky-400 px-3 py-1 text-xs font-black text-slate-950 shadow active:scale-95"
                  >
                    확인 · 닫기
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {/* 3.2 바닷길 콕콕 서브 탭 (시간계산 vs 기상상태판정 · 실시간 요약 포함) */}
        {activeMainTab === 'navigation' && (
          <div className="pointer-events-auto mx-auto grid w-full max-w-3xl grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => replaceNavPanel('route')}
              className={`flex h-8 items-center justify-center gap-1 rounded-xl border-2 px-2 text-[11px] font-black tabular-nums transition active:scale-95 sm:h-9 sm:text-xs ${
                navSubTab === 'route'
                  ? 'border-sky-400 bg-[#072a42]/95 text-sky-200 shadow-lg'
                  : 'border-emerald-500/35 bg-[#061c24]/95 text-slate-300 hover:border-sky-400/60'
              }`}
            >
              <Navigation className="hidden h-3.5 w-3.5 shrink-0 sm:inline" aria-hidden="true" />
              <span>시간계산</span>
              <span className="rounded bg-sky-400/20 px-1.5 py-0.2 text-[10px] font-extrabold text-sky-200">
                {Math.round(routeCalculation.totalDurationMinutes)}분 · {routeCalculation.totalDistanceKm.toFixed(1)}km
              </span>
            </button>
            <button
              type="button"
              onClick={() => replaceNavPanel('weather')}
              className={`flex h-8 items-center justify-center gap-1 rounded-xl border-2 px-2 text-[11px] font-black tabular-nums transition active:scale-95 sm:h-9 sm:text-xs ${
                navSubTab === 'weather'
                  ? 'border-teal-400 bg-[#063229]/95 text-teal-200 shadow-lg'
                  : 'border-emerald-500/35 bg-[#061c24]/95 text-slate-300 hover:border-teal-400/60'
              }`}
            >
              <Waves className="hidden h-3.5 w-3.5 shrink-0 sm:inline" aria-hidden="true" />
              <span>기상상태판정</span>
              <span
                className={`rounded px-1.5 py-0.2 text-[10px] font-extrabold ${
                  marineWeather.current?.grade === 'bad'
                    ? 'bg-red-500/30 text-red-200'
                    : marineWeather.current?.grade === 'moderate'
                      ? 'bg-amber-500/30 text-amber-200'
                      : marineWeather.current?.grade === 'good'
                        ? 'bg-emerald-500/30 text-emerald-200'
                        : 'bg-slate-600/40 text-slate-300'
                }`}
              >
                {marineWeather.current?.grade === 'bad'
                  ? '출항보류'
                  : marineWeather.current?.grade === 'moderate'
                    ? '주의운항'
                    : marineWeather.current?.grade === 'good'
                      ? '정상운항'
                      : marineWeather.isLoading
                        ? '조회중…'
                        : '미확인(?)'}
              </span>
            </button>
          </div>
        )}

        {/* 상태 토스트 알림 */}
        {(gpsStatusMsg || isReportPickMode) && (
          <div
            role="status"
            className="pointer-events-auto mx-auto flex items-center gap-1.5 rounded-xl border border-emerald-400/80 bg-[#061c24]/98 px-3 py-1 text-[11px] font-extrabold text-emerald-200 shadow-xl sm:text-xs"
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>
              {isReportPickMode
                ? '지도에서 제보할 위치를 직접 탭하세요.'
                : gpsStatusMsg}
            </span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="pointer-events-auto mx-auto w-full max-w-xl rounded-2xl border-2 border-red-500 bg-red-950/95 p-3 text-white shadow-2xl"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-300" />
              <p className="text-xs font-black text-red-200">데이터 로드 오류: {errorMsg}</p>
            </div>
          </div>
        )}
      </header>

      {/* 메인 100dvh 지도 */}
      <Suspense
        fallback={
          <div className="flex h-dvh w-full items-center justify-center bg-[#061c24] text-xs font-black text-emerald-300">
            해상 전자지도 엔진 준비 중...
          </div>
        }
      >
        <MapView
          activeMainTab={activeMainTab}
          navSubTab={navSubTab}
          features={filteredFeatures}
          selectedFeature={selectedFeature}
          onSelectFeature={handleSelectFeatureOnMap}
          layers={layers}
          geoJsonLayersData={geoJsonLayersData}
          layerLoadErrorIds={layerLoadErrorIds}
          onRetryGeoJsonLayers={retryFailedGeoJsonLayers}
          showPorpoiseLayer={showPorpoiseLayer}
          isPorpoiseAddMode={isPorpoiseAddMode}
          isReportPickMode={isReportPickMode}
          porpoiseRecords={porpoiseRecords}
          onSelectPorpoise={handleSelectPorpoiseOnMap}
          onMapClickForPorpoise={handleMapClickForPorpoise}
          onMapClickForReport={handleMapClickForReport}
          routeWaypoints={routeWaypoints}
          routeLegs={routeCalculation.legs}
          portsList={portsList}
          showPortMarkersOnMap={showPortMarkersOnMap}
          selectedLegIndex={
            selectedLegIndex !== null && selectedLegIndex < routeCalculation.legs.length
              ? selectedLegIndex
              : null
          }
          onSelectLeg={setSelectedLegIndex}
          showDirectionArrows={showDirectionArrows}
          fitRouteBoundsTrigger={fitRouteBoundsTrigger}
          onUpdateWaypointPos={handleUpdateWaypointPos}
          onRemoveWaypoint={handleRemoveWaypoint}
          onMapClickForRoute={handleMapClickForRoute}
          weatherCoords={weatherCoordsMemo}
          weatherGrade={marineWeather.current?.grade || 'unknown'}
          onUpdateWeatherCoords={marineWeather.updateCoordinates}
          userLocation={userLocation}
          onRequestGps={handleRequestGps}
          onSimulateFieldGps={handleSimulateFieldGps}
          flyTarget={flyTarget}
          onResetBounds={handleResetBounds}
          externalRoadviewTarget={externalRoadviewTarget}
          onClearExternalRoadviewTarget={handleClearExternalRoadviewTarget}
        />
      </Suspense>

      {/* 3.1 꼬미의 바다수첩: 하단 빠른 접안지 선택 바 (하단 Leaflet 출처 배지 위 16px 여유 확보) */}
      {activeMainTab === 'notebook' && isDockingLayerVisible && (
        <aside
          aria-label="접안 포인트 빠른 선택 목록"
          className="pointer-events-none fixed inset-x-2.5 bottom-4 z-[900] mx-auto max-w-2xl sm:inset-x-3"
          style={{ paddingBottom: 'var(--safe-bottom)' }}
        >
          <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {/* 맨 앞: 현재 필터 모드 안내 및 원터치 전환 카드 */}
            <button
              type="button"
              onClick={() => {
                if (isRedOnly) {
                  handleSelectAllColors();
                } else {
                  handleResetToHazardOnly();
                }
              }}
              className={`flex min-h-11 shrink-0 flex-col justify-center rounded-2xl border-2 px-3 py-1 text-left shadow-xl backdrop-blur-md transition active:scale-95 sm:min-h-12 sm:px-3.5 sm:py-1.5 ${
                isRedOnly
                  ? 'border-red-400/90 bg-red-950/95 text-red-100'
                  : 'border-sky-400/90 bg-sky-950/95 text-sky-100'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-300" />
                <span className="text-[11px] font-black text-white">
                  {isRedOnly
                    ? `위험주의 ${colorCounts.red}곳 집중 표시`
                    : `${selectedColors.length}개 등급 · ${filteredFeatures.length}곳 표시`}
                </span>
              </div>
              <span className="mt-0.5 text-[11px] font-extrabold text-amber-300">
                {isRedOnly
                  ? `전체 ${totalDockingCount}곳 모두 보기 ➔`
                  : '위험주의 9곳만 보기 ➔'}
              </span>
            </button>

            {filteredFeatures.map((feature) => {
              const meta = MARKER_COLOR_MAP[feature.properties.color] ?? MARKER_COLOR_MAP.blue;
              const isSelected = selectedFeature?.properties.id === feature.properties.id;
              const isHazardRed = feature.properties.color === 'red';
              return (
                <button
                  key={feature.properties.id}
                  type="button"
                  onClick={() => handleSelectFeatureOnMap(feature)}
                  className={`flex min-h-11 shrink-0 flex-col justify-center rounded-2xl border-2 px-3 py-1 text-left shadow-xl backdrop-blur-md transition active:scale-95 sm:min-h-12 sm:px-3.5 sm:py-1.5 ${
                    isSelected
                      ? 'border-emerald-300 bg-[#063229]/95'
                      : isHazardRed
                        ? 'border-red-500/80 bg-[#1a0a12]/95'
                        : 'border-emerald-500/45 bg-[#061c24]/95'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: meta.hex }}
                    />
                    <span className="font-mono text-[11px] font-black text-sky-300">
                      {feature.properties.id}
                    </span>
                    <span
                      className={`text-[11px] font-bold ${
                        isHazardRed ? 'text-red-300' : 'text-slate-300'
                      }`}
                    >
                      · {isHazardRed ? '⚠️ 위험주의' : meta.shortLabel}
                    </span>
                  </div>
                  <span className="mt-0.5 max-w-[175px] truncate text-xs font-extrabold text-white">
                    {feature.properties.name}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      )}

      {/* 3.2 바닷길 콕콕: 하단 전체폭 패널 (상단 HUD·우측 컨트롤·하단 Leaflet 출처와 충돌 제로) */}
      {activeMainTab === 'navigation' && (
        <aside
          className="pointer-events-none fixed inset-x-2.5 bottom-4 z-[900] mx-auto max-w-xl sm:inset-x-3"
          style={{ paddingBottom: 'var(--safe-bottom)' }}
        >
          <Suspense fallback={null}>
            {navSubTab === 'route' ? (
              <RouteTimeCalculator
                waypoints={routeWaypoints}
                speedKnots={speedKnots}
                calculation={routeCalculation}
                mapTapMode={routeMapTapMode}
                onChangeMapTapMode={setRouteMapTapMode}
                onOpenPortSelector={(waypointId, label) =>
                  setPortSelectorTarget({ waypointId, label })
                }
                onAddWaypoint={handleAddWaypointButton}
                onRemoveWaypoint={handleRemoveWaypoint}
                onClearWaypoints={handleClearWaypoints}
                onMoveWaypoint={handleMoveWaypoint}
                canUndoRoute={routeUndoStack.length > 0}
                onUndoRoute={handleUndoRoute}
                onReverseRoute={handleReverseRoute}
                onChangeSpeed={setSpeedKnots}
                onResetRoute={handleResetRoute}
                onFlyToWaypoint={(lat, lng) => handleFlyToPoint(lat, lng, 13)}
                onCheckWeatherAtPoint={handleCheckWeatherAtRoutePoint}
                showPortMarkersOnMap={showPortMarkersOnMap}
                onTogglePortMarkersOnMap={() => setShowPortMarkersOnMap((v) => !v)}
                totalPortsCount={portsList.length || 136}
                selectedLegIndex={
                  selectedLegIndex !== null && selectedLegIndex < routeCalculation.legs.length
                    ? selectedLegIndex
                    : null
                }
                onSelectLeg={setSelectedLegIndex}
                showDirectionArrows={showDirectionArrows}
                onToggleDirectionArrows={() => setShowDirectionArrows((v) => !v)}
                onFitRouteBounds={() => setFitRouteBoundsTrigger((n) => n + 1)}
              />
            ) : (
              <MarineWeatherPanel
                weather={marineWeather}
                thresholds={marineWeather.thresholds}
                waypoints={routeWaypoints}
                nearestAreaLabel={nearestWeatherAreaLabel}
                onSelectWaypointWeather={(lat, lng, name) => {
                  marineWeather.updateCoordinates(lat, lng);
                  handleFlyToPoint(lat, lng, 13);
                  showToast(`'${name}' 해역 기상 조회 완료`);
                }}
                onAddCurrentWeatherAsWaypoint={handleAddWeatherCoordAsWaypoint}
                onOpenSettings={() => {
                  setSettingsInitialSection('thresholds');
                  setIsWeatherSettingsOpen(true);
                }}
                onRefresh={marineWeather.refresh}
              />
            )}
          </Suspense>
        </aside>
      )}

      {/* 모달 1: 접안 상세 시트 (선택된 포인트가 있을 때만 지연 로드) */}
      {selectedFeature && (
        <Suspense fallback={null}>
          <DockingDetailSheet
            key={selectedFeature.properties.id}
            feature={selectedFeature}
            userLocation={userLocation}
            onClose={() => setSelectedFeature(null)}
            onFlyToPoint={(lat, lng) => handleFlyToPoint(lat, lng, 15)}
            onRequestNavigateRoute={handleNavigateToDockingPoint}
            onRequestRoadview={(feat) => {
              setExternalRoadviewTarget({
                lat: feat.geometry.coordinates[1],
                lng: feat.geometry.coordinates[0],
                title: feat.properties.name,
                pointId: feat.properties.id,
              });
            }}
            onRequestReport={(feat) => {
              setReportTargetFeature(feat);
              setCustomReportCoords(null);
              setIsReportModalOpen(true);
            }}
          />
        </Suspense>
      )}

      {/* 모달 2: 공간정보 레이어 관리 (열릴 때만 SHP/GeoJSON 파서 번들과 함께 지연 로드) */}
      {isLayerModalOpen && (
        <Suspense fallback={null}>
          <LayerControlModal
            key="layer-modal-open"
            isOpen={isLayerModalOpen}
            onClose={() => setIsLayerModalOpen(false)}
            layers={layers}
            geoJsonLayersData={geoJsonLayersData}
            onToggleLayer={toggleLayer}
            onSaveOperationalLayers={async (params) => {
              const res = await saveOperationalLayers(params);
              showToast(`[${res.releaseId}] 공간정보 레이어 운영 반영 완료!`);
              return res;
            }}
            onFlyToPoint={(lat, lng, zoom) => {
              handleFlyToPoint(lat, lng, zoom ?? 13);
              setIsLayerModalOpen(false);
            }}
            releaseId={releaseId}
            lastSavedAt={lastSavedAt}
            remoteSyncStatus={remoteSyncStatus}
            remoteCommitUrl={remoteCommitUrl}
            snapshots={snapshots}
            showPorpoiseLayer={showPorpoiseLayer}
            onTogglePorpoiseLayer={() => setShowPorpoiseLayer(!showPorpoiseLayer)}
            porpoiseCount={porpoiseRecords.length}
          />
        </Suspense>
      )}

      {/* 모달 3: 현장정보 이메일 제보 */}
      {isReportModalOpen && (
        <Suspense fallback={null}>
          <FieldReportModal
            key={`report-${reportTargetFeature?.properties.id ?? 'custom'}-${reportLat.toFixed(4)}-${reportLng.toFixed(4)}`}
            isOpen={isReportModalOpen}
            onClose={() => {
              setIsReportModalOpen(false);
              setReportTargetFeature(null);
            }}
            pointId={reportTargetFeature?.properties.id}
            pointName={reportTargetFeature?.properties.name}
            initialLat={reportLat}
            initialLng={reportLng}
            adminConfig={config.admin}
            onUpdateAdminEmail={updateAdminEmail}
            onPickLocationOnMap={() => {
              setIsReportModalOpen(false);
              setIsReportPickMode(true);
            }}
          />
        </Suspense>
      )}

      {/* 모달 4: 상괭이 관찰기록 */}
      {(porpoiseModalCoords || selectedPorpoise) && (
        <Suspense fallback={null}>
          <PorpoiseObservationModal
            key={
              selectedPorpoise?.id ??
              `new-${porpoiseModalCoords?.lat.toFixed(5)}-${porpoiseModalCoords?.lng.toFixed(5)}`
            }
            isOpen={Boolean(porpoiseModalCoords || selectedPorpoise)}
            onClose={() => {
              setPorpoiseModalCoords(null);
              setSelectedPorpoise(null);
            }}
            lat={
              selectedPorpoise
                ? selectedPorpoise.lat
                : (porpoiseModalCoords?.lat ?? 34.8195)
            }
            lng={
              selectedPorpoise
                ? selectedPorpoise.lng
                : (porpoiseModalCoords?.lng ?? 128.552)
            }
            existingRecord={selectedPorpoise}
            onSave={addPorpoise}
            onUpdate={updatePorpoise}
            onDelete={deletePorpoise}
          />
        </Suspense>
      )}

      {/* 모달 5: 항포구·접안지 검색 및 선택 모달 */}
      {portSelectorTarget && (
        <Suspense fallback={null}>
          <PortSelectModal
            key={portSelectorTarget.waypointId}
            isOpen={Boolean(portSelectorTarget)}
            onClose={() => setPortSelectorTarget(null)}
            targetLabel={portSelectorTarget.label}
            ports={portsList}
            userLocation={userLocation}
            onSelectPort={handleSelectPortForWaypoint}
            onSelectUserGps={handleSelectUserGpsForWaypoint}
          />
        </Suspense>
      )}
        </div>
      )}

      {/* 모달 6 (최상위 루트 호이스팅): 설정 및 이용 안내 (인트로 HomeScreen 및 WorkspaceScreen 양쪽에서 즉시 오픈 가능) */}
      {isWeatherSettingsOpen && (
        <Suspense fallback={null}>
          <WeatherThresholdSettings
            key={`weather-settings-${settingsInitialSection}-${marineWeather.thresholds.windKnot.good}-${marineWeather.thresholds.windKnot.moderate}-${marineWeather.thresholds.waveMeter.good}-${marineWeather.thresholds.waveMeter.moderate}`}
            isOpen={isWeatherSettingsOpen}
            onClose={() => setIsWeatherSettingsOpen(false)}
            thresholds={marineWeather.thresholds}
            defaultThresholds={marineWeather.defaultThresholds}
            isCustomThresholds={marineWeather.isCustomThresholds}
            initialSection={settingsInitialSection}
            onSave={(newThresholds) => {
              const ok = marineWeather.updateThresholds(newThresholds);
              if (ok) {
                showToast('기상 판정 기준이 기기에 저장되어 즉시 반영되었습니다.');
              }
              return ok;
            }}
            onReset={() => {
              marineWeather.resetThresholds();
              showToast('기상 판정 기준을 표준 기본값으로 복원했습니다.');
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
