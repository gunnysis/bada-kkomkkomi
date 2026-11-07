import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Anchor,
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
import { DockingDetailSheet } from './components/DockingDetailSheet';
import { LayerControlModal } from './components/notebook/LayerControlModal';
import { FieldReportModal } from './components/notebook/FieldReportModal';
import { PorpoiseObservationModal } from './components/notebook/PorpoiseObservationModal';
import { RouteTimeCalculator } from './components/navigation/RouteTimeCalculator';
import { MarineWeatherPanel } from './components/navigation/MarineWeatherPanel';
import { WeatherThresholdSettings } from './components/navigation/WeatherThresholdSettings';

import type { DockingFeature, DockingFeatureCollection, MarkerColor } from './types/docking';
import { ALL_MARKER_COLORS, MARKER_COLOR_MAP } from './types/docking';
import type { PorpoiseRecord } from './types/porpoise';
import type { RouteWaypoint } from './types/route';

import { useAppConfig } from './hooks/useAppConfig';
import { usePorpoiseStorage } from './hooks/usePorpoiseStorage';
import { useMarineWeather } from './hooks/useMarineWeather';
import { calculateRouteSummary } from './services/routeGeoService';

interface UserGpsState {
  lat: number;
  lng: number;
  accuracy?: number;
  isSimulated?: boolean;
}

export function App() {
  const { config, layers, toggleLayer } = useAppConfig();
  const { records: porpoiseRecords, addRecord: addPorpoise, updateRecord: updatePorpoise, deleteRecord: deletePorpoise } = usePorpoiseStorage();

  // 1. 네비게이션 탭 상태
  const [activeMainTab, setActiveMainTab] = useState<'notebook' | 'navigation'>('notebook');
  const [navSubTab, setNavSubTab] = useState<'route' | 'weather'>('route');

  // 2. 바다수첩 데이터 상태
  const [collection, setCollection] = useState<DockingFeatureCollection | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<MarkerColor | 'all'>('all');
  const [selectedFeature, setSelectedFeature] = useState<DockingFeature | null>(null);

  // 3. 모달 상태
  const [isLayerModalOpen, setIsLayerModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTargetFeature, setReportTargetFeature] = useState<DockingFeature | null>(null);
  const [showPorpoiseLayer, setShowPorpoiseLayer] = useState(true);
  const [isPorpoiseAddMode, setIsPorpoiseAddMode] = useState(false);
  const [porpoiseModalCoords, setPorpoiseModalCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedPorpoise, setSelectedPorpoise] = useState<PorpoiseRecord | null>(null);
  const [isWeatherSettingsOpen, setIsWeatherSettingsOpen] = useState(false);

  // 4. GPS & 네트워크 & PWA 설치
  const [userLocation, setUserLocation] = useState<UserGpsState | null>(null);
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom: number; nonce: number } | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  });

  // 5. 바닷길 콕콕 (시간계산기) 상태
  const [speedKnots, setSpeedKnots] = useState<number>(config.route_defaults?.default_speed_knots || 15);
  const [routeWaypoints, setRouteWaypoints] = useState<RouteWaypoint[]>([
    { id: 'wp_start', name: '통영 당동항', lat: 34.8378, lng: 128.4278, type: 'start' },
    { id: 'wp_end', name: '한산도 제승당', lat: 34.7735, lng: 128.4621, type: 'end' },
  ]);

  // 6. 바닷길 콕콕 (해상기상) 훅
  const marineWeather = useMarineWeather(34.8195, 128.552);

  // PWA 프롬프트 리스너
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setGpsStatusMsg('바다꼼꼬미 앱이 기기에 설치되었습니다!');
      window.setTimeout(() => setGpsStatusMsg(null), 3000);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

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

  // GeoJSON 데이터 로드
  const geoJsonUrl = `${import.meta.env.BASE_URL}data/docking_points.geojson`;
  const loadGeoJson = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch(geoJsonUrl, { headers: { Accept: 'application/geo+json, application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}: 파일을 찾을 수 없습니다.`);
      const data = (await response.json()) as DockingFeatureCollection;
      setCollection(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [geoJsonUrl]);

  useEffect(() => {
    void loadGeoJson();
  }, [loadGeoJson]);

  // 접안 포인트 필터
  const filteredFeatures = useMemo(() => {
    if (!collection) return [];
    if (selectedColor === 'all') return collection.features;
    return collection.features.filter((f) => f.properties.color === selectedColor);
  }, [collection, selectedColor]);

  // 항해 경로 연산 결과
  const routeCalculation = useMemo(() => {
    return calculateRouteSummary(routeWaypoints, speedKnots);
  }, [routeWaypoints, speedKnots]);

  // GPS 요청
  const handleRequestGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatusMsg('GPS 위치 기능을 지원하지 않습니다.');
      return;
    }
    setGpsStatusMsg('위성 GPS 신호 수신 중...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLoc: UserGpsState = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          isSimulated: false,
        };
        setUserLocation(nextLoc);
        setGpsStatusMsg('실제 GPS 위치 수신 완료');
        setFlyTarget({ lat: nextLoc.lat, lng: nextLoc.lng, zoom: 13, nonce: Date.now() });
        window.setTimeout(() => setGpsStatusMsg(null), 2500);
      },
      () => {
        const fallbackLoc: UserGpsState = { lat: 34.8125, lng: 128.5085, accuracy: 95, isSimulated: true };
        setUserLocation(fallbackLoc);
        setGpsStatusMsg('통영·거제 해역 가상 선박 위치로 이동');
        setFlyTarget({ lat: fallbackLoc.lat, lng: fallbackLoc.lng, zoom: 12, nonce: Date.now() });
        window.setTimeout(() => setGpsStatusMsg(null), 3000);
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
    );
  }, []);

  const handleSimulateFieldGps = useCallback(() => {
    const simLoc: UserGpsState = { lat: 34.8125, lng: 128.5085, accuracy: 85, isSimulated: true };
    setUserLocation(simLoc);
    setGpsStatusMsg('통영·거제 한산수도 조사선 GPS(시뮬레이션)');
    setFlyTarget({ lat: simLoc.lat, lng: simLoc.lng, zoom: 12, nonce: Date.now() });
    window.setTimeout(() => setGpsStatusMsg(null), 2500);
  }, []);

  const handleResetBounds = useCallback(() => {
    setFlyTarget({ lat: 34.8195, lng: 128.552, zoom: 11, nonce: Date.now() });
  }, []);

  const handleFlyToPoint = useCallback((lat: number, lng: number) => {
    setFlyTarget({ lat, lng, zoom: 15, nonce: Date.now() });
  }, []);

  // PWA 설치
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') setDeferredPrompt(null);
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        alert('아이폰/아이패드 설치 방법:\n하단 공유 버튼(네모+화살표)을 누르고 "홈 화면에 추가"를 선택하세요.');
      } else {
        alert('브라우저 우측 상단 점 3개 메뉴를 누르고 "앱 설치" 또는 "홈 화면에 추가"를 선택하세요.');
      }
    }
  };

  // 경로 웨이포인트 조작
  const handleUpdateWaypointPos = (id: string, lat: number, lng: number) => {
    setRouteWaypoints((prev) => prev.map((wp) => (wp.id === id ? { ...wp, lat, lng } : wp)));
  };

  const handleAddWaypoint = () => {
    const newIdx = routeWaypoints.length - 1;
    const prevWp = routeWaypoints[newIdx - 1] || routeWaypoints[0];
    const endWp = routeWaypoints[routeWaypoints.length - 1];
    const midLat = (prevWp.lat + endWp.lat) / 2 + 0.01;
    const midLng = (prevWp.lng + endWp.lng) / 2 + 0.01;

    const newWp: RouteWaypoint = {
      id: `wp_${Date.now()}`,
      name: `경유지 ${routeWaypoints.length - 1}`,
      lat: midLat,
      lng: midLng,
      type: 'waypoint',
    };

    const nextList = [...routeWaypoints];
    nextList.splice(nextList.length - 1, 0, newWp);
    setRouteWaypoints(nextList);
  };

  const handleRemoveWaypoint = (id: string) => {
    setRouteWaypoints((prev) => prev.filter((wp) => wp.id !== id));
  };

  const handleResetRoute = () => {
    setRouteWaypoints([
      { id: 'wp_start', name: '통영 당동항', lat: 34.8378, lng: 128.4278, type: 'start' },
      { id: 'wp_end', name: '한산도 제승당', lat: 34.7735, lng: 128.4621, type: 'end' },
    ]);
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b192c] text-white select-none">
      {/* 상단 고정 헤더 & 내비게이션 바 */}
      <header
        className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex flex-col gap-2 p-3"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}
      >
        <div className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center justify-between gap-2 rounded-2xl border-2 border-slate-600/90 bg-[#0b192c]/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 shadow">
              <Anchor className="h-6 w-6 stroke-[2.6]" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base leading-none font-black tracking-tight text-white sm:text-lg">바다꼼꼬미</h1>
                <span className="rounded-md bg-sky-500/20 border border-sky-400/50 px-1.5 py-0.5 text-[11px] font-black text-sky-300">
                  Beta 0.2
                </span>
              </div>
              <p className="mt-1 text-xs font-bold text-slate-300">
                {activeMainTab === 'notebook' ? '3.1 꼬미의 바다수첩' : '3.2 바닷길 콕콕'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isStandalone && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="flex items-center gap-1.5 rounded-xl border-2 border-amber-400 bg-amber-500 px-3 py-1.5 text-xs font-black text-slate-950 shadow-md transition active:scale-95 animate-pulse"
                title="앱 설치"
              >
                <Download className="h-4 w-4 stroke-[3]" />
                <span className="hidden sm:inline">앱 설치</span>
              </button>
            )}

            <div
              role="status"
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-extrabold ${
                isOnline ? 'border-emerald-500/50 bg-emerald-950/90 text-emerald-300' : 'border-amber-400 bg-amber-950/95 text-amber-200'
              }`}
            >
              {isOnline ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-amber-400" />}
              <span className="hidden sm:inline">{isOnline ? '온라인' : '오프라인'}</span>
            </div>

            <button
              type="button"
              onClick={() => void loadGeoJson()}
              aria-label="데이터 새로고침"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-600 bg-slate-800/90 text-sky-300 active:scale-95"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 대메뉴 2종 탭 전환 바 (3.1 꼬미의 바다수첩 vs 3.2 바닷길 콕콕) */}
        <div className="pointer-events-auto mx-auto grid w-full max-w-3xl grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveMainTab('notebook')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 py-2 text-xs font-black shadow-lg transition active:scale-95 ${
              activeMainTab === 'notebook'
                ? 'border-sky-400 bg-sky-500 text-slate-950'
                : 'border-slate-600 bg-[#0b192c]/95 text-slate-200'
            }`}
          >
            <Anchor className="h-4 w-4" />
            <span>꼬미의 바다수첩</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('navigation')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 py-2 text-xs font-black shadow-lg transition active:scale-95 ${
              activeMainTab === 'navigation'
                ? 'border-sky-400 bg-sky-500 text-slate-950'
                : 'border-slate-600 bg-[#0b192c]/95 text-slate-200'
            }`}
          >
            <Navigation className="h-4 w-4" />
            <span>바닷길 콕콕</span>
          </button>
        </div>

        {/* 3.1 꼬미의 바다수첩 서브 컨트롤 바 (공간레이어 / 현장제보 / 상괭이기록 / 마커색상필터) */}
        {activeMainTab === 'notebook' && (
          <div className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {/* 공간정보 레이어 모달 버튼 */}
            <button
              type="button"
              onClick={() => setIsLayerModalOpen(true)}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 border-emerald-500/80 bg-emerald-950/90 px-3.5 py-1.5 text-xs font-black text-emerald-300 shadow-lg active:scale-95"
            >
              <Layers className="h-4 w-4" />
              <span>공간 레이어</span>
            </button>

            {/* 현장정보 독립 제보 버튼 */}
            <button
              type="button"
              onClick={() => {
                setReportTargetFeature(null);
                setIsReportModalOpen(true);
              }}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 border-amber-500/80 bg-amber-950/90 px-3.5 py-1.5 text-xs font-black text-amber-300 shadow-lg active:scale-95"
            >
              <Mail className="h-4 w-4" />
              <span>현장 제보</span>
            </button>

            {/* 상괭이 관찰 기록 토글 버튼 */}
            <button
              type="button"
              onClick={() => {
                setIsPorpoiseAddMode(!isPorpoiseAddMode);
                if (!isPorpoiseAddMode) {
                  setGpsStatusMsg('지도에서 상괭이를 목격한 위치를 탭하세요 🐬');
                  window.setTimeout(() => setGpsStatusMsg(null), 3000);
                }
              }}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 px-3.5 py-1.5 text-xs font-black shadow-lg active:scale-95 ${
                isPorpoiseAddMode
                  ? 'border-teal-300 bg-teal-400 text-slate-950 animate-bounce'
                  : 'border-teal-500/80 bg-teal-950/90 text-teal-300'
              }`}
            >
              <span>🐬</span>
              <span>{isPorpoiseAddMode ? '지도 위치 탭 중...' : '상괭이 기록'}</span>
            </button>

            {/* 5색 접안 필터 */}
            <div className="h-6 w-px bg-slate-700 shrink-0 mx-1" />
            <button
              type="button"
              onClick={() => setSelectedColor('all')}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 px-3.5 py-1.5 text-xs font-black shadow-lg active:scale-95 ${
                selectedColor === 'all' ? 'border-white bg-sky-400 text-slate-950' : 'border-slate-600 bg-[#0b192c]/95 text-slate-200'
              }`}
            >
              <span>전체 ({collection?.features.length ?? 0})</span>
            </button>

            {ALL_MARKER_COLORS.map((colorKey) => {
              const meta = MARKER_COLOR_MAP[colorKey];
              const count = collection?.features.filter((f) => f.properties.color === colorKey).length ?? 0;
              const isActive = selectedColor === colorKey;

              return (
                <button
                  key={colorKey}
                  type="button"
                  onClick={() => setSelectedColor(isActive ? 'all' : colorKey)}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-xs font-extrabold shadow-lg active:scale-95 ${
                    isActive ? 'border-white bg-slate-100 text-slate-950' : 'border-slate-600/90 bg-[#0b192c]/95 text-slate-100'
                  }`}
                >
                  <span className="h-3 w-3 rounded-full border border-white/80" style={{ backgroundColor: meta.hex }} />
                  <span>{meta.shortLabel}</span>
                  <span className="opacity-75">({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 3.2 바닷길 콕콕 서브 탭 (시간계산 vs 기상상태판정) */}
        {activeMainTab === 'navigation' && (
          <div className="pointer-events-auto mx-auto grid w-full max-w-3xl grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setNavSubTab('route')}
              className={`flex min-h-10 items-center justify-center rounded-xl border py-1.5 text-xs font-black transition active:scale-95 ${
                navSubTab === 'route'
                  ? 'border-sky-400 bg-sky-500/20 text-sky-300'
                  : 'border-slate-700 bg-slate-900/90 text-slate-400'
              }`}
            >
              시간계산 (이동 소요시간)
            </button>
            <button
              type="button"
              onClick={() => setNavSubTab('weather')}
              className={`flex min-h-10 items-center justify-center rounded-xl border py-1.5 text-xs font-black transition active:scale-95 ${
                navSubTab === 'weather'
                  ? 'border-sky-400 bg-sky-500/20 text-sky-300'
                  : 'border-slate-700 bg-slate-900/90 text-slate-400'
              }`}
            >
              기상상태판정 (풍속·파고 3단계)
            </button>
          </div>
        )}

        {/* GPS 토스트 */}
        {gpsStatusMsg && (
          <div
            role="status"
            className="pointer-events-auto mx-auto flex items-center gap-2 rounded-xl border border-sky-400/70 bg-slate-950/95 px-4 py-2 text-xs font-extrabold text-sky-200 shadow-xl"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-sky-400" />
            <span>{gpsStatusMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="pointer-events-auto mx-auto w-full max-w-xl rounded-2xl border-2 border-red-500 bg-red-950/95 p-4 text-white shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 shrink-0 text-red-300" />
              <div className="space-y-1 text-xs">
                <p className="text-sm font-black text-red-200">데이터 로드 오류: {errorMsg}</p>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* 메인 지도 */}
      <MapView
        activeMainTab={activeMainTab}
        navSubTab={navSubTab}
        features={filteredFeatures}
        selectedFeature={selectedFeature}
        onSelectFeature={(feature) => {
          setSelectedFeature(feature);
          const [lng, lat] = feature.geometry.coordinates;
          setFlyTarget({ lat, lng, zoom: 14, nonce: Date.now() });
        }}
        layers={layers}
        showPorpoiseLayer={showPorpoiseLayer}
        isPorpoiseAddMode={isPorpoiseAddMode}
        porpoiseRecords={porpoiseRecords}
        onSelectPorpoise={(record) => {
          setSelectedPorpoise(record);
        }}
        onMapClickForPorpoise={(lat, lng) => {
          setPorpoiseModalCoords({ lat, lng });
          setSelectedPorpoise(null);
          setIsPorpoiseAddMode(false);
        }}
        routeWaypoints={routeWaypoints}
        onUpdateWaypointPos={handleUpdateWaypointPos}
        weatherCoords={{ lat: marineWeather.lat, lng: marineWeather.lng }}
        weatherGrade={marineWeather.current?.grade || 'unknown'}
        onUpdateWeatherCoords={(lat, lng) => marineWeather.updateCoordinates(lat, lng)}
        userLocation={userLocation}
        onRequestGps={handleRequestGps}
        onSimulateFieldGps={handleSimulateFieldGps}
        flyTarget={flyTarget}
        onResetBounds={handleResetBounds}
      />

      {/* 3.1 꼬미의 바다수첩: 하단 빠른 접안지 선택 칩 */}
      {activeMainTab === 'notebook' && (
        <aside
          aria-label="접안 포인트 빠른 선택 목록"
          className="pointer-events-none fixed bottom-6 left-3.5 right-20 z-[900]"
          style={{ paddingBottom: 'var(--safe-bottom)' }}
        >
          <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1">
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
                    setFlyTarget({ lat, lng, zoom: 14, nonce: Date.now() });
                  }}
                  className={`flex min-h-13 shrink-0 flex-col justify-center rounded-2xl border-2 px-3.5 py-2 text-left shadow-xl backdrop-blur-md transition active:scale-95 ${
                    isSelected ? 'border-white bg-sky-950/95' : 'border-slate-600/90 bg-[#0b192c]/95'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.hex }} />
                    <span className="font-mono text-[11px] font-black text-sky-300">{feature.properties.id}</span>
                    <span className="text-[11px] font-bold text-slate-300">· {meta.shortLabel}</span>
                  </div>
                  <span className="mt-0.5 max-w-[165px] truncate text-xs font-extrabold text-white">
                    {feature.properties.name}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      )}

      {/* 3.2 바닷길 콕콕: 하단 플로팅 패널 (시간계산기 vs 해상기상) */}
      {activeMainTab === 'navigation' && (
        <aside
          className="pointer-events-none fixed bottom-6 left-3.5 right-20 z-[900]"
          style={{ paddingBottom: 'var(--safe-bottom)' }}
        >
          {navSubTab === 'route' ? (
            <RouteTimeCalculator
              waypoints={routeWaypoints}
              speedKnots={speedKnots}
              calculation={routeCalculation}
              onAddWaypoint={handleAddWaypoint}
              onRemoveWaypoint={handleRemoveWaypoint}
              onChangeSpeed={setSpeedKnots}
              onResetRoute={handleResetRoute}
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
        onFlyToPoint={handleFlyToPoint}
        onRequestReport={(feat) => {
          setReportTargetFeature(feat);
          setIsReportModalOpen(true);
        }}
      />

      {/* 모달 2: 공간정보 레이어 관리 */}
      <LayerControlModal
        isOpen={isLayerModalOpen}
        onClose={() => setIsLayerModalOpen(false)}
        layers={layers}
        onToggleLayer={toggleLayer}
        showPorpoiseLayer={showPorpoiseLayer}
        onTogglePorpoiseLayer={() => setShowPorpoiseLayer(!showPorpoiseLayer)}
        porpoiseCount={porpoiseRecords.length}
      />

      {/* 모달 3: 현장정보 이메일 제보 */}
      <FieldReportModal
        isOpen={isReportModalOpen}
        onClose={() => {
          setIsReportModalOpen(false);
          setReportTargetFeature(null);
        }}
        pointId={reportTargetFeature?.properties.id}
        pointName={reportTargetFeature?.properties.name}
        initialLat={reportTargetFeature ? reportTargetFeature.geometry.coordinates[1] : (userLocation?.lat || 34.8195)}
        initialLng={reportTargetFeature ? reportTargetFeature.geometry.coordinates[0] : (userLocation?.lng || 128.552)}
        adminConfig={config.admin}
      />

      {/* 모달 4: 상괭이 관찰기록 (신규/수정) */}
      {(porpoiseModalCoords || selectedPorpoise) && (
        <PorpoiseObservationModal
          isOpen={Boolean(porpoiseModalCoords || selectedPorpoise)}
          onClose={() => {
            setPorpoiseModalCoords(null);
            setSelectedPorpoise(null);
          }}
          lat={selectedPorpoise ? selectedPorpoise.lat : (porpoiseModalCoords?.lat || 34.8195)}
          lng={selectedPorpoise ? selectedPorpoise.lng : (porpoiseModalCoords?.lng || 128.552)}
          existingRecord={selectedPorpoise}
          onSave={addPorpoise}
          onUpdate={updatePorpoise}
          onDelete={deletePorpoise}
        />
      )}

      {/* 모달 5: 해상기상 기준치 설정 */}
      <WeatherThresholdSettings
        isOpen={isWeatherSettingsOpen}
        onClose={() => setIsWeatherSettingsOpen(false)}
        thresholds={marineWeather.thresholds}
        onSave={marineWeather.updateThresholds}
      />
    </div>
  );
}

export default App;
