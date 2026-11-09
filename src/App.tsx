import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Anchor,
  ChevronLeft,
  Download,
  Layers,
  Mail,
  Navigation,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { MapView } from './components/MapView';
import { HomeScreen } from './components/home/HomeScreen';
import { DockingDetailSheet } from './components/DockingDetailSheet';
import { LayerControlModal } from './components/notebook/LayerControlModal';
import { FieldReportModal } from './components/notebook/FieldReportModal';
import { PorpoiseObservationModal } from './components/notebook/PorpoiseObservationModal';
import {
  RouteTimeCalculator,
  type RouteMapTapMode,
} from './components/navigation/RouteTimeCalculator';
import { PortSelectModal } from './components/navigation/PortSelectModal';
import { MarineWeatherPanel } from './components/navigation/MarineWeatherPanel';
import { WeatherThresholdSettings } from './components/navigation/WeatherThresholdSettings';

import type {
  DockingFeature,
  DockingFeatureCollection,
  MarkerColor,
} from './types/docking';
import { ALL_MARKER_COLORS, MARKER_COLOR_MAP } from './types/docking';
import type { PorpoiseRecord } from './types/porpoise';
import type { MarinePort, MarineWaypointNode, PortsDataset } from './types/port';
import type { RouteWaypoint } from './types/route';

import { useAppConfig } from './hooks/useAppConfig';
import { useAppRoute } from './hooks/useAppRoute';
import { usePorpoiseStorage } from './hooks/usePorpoiseStorage';
import { useMarineWeather } from './hooks/useMarineWeather';
import {
  calculateRouteSummary,
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
    maxVesselTons: 15,
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
    maxVesselTons: 25,
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
  const { route, navigateToScreen, replaceNavPanel } = useAppRoute();
  const isHomeScreen = route.screen === 'home';
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState<boolean>(
    () => route.screen !== 'home',
  );
  const [lastTriggeredCardId, setLastTriggeredCardId] = useState<
    'notebook' | 'navigation' | null
  >(null);
  const workspaceHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const activeMainTab: 'notebook' | 'navigation' =
    route.screen === 'navigation' ? 'navigation' : 'notebook';
  const navSubTab: 'route' | 'weather' = route.panel;

  // 2. 정적 데이터 (접안 포인트 GeoJSON + 주요 항포구·소규모 선착장·변침점 JSON)
  const [collection, setCollection] = useState<DockingFeatureCollection | null>(null);
  const [portsList, setPortsList] = useState<MarinePort[]>([]);
  const [marineWaypoints, setMarineWaypoints] = useState<MarineWaypointNode[]>([]);
  const [snapRadiusMeters, setSnapRadiusMeters] = useState<number>(500);
  const [showPortMarkersOnMap, setShowPortMarkersOnMap] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  const [selectedColor, setSelectedColor] = useState<MarkerColor | 'all'>('all');
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
        workspaceHeadingRef.current?.focus();
      }, 60);
    },
    [navigateToScreen],
  );

  const handleReturnToHome = useCallback(() => {
    // Home 복귀 시 일시적인 픽커 모드 및 모달은 종료하고 주요 작업 상태(항로/필터/카메라)는 보존 (proposal 2.2 계약)
    setIsPorpoiseAddMode(false);
    setIsReportPickMode(false);
    setIsLayerModalOpen(false);
    setIsReportModalOpen(false);
    setIsWeatherSettingsOpen(false);
    setPortSelectorTarget(null);
    navigateToScreen('home', navSubTab);
  }, [navigateToScreen, navSubTab]);

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

  // 5. 바닷길 콕콕 - 시간계산기 상태
  const [speedKnots, setSpeedKnots] = useState<number>(
    config.route_defaults?.default_speed_knots || 15,
  );
  const [routeWaypoints, setRouteWaypoints] = useState<RouteWaypoint[]>(INITIAL_WAYPOINTS);
  const [routeMapTapMode, setRouteMapTapMode] = useState<RouteMapTapMode>('add_waypoint');

  // 6. 바닷길 콕콕 - 해상기상 상태판정 훅 (ECMWF IFS HRES + WAM HRES 전용, app_config.json 단일 원천 연결)
  const marineWeather = useMarineWeather(34.8195, 128.552, config.weather_defaults);

  const showToast = useCallback((msg: string, durationMs = 2800) => {
    setGpsStatusMsg(msg);
    window.setTimeout(() => setGpsStatusMsg(null), durationMs);
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

  // 접안 포인트 필터링
  const filteredFeatures = useMemo(() => {
    if (!collection) return [];
    if (selectedColor === 'all') return collection.features;
    return collection.features.filter((f) => f.properties.color === selectedColor);
  }, [collection, selectedColor]);

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
      setRouteWaypoints((prev) =>
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
    [portsList, snapRadiusMeters, showToast],
  );

  // [3.2.C] 지도 탭으로 포인트 지정 (경유지 추가 / 출발지 지정 / 목적지 지정)
  const handleMapClickForRoute = useCallback(
    (lat: number, lng: number) => {
      if (routeMapTapMode === 'set_start') {
        const startWp = routeWaypoints[0];
        if (startWp) handleUpdateWaypointPos(startWp.id, lat, lng);
        return;
      }
      if (routeMapTapMode === 'set_end') {
        const endWp = routeWaypoints[routeWaypoints.length - 1];
        if (endWp) handleUpdateWaypointPos(endWp.id, lat, lng);
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
        id: `wp_${Date.now()}`,
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
      setRouteWaypoints((prev) => {
        const next = [...prev];
        next.splice(next.length - 1, 0, newWp);
        return next;
      });
      showToast(`경유지 추가됨: ${resolved.name}`);
    },
    [routeMapTapMode, routeWaypoints, handleUpdateWaypointPos, portsList, snapRadiusMeters, showToast],
  );

  // 버튼으로 경유지 추가 (마지막 구간 중간 지점)
  const handleAddWaypointButton = useCallback(() => {
    const newIdx = routeWaypoints.length - 1;
    const prevWp = routeWaypoints[newIdx - 1] || routeWaypoints[0];
    const endWp = routeWaypoints[routeWaypoints.length - 1];
    const midLat = (prevWp.lat + endWp.lat) / 2 + 0.008;
    const midLng = (prevWp.lng + endWp.lng) / 2 + 0.008;

    const resolved = resolveSmartWaypoint(
      midLat,
      midLng,
      portsList,
      `경유지 ${newIdx}`,
      snapRadiusMeters,
    );
    const newWp: RouteWaypoint = {
      id: `wp_${Date.now()}`,
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

    setRouteWaypoints((prev) => {
      const next = [...prev];
      next.splice(next.length - 1, 0, newWp);
      return next;
    });
  }, [routeWaypoints, portsList, snapRadiusMeters]);

  const handleRemoveWaypoint = useCallback((id: string) => {
    setRouteWaypoints((prev) => prev.filter((wp) => wp.id !== id));
  }, []);

  const handleReverseRoute = useCallback(() => {
    setRouteWaypoints((prev) => {
      if (prev.length < 2) return prev;
      const reversed = [...prev].reverse();
      return reversed.map((wp, idx) => ({
        ...wp,
        type: idx === 0 ? 'start' : idx === reversed.length - 1 ? 'end' : 'waypoint',
      }));
    });
    showToast('출발지와 목적지 경로가 반전되었습니다.');
  }, [showToast]);

  const handleResetRoute = useCallback(() => {
    setRouteWaypoints(INITIAL_WAYPOINTS);
    showToast('기본 항로(당동항 → 제승당)로 복원되었습니다.');
  }, [showToast]);

  // 항구 선택 모달에서 항구·소규모 선착장 선택 시 반영
  const handleSelectPortForWaypoint = useCallback(
    (port: MarinePort) => {
      if (!portSelectorTarget) return;
      setRouteWaypoints((prev) =>
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
    [portSelectorTarget, handleFlyToPoint, showToast],
  );

  // 항구 선택 모달에서 '내 선박 현재 GPS 위치' 선택 시 반영
  const handleSelectUserGpsForWaypoint = useCallback(() => {
    if (!portSelectorTarget) return;
    const lat = userLocation?.lat ?? 34.8125;
    const lng = userLocation?.lng ?? 128.5085;
    if (!userLocation) {
      setUserLocation({ lat, lng, accuracy: 85, isSimulated: true });
    }
    setRouteWaypoints((prev) =>
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
  }, [portSelectorTarget, userLocation, handleFlyToPoint, showToast]);

  const reportLat = reportTargetFeature
    ? reportTargetFeature.geometry.coordinates[1]
    : (customReportCoords?.lat ?? userLocation?.lat ?? 34.8195);
  const reportLng = reportTargetFeature
    ? reportTargetFeature.geometry.coordinates[0]
    : (customReportCoords?.lng ?? userLocation?.lng ?? 128.552);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b192c] text-white select-none">
      {/* 1. 초기 접속 인트로 허브 (HomeScreen): 새 접속 시 지도/SDK를 미리 로드하지 않고 즉시 표시하며,
          한 번 작업공간에 진입한 뒤 홈으로 복귀하면 오버레이로 열려 하단 작업공간 상태를 보존합니다. */}
      {isHomeScreen && (
        <HomeScreen
          lastTriggeredCardId={lastTriggeredCardId}
          onSelectFeatureCard={handleOpenWorkspaceFromHome}
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
          className={`relative h-dvh w-full ${isHomeScreen ? 'pointer-events-none invisible' : ''}`}
        >
          {/* 상단 고정 HUD 헤더 */}
          <header
            className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex flex-col gap-1 p-2 sm:gap-1.5 sm:p-3"
            style={{ paddingTop: 'calc(var(--safe-top) + 0.375rem)' }}
          >
            <div className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center justify-between gap-2 rounded-2xl border-2 border-slate-600/90 bg-[#0b192c]/95 px-2.5 py-1.5 shadow-2xl backdrop-blur-md sm:px-3 sm:py-2">
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={handleReturnToHome}
                  aria-label="인트로 홈 화면으로 돌아가기"
                  title="홈 화면으로 이동"
                  className="flex h-8 shrink-0 items-center gap-0.5 rounded-xl border border-slate-600 bg-slate-800/90 px-2 text-xs font-black text-sky-300 shadow transition hover:border-sky-400 active:scale-95 focus-visible:outline-2 focus-visible:outline-sky-400 sm:h-9 sm:px-2.5"
                >
                  <ChevronLeft className="h-4 w-4 stroke-[2.6]" aria-hidden="true" />
                  <span>홈</span>
                </button>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 shadow sm:h-9 sm:w-9">
                  <Anchor className="h-4 w-4 stroke-[2.6] sm:h-5 sm:w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1
                      ref={workspaceHeadingRef}
                      tabIndex={-1}
                      className="truncate text-sm leading-none font-black tracking-tight text-white outline-none sm:text-base"
                    >
                      바다꼼꼬미
                    </h1>
                    <span className="shrink-0 rounded-md border border-sky-400/50 bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-black text-sky-300">
                      v1.1
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] font-bold tabular-nums text-slate-300 sm:text-[11px]">
                    {activeMainTab === 'notebook'
                      ? `3.1 꼬미의 바다수첩 (${filteredFeatures.length}개 접안·선착장)`
                      : `3.2 바닷길 콕콕 (항포구·선착장 ${portsList.length}개소)`}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                {!isStandalone && (
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="flex h-8 items-center gap-1 rounded-xl border-2 border-amber-400 bg-amber-500 px-2 text-[11px] font-black text-slate-950 shadow-md transition active:scale-95 sm:h-9 sm:px-2.5 sm:text-xs"
                    title="앱 설치"
                  >
                    <Download className="h-3.5 w-3.5 stroke-[2.8]" />
                    <span>앱 설치</span>
                  </button>
                )}

                <div
                  role="status"
                  className={`flex h-8 items-center gap-1 rounded-xl border px-2 text-xs font-extrabold sm:h-9 ${
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
                  <span className="hidden sm:inline">{isOnline ? '온라인' : '오프라인'}</span>
                </div>

                <button
                  type="button"
                  onClick={handleManualReload}
                  aria-label="데이터 새로고침"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-600 bg-slate-800/90 text-sky-300 active:scale-95 sm:h-9 sm:w-9"
                >
                  <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* 대메뉴 2종 탭 전환 바 (3.1 꼬미의 바다수첩 vs 3.2 바닷길 콕콕) */}
            <div className="pointer-events-auto mx-auto grid w-full max-w-3xl grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setLastTriggeredCardId('notebook');
                  navigateToScreen('notebook', navSubTab);
                  setIsPorpoiseAddMode(false);
                  setIsReportPickMode(false);
                }}
                className={`flex min-h-9 items-center justify-center gap-1.5 rounded-xl border-2 py-1 text-xs font-black shadow-lg transition active:scale-95 sm:min-h-10 sm:py-1.5 ${
                  activeMainTab === 'notebook'
                    ? 'border-sky-400 bg-sky-500 text-slate-950'
                    : 'border-slate-600 bg-[#0b192c]/95 text-slate-200'
                }`}
              >
                <Anchor className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>꼬미의 바다수첩</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLastTriggeredCardId('navigation');
                  navigateToScreen('navigation', navSubTab);
                  setIsPorpoiseAddMode(false);
                  setIsReportPickMode(false);
                }}
                className={`flex min-h-9 items-center justify-center gap-1.5 rounded-xl border-2 py-1 text-xs font-black shadow-lg transition active:scale-95 sm:min-h-10 sm:py-1.5 ${
                  activeMainTab === 'navigation'
                    ? 'border-sky-400 bg-sky-500 text-slate-950'
                    : 'border-slate-600 bg-[#0b192c]/95 text-slate-200'
                }`}
              >
                <Navigation className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>바닷길 콕콕</span>
              </button>
            </div>

        {/* 3.1 꼬미의 바다수첩 서브 컨트롤 바 */}
        {activeMainTab === 'notebook' && (
          <div className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            <button
              type="button"
              onClick={() => setIsLayerModalOpen(true)}
              className="flex min-h-8 shrink-0 items-center gap-1 rounded-xl border-2 border-emerald-500/80 bg-emerald-950/90 px-2.5 py-1 text-[11px] font-black text-emerald-300 shadow active:scale-95 sm:min-h-9 sm:px-3 sm:text-xs"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>공간 레이어</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setReportTargetFeature(null);
                setIsReportModalOpen(true);
              }}
              className="flex min-h-8 shrink-0 items-center gap-1 rounded-xl border-2 border-amber-500/80 bg-amber-950/90 px-2.5 py-1 text-[11px] font-black text-amber-300 shadow active:scale-95 sm:min-h-9 sm:px-3 sm:text-xs"
            >
              <Mail className="h-3.5 w-3.5" />
              <span>현장 제보</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !isPorpoiseAddMode;
                setIsPorpoiseAddMode(next);
                setIsReportPickMode(false);
                if (next) {
                  showToast('지도에서 상괭이를 목격한 위치를 탭하세요 🐬');
                }
              }}
              className={`flex min-h-8 shrink-0 items-center gap-1 rounded-xl border-2 px-2.5 py-1 text-[11px] font-black shadow active:scale-95 sm:min-h-9 sm:px-3 sm:text-xs ${
                isPorpoiseAddMode
                  ? 'border-teal-300 bg-teal-400 text-slate-950 animate-pulse'
                  : 'border-teal-500/80 bg-teal-950/90 text-teal-300'
              }`}
            >
              <span>🐬</span>
              <span>{isPorpoiseAddMode ? '위치 탭 대기중' : '상괭이 기록'}</span>
            </button>

            <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-700" />

            <button
              type="button"
              onClick={() => setSelectedColor('all')}
              className={`flex min-h-8 shrink-0 items-center gap-1 rounded-xl border-2 px-2.5 py-1 text-[11px] font-black tabular-nums shadow active:scale-95 sm:min-h-9 sm:px-3 sm:text-xs ${
                selectedColor === 'all'
                  ? 'border-white bg-sky-400 text-slate-950'
                  : 'border-slate-600 bg-[#0b192c]/95 text-slate-200'
              }`}
            >
              <span>전체 ({collection?.features.length ?? 0})</span>
            </button>

            {ALL_MARKER_COLORS.map((colorKey) => {
              const meta = MARKER_COLOR_MAP[colorKey];
              const count =
                collection?.features.filter((f) => f.properties.color === colorKey).length ?? 0;
              const isActive = selectedColor === colorKey;

              return (
                <button
                  key={colorKey}
                  type="button"
                  onClick={() => setSelectedColor(isActive ? 'all' : colorKey)}
                  className={`flex min-h-8 shrink-0 items-center gap-1 rounded-xl border-2 px-2.5 py-1 text-[11px] font-extrabold tabular-nums shadow active:scale-95 sm:min-h-9 sm:text-xs ${
                    isActive
                      ? 'border-white bg-slate-100 text-slate-950'
                      : 'border-slate-600/90 bg-[#0b192c]/95 text-slate-100'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-white/80"
                    style={{ backgroundColor: meta.hex }}
                  />
                  <span>{meta.shortLabel}</span>
                  <span className="opacity-75">({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 3.2 바닷길 콕콕 서브 탭 (시간계산 vs 기상상태판정) */}
        {activeMainTab === 'navigation' && (
          <div className="pointer-events-auto mx-auto grid w-full max-w-3xl grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => replaceNavPanel('route')}
              className={`flex min-h-8 items-center justify-center rounded-xl border-2 py-1 text-[11px] font-black transition active:scale-95 sm:min-h-9 sm:text-xs ${
                navSubTab === 'route'
                  ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                  : 'border-slate-700 bg-slate-900/90 text-slate-400'
              }`}
            >
              시간계산 (실항로·소규모 선착장)
            </button>
            <button
              type="button"
              onClick={() => replaceNavPanel('weather')}
              className={`flex min-h-8 items-center justify-center rounded-xl border-2 py-1 text-[11px] font-black transition active:scale-95 sm:min-h-9 sm:text-xs ${
                navSubTab === 'weather'
                  ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                  : 'border-slate-700 bg-slate-900/90 text-slate-400'
              }`}
            >
              기상상태판정 (풍속·파고 3단계)
            </button>
          </div>
        )}

        {/* 상태 토스트 알림 */}
        {(gpsStatusMsg || isReportPickMode) && (
          <div
            role="status"
            className="pointer-events-auto mx-auto flex items-center gap-1.5 rounded-xl border border-sky-400/80 bg-slate-950/95 px-3 py-1 text-[11px] font-extrabold text-sky-200 shadow-xl sm:text-xs"
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            <span>
              {isReportPickMode
                ? '지도에서 제보할 위치를 직접 탭하세요 📍'
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
      <MapView
        activeMainTab={activeMainTab}
        navSubTab={navSubTab}
        features={filteredFeatures}
        selectedFeature={selectedFeature}
        onSelectFeature={(feature) => {
          setSelectedFeature(feature);
          const [lng, lat] = feature.geometry.coordinates;
          handleFlyToPoint(lat, lng, 14);
        }}
        layers={layers}
        geoJsonLayersData={geoJsonLayersData}
        layerLoadErrorIds={layerLoadErrorIds}
        onRetryGeoJsonLayers={retryFailedGeoJsonLayers}
        showPorpoiseLayer={showPorpoiseLayer}
        isPorpoiseAddMode={isPorpoiseAddMode}
        isReportPickMode={isReportPickMode}
        porpoiseRecords={porpoiseRecords}
        onSelectPorpoise={(record) => {
          setSelectedPorpoise(record);
        }}
        onMapClickForPorpoise={(lat, lng) => {
          setPorpoiseModalCoords({ lat, lng });
          setSelectedPorpoise(null);
          setIsPorpoiseAddMode(false);
        }}
        onMapClickForReport={(lat, lng) => {
          setCustomReportCoords({ lat, lng });
          setReportTargetFeature(null);
          setIsReportPickMode(false);
          setIsReportModalOpen(true);
        }}
        routeWaypoints={routeWaypoints}
        routeLegs={routeCalculation.legs}
        portsList={portsList}
        showPortMarkersOnMap={showPortMarkersOnMap}
        onUpdateWaypointPos={handleUpdateWaypointPos}
        onMapClickForRoute={handleMapClickForRoute}
        weatherCoords={{ lat: marineWeather.lat, lng: marineWeather.lng }}
        weatherGrade={marineWeather.current?.grade || 'unknown'}
        onUpdateWeatherCoords={(lat, lng) => marineWeather.updateCoordinates(lat, lng)}
        userLocation={userLocation}
        onRequestGps={handleRequestGps}
        onSimulateFieldGps={handleSimulateFieldGps}
        flyTarget={flyTarget}
        onResetBounds={handleResetBounds}
      />

      {/* 3.1 꼬미의 바다수첩: 하단 빠른 접안지 선택 바 (하단 Leaflet 출처 배지 위 16px 여유 확보) */}
      {activeMainTab === 'notebook' && isDockingLayerVisible && (
        <aside
          aria-label="접안 포인트 빠른 선택 목록"
          className="pointer-events-none fixed inset-x-2.5 bottom-4 z-[900] mx-auto max-w-2xl sm:inset-x-3"
          style={{ paddingBottom: 'var(--safe-bottom)' }}
        >
          <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {filteredFeatures.map((feature) => {
              const meta = MARKER_COLOR_MAP[feature.properties.color] ?? MARKER_COLOR_MAP.blue;
              const isSelected = selectedFeature?.properties.id === feature.properties.id;
              return (
                <button
                  key={feature.properties.id}
                  type="button"
                  onClick={() => {
                    setSelectedFeature(feature);
                    const [lng, lat] = feature.geometry.coordinates;
                    handleFlyToPoint(lat, lng, 14);
                  }}
                  className={`flex min-h-11 shrink-0 flex-col justify-center rounded-2xl border-2 px-3 py-1 text-left shadow-xl backdrop-blur-md transition active:scale-95 sm:min-h-12 sm:px-3.5 sm:py-1.5 ${
                    isSelected
                      ? 'border-white bg-sky-950/95'
                      : 'border-slate-600/90 bg-[#0b192c]/95'
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
                    <span className="text-[11px] font-bold text-slate-300">
                      · {meta.shortLabel}
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
              onReverseRoute={handleReverseRoute}
              onChangeSpeed={setSpeedKnots}
              onResetRoute={handleResetRoute}
              onFlyToWaypoint={(lat, lng) => handleFlyToPoint(lat, lng, 13)}
              showPortMarkersOnMap={showPortMarkersOnMap}
              onTogglePortMarkersOnMap={() => setShowPortMarkersOnMap((v) => !v)}
              totalPortsCount={portsList.length}
            />
          ) : (
            <MarineWeatherPanel
              weather={marineWeather}
              onOpenSettings={() => setIsWeatherSettingsOpen(true)}
              onRefresh={marineWeather.refresh}
            />
          )}
        </aside>
      )}

      {/* 모달 1: 접안 상세 시트 */}
      <DockingDetailSheet
        key={selectedFeature?.properties.id ?? 'closed'}
        feature={selectedFeature}
        userLocation={userLocation}
        onClose={() => setSelectedFeature(null)}
        onFlyToPoint={(lat, lng) => handleFlyToPoint(lat, lng, 15)}
        onRequestReport={(feat) => {
          setReportTargetFeature(feat);
          setCustomReportCoords(null);
          setIsReportModalOpen(true);
        }}
      />

      {/* 모달 2: 공간정보 레이어 관리 (직원용 통합 워크스페이스 · [저장] 즉시 운영 반영) */}
      <LayerControlModal
        key={isLayerModalOpen ? 'layer-modal-open' : 'layer-modal-closed'}
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

      {/* 모달 3: 현장정보 이메일 제보 (key로 타겟/좌표 변경 시 폼 상태 초기화) */}
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

      {/* 모달 4: 상괭이 관찰기록 (key로 대상 변경 시 상태 즉시 동기화) */}
      {(porpoiseModalCoords || selectedPorpoise) && (
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
      )}

      {/* 모달 5: 항포구·접안지 검색 및 선택 모달 */}
      <PortSelectModal
        key={portSelectorTarget?.waypointId ?? 'port-closed'}
        isOpen={Boolean(portSelectorTarget)}
        onClose={() => setPortSelectorTarget(null)}
        targetLabel={portSelectorTarget?.label ?? '위치'}
        ports={portsList}
        userLocation={userLocation}
        onSelectPort={handleSelectPortForWaypoint}
        onSelectUserGps={handleSelectUserGpsForWaypoint}
      />

      {/* 모달 6: 해상기상 기준치 설정 */}
      <WeatherThresholdSettings
        key={`weather-settings-${isWeatherSettingsOpen ? 'open' : 'closed'}`}
        isOpen={isWeatherSettingsOpen}
        onClose={() => setIsWeatherSettingsOpen(false)}
        thresholds={marineWeather.thresholds}
        onSave={marineWeather.updateThresholds}
      />
        </div>
      )}
    </div>
  );
}

export default App;
