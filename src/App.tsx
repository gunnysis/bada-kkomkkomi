import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Anchor,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { MapView } from './components/MapView';
import { DockingDetailSheet } from './components/DockingDetailSheet';
import type {
  DockingFeature,
  DockingFeatureCollection,
  MarkerColor,
} from './types/docking';
import { ALL_MARKER_COLORS, MARKER_COLOR_MAP } from './types/docking';

interface UserGpsState {
  lat: number;
  lng: number;
  accuracy?: number;
  isSimulated?: boolean;
}

export function App() {
  const [collection, setCollection] = useState<DockingFeatureCollection | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedColor, setSelectedColor] = useState<MarkerColor | 'all'>('all');
  const [selectedFeature, setSelectedFeature] = useState<DockingFeature | null>(null);

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

  // 온라인/오프라인 해상 음영지역 감지
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

  const geoJsonUrl = `${import.meta.env.BASE_URL}data/docking_points.geojson`;

  // 정적 GeoJSON 로드 함수 (수동 새로고침 버튼용)
  const loadGeoJson = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch(geoJsonUrl, {
        headers: { Accept: 'application/geo+json, application/json' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: GeoJSON 파일을 찾을 수 없습니다.`);
      }
      const data = (await response.json()) as DockingFeatureCollection;
      if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('GeoJSON 형식이 올바르지 않습니다 (FeatureCollection 필요).');
      }
      setCollection(data);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : '접안 포인트 데이터를 불러오는 중 오류가 발생했습니다.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }, [geoJsonUrl]);

  // 초기 마운트 시 비동기 GeoJSON 로드 (Effect 내 동기 setState 지양)
  useEffect(() => {
    const controller = new AbortController();
    fetch(geoJsonUrl, {
      headers: { Accept: 'application/geo+json, application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: GeoJSON 파일을 찾을 수 없습니다.`);
        }
        const data = (await response.json()) as DockingFeatureCollection;
        if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
          throw new Error('GeoJSON 형식이 올바르지 않습니다 (FeatureCollection 필요).');
        }
        setCollection(data);
        setErrorMsg(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const message =
          err instanceof Error
            ? err.message
            : '접안 포인트 데이터를 불러오는 중 오류가 발생했습니다.';
        setErrorMsg(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [geoJsonUrl]);

  // 색상 필터링된 포인트 목록
  const filteredFeatures = useMemo(() => {
    if (!collection) return [];
    if (selectedColor === 'all') return collection.features;
    return collection.features.filter((f) => f.properties.color === selectedColor);
  }, [collection, selectedColor]);

  // 실제 브라우저 GPS 위치 요청
  const handleRequestGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatusMsg('이 기기에서 GPS 위치 기능을 지원하지 않습니다.');
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
        setFlyTarget({
          lat: nextLoc.lat,
          lng: nextLoc.lng,
          zoom: 13,
          nonce: Date.now(),
        });
        window.setTimeout(() => setGpsStatusMsg(null), 2800);
      },
      () => {
        // 실내 또는 GPS 권한 거부 시 통영·거제 해역 가상 선박 GPS로 안내
        const fallbackLoc: UserGpsState = {
          lat: 34.8125,
          lng: 128.5085,
          accuracy: 95,
          isSimulated: true,
        };
        setUserLocation(fallbackLoc);
        setGpsStatusMsg('GPS 권한/실내 환경 감지 → 통영·거제 해역 시뮬레이션 위치로 이동');
        setFlyTarget({
          lat: fallbackLoc.lat,
          lng: fallbackLoc.lng,
          zoom: 12,
          nonce: Date.now(),
        });
        window.setTimeout(() => setGpsStatusMsg(null), 3500);
      },
      {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 10000,
      },
    );
  }, []);

  // 통영·거제 한산수도 해역 현장 선박 GPS 시뮬레이션
  const handleSimulateFieldGps = useCallback(() => {
    const simLoc: UserGpsState = {
      lat: 34.8125,
      lng: 128.5085,
      accuracy: 85,
      isSimulated: true,
    };
    setUserLocation(simLoc);
    setGpsStatusMsg('통영·거제 한산수도 해상 조사선 위치(시뮬레이션) 활성화');
    setFlyTarget({
      lat: simLoc.lat,
      lng: simLoc.lng,
      zoom: 12,
      nonce: Date.now(),
    });
    window.setTimeout(() => setGpsStatusMsg(null), 3000);
  }, []);

  const handleResetBounds = useCallback(() => {
    setFlyTarget({
      lat: 34.8195,
      lng: 128.552,
      zoom: 11,
      nonce: Date.now(),
    });
  }, []);

  const handleFlyToPoint = useCallback((lat: number, lng: number) => {
    setFlyTarget({
      lat,
      lng,
      zoom: 15,
      nonce: Date.now(),
    });
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b192c] text-white select-none">
      {/* 상단 고정 HUD: 야외 직사광선 고대비 다크 네이비 패널 */}
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
                <h1 className="text-base leading-none font-black tracking-tight text-white sm:text-lg">
                  바다꼼꼬미
                </h1>
                <span className="rounded-md bg-sky-500/20 border border-sky-400/50 px-1.5 py-0.5 text-[11px] font-black text-sky-300">
                  Beta 0.1
                </span>
              </div>
              <p className="mt-1 text-xs font-bold text-slate-300">
                {collection?.metadata?.region ?? '통영·거제 해역'} · 접안 포인트 {filteredFeatures.length}개소
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 온/오프라인 상태 배지 */}
            <div
              role="status"
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-extrabold ${
                isOnline
                  ? 'border-emerald-500/50 bg-emerald-950/90 text-emerald-300'
                  : 'border-amber-400 bg-amber-950/95 text-amber-200'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="h-4 w-4 text-emerald-400" />
                  <span className="hidden sm:inline">온라인</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-amber-400" />
                  <span>오프라인 안전모드</span>
                </>
              )}
            </div>

            {/* 데이터 새로고침 버튼 (장갑 조작 최소 44x44px) */}
            <button
              type="button"
              onClick={() => void loadGeoJson()}
              aria-label="접안 포인트 데이터 새로고침"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-600 bg-slate-800/90 text-sky-300 active:scale-95"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 5가지 색상 커스텀 마커 필터 바 (가로 스크롤 지원) */}
        <nav
          aria-label="접안 위험도 및 마커 색상 필터"
          className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
        >
          <button
            type="button"
            onClick={() => setSelectedColor('all')}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 px-3.5 py-1.5 text-xs font-black shadow-lg transition active:scale-95 ${
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
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-xs font-extrabold shadow-lg transition active:scale-95 ${
                  isActive
                    ? 'border-white bg-slate-100 text-slate-950'
                    : 'border-slate-600/90 bg-[#0b192c]/95 text-slate-100'
                }`}
              >
                <span
                  className="h-3 w-3 rounded-full border border-white/80"
                  style={{ backgroundColor: meta.hex }}
                />
                <span>{meta.shortLabel}</span>
                <span className="opacity-75">({count})</span>
              </button>
            );
          })}
        </nav>

        {/* GPS 상태 토스트 알림 */}
        {gpsStatusMsg && (
          <div
            role="status"
            className="pointer-events-auto mx-auto flex items-center gap-2 rounded-xl border border-sky-400/70 bg-slate-950/95 px-4 py-2 text-xs font-extrabold text-sky-200 shadow-xl"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-sky-400" />
            <span>{gpsStatusMsg}</span>
          </div>
        )}

        {/* GeoJSON 문법 오류 시 비개발자 운영자용 친절한 복구 안내 */}
        {errorMsg && (
          <div
            role="alert"
            className="pointer-events-auto mx-auto w-full max-w-xl rounded-2xl border-2 border-red-500 bg-red-950/95 p-4 text-white shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 shrink-0 text-red-300" />
              <div className="space-y-1 text-xs">
                <p className="text-sm font-black text-red-200">
                  데이터 로드 오류: {errorMsg}
                </p>
                <p className="text-red-100/90">
                  운영자 점검 사항: <code className="font-mono text-amber-300">public/data/docking_points.geojson</code> 파일의 쉼표(,)나 큰따옴표(&quot;)가 빠지지 않았는지 확인해주세요.
                </p>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* 메인 100dvh 지도 */}
      <MapView
        features={filteredFeatures}
        selectedFeature={selectedFeature}
        onSelectFeature={(feature) => {
          setSelectedFeature(feature);
          const [lng, lat] = feature.geometry.coordinates;
          setFlyTarget({
            lat,
            lng,
            zoom: 14,
            nonce: Date.now(),
          });
        }}
        userLocation={userLocation}
        onRequestGps={handleRequestGps}
        onSimulateFieldGps={handleSimulateFieldGps}
        flyTarget={flyTarget}
        onResetBounds={handleResetBounds}
      />

      {/* 하단 좌측 한 손 빠른 접안지 선택 바 (배 흔들림 시 마커 직접 조준이 어려울 때 즉시 탭) */}
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
                  setFlyTarget({
                    lat,
                    lng,
                    zoom: 14,
                    nonce: Date.now(),
                  });
                }}
                className={`flex min-h-13 shrink-0 flex-col justify-center rounded-2xl border-2 px-3.5 py-2 text-left shadow-xl backdrop-blur-md transition active:scale-95 ${
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
                <span className="mt-0.5 max-w-[165px] truncate text-xs font-extrabold text-white">
                  {feature.properties.name}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* 접안 포인트 상세 바텀 시트 (key를 통해 포인트 전환 시 내부 상태 자동 초기화) */}
      <DockingDetailSheet
        key={selectedFeature?.properties.id ?? 'closed'}
        feature={selectedFeature}
        userLocation={userLocation}
        onClose={() => setSelectedFeature(null)}
        onFlyToPoint={handleFlyToPoint}
      />
    </div>
  );
}

export default App;
