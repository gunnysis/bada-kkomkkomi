import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Compass,
   Eye,
  LocateFixed,
  RotateCcw,
  RotateCw,
  Satellite,
  X,
} from 'lucide-react';
import type {
  KakaoMapsNamespace,
  KakaoRoadview,
  RoadviewTargetLocation,
} from '../../types/kakao';

export interface Roadview3DModalProps {
  kakaoMaps: KakaoMapsNamespace | null;
  target: RoadviewTargetLocation | null;
  onClose: () => void;
  onFallbackToSatelliteTerrain: (lat: number, lng: number) => void;
}

type SearchStatus = 'searching' | 'ready' | 'not_found' | 'sdk_unavailable';

export function Roadview3DModal({
  kakaoMaps,
  target,
  onClose,
  onFallbackToSatelliteTerrain,
}: Roadview3DModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const roadviewRef = useRef<KakaoRoadview | null>(null);

  const isSdkAvailable = Boolean(
    kakaoMaps &&
      typeof kakaoMaps.Roadview === 'function' &&
      typeof kakaoMaps.RoadviewClient === 'function',
  );

  const [status, setStatus] = useState<SearchStatus>('searching');
  const [matchedRadiusMeters, setMatchedRadiusMeters] = useState<number>(80);
  const [currentPan, setCurrentPan] = useState<number>(0);
  const [currentTilt, setCurrentTilt] = useState<number>(0);

  useEffect(() => {
    if (!target || !kakaoMaps || !isSdkAvailable) return;

    let cancelled = false;

    const position = new kakaoMaps.LatLng(target.lat, target.lng);
    const client = new kakaoMaps.RoadviewClient();

    const mountRoadviewWithPano = (panoId: number, resolvedRadius: number) => {
      if (cancelled) return;
      setMatchedRadiusMeters(resolvedRadius);
      setStatus('ready');

      window.setTimeout(() => {
        if (cancelled || !containerRef.current) return;
        try {
          const rv = new kakaoMaps.Roadview(containerRef.current, {
            pan: 0,
            tilt: 0,
            zoom: 0,
          });
          roadviewRef.current = rv;
          rv.setPanoId(panoId, position);
          setCurrentPan(0);
          setCurrentTilt(0);

          kakaoMaps.event.addListener(rv, 'viewpoint_changed', () => {
            try {
              const vp = rv.getViewpoint();
              if (vp) {
                setCurrentPan(Math.round(vp.pan));
                setCurrentTilt(Math.round(vp.tilt));
              }
            } catch {
              // ignore viewpoint read error
            }
          });
        } catch {
          setStatus('not_found');
        }
      }, 30);
    };

    // 1차 탐색: 반경 80m 이내 (선착장 안벽·해안도로 인접)
    client.getNearestPanoId(position, 80, (panoId80) => {
      if (cancelled) return;
      if (panoId80 !== null && panoId80 !== 0) {
        mountRoadviewWithPano(panoId80, 80);
        return;
      }

      // 2차 확장 탐색: 반경 250m 이내 (방파제 외측·돌제선착장 끝단에서 배후 해안도로 탐색)
      client.getNearestPanoId(position, 250, (panoId250) => {
        if (cancelled) return;
        if (panoId250 !== null && panoId250 !== 0) {
          mountRoadviewWithPano(panoId250, 250);
        } else {
          setStatus('not_found');
        }
      });
    });

    return () => {
      cancelled = true;
      roadviewRef.current = null;
    };
  }, [kakaoMaps, target, isSdkAvailable]);

  const effectiveStatus: SearchStatus = !isSdkAvailable ? 'sdk_unavailable' : status;

  const handleAdjustViewpoint = useCallback(
    (deltaPan: number, resetTilt = false) => {
      const rv = roadviewRef.current;
      if (!rv) return;
      try {
        const vp = rv.getViewpoint();
        const nextPan = ((vp.pan + deltaPan) % 360 + 360) % 360;
        const nextTilt = resetTilt ? 0 : vp.tilt;
        rv.setViewpoint({
          ...vp,
          pan: nextPan,
          tilt: nextTilt,
        });
        setCurrentPan(Math.round(nextPan));
        setCurrentTilt(Math.round(nextTilt));
      } catch {
        // ignore
      }
    },
    [],
  );

  const handleResetNorth = useCallback(() => {
    const rv = roadviewRef.current;
    if (!rv) return;
    try {
      const vp = rv.getViewpoint();
      rv.setViewpoint({
        ...vp,
        pan: 0,
        tilt: 0,
        zoom: 0,
      });
      setCurrentPan(0);
      setCurrentTilt(0);
    } catch {
      // ignore
    }
  }, []);

  if (!target) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="roadview-3d-modal-title"
      className="fixed inset-0 z-[1350] flex flex-col justify-end bg-slate-950/85 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[84dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border-t-2 border-sky-400/80 bg-[#0b192c] text-white shadow-2xl sm:h-[82dvh] sm:rounded-3xl sm:border-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. 상단 3D 현장 로드뷰 헤더 */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-700 bg-slate-900/95 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-500 px-2 py-0.5 text-[10px] font-black text-slate-950">
                <Eye className="h-3 w-3 stroke-[2.6]" />
                <span>360° 3D 현장 로드뷰</span>
              </span>
              {target.pointId && (
                <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-extrabold text-amber-300">
                  {target.pointId}
                </span>
              )}
              {effectiveStatus === 'ready' && (
                <span className="rounded-md border border-emerald-500/50 bg-emerald-950/80 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300">
                  반경 {matchedRadiusMeters}m 내 실사 파노라마
                </span>
              )}
            </div>
            <h2
              id="roadview-3d-modal-title"
              className="mt-1 truncate text-sm font-black text-white sm:text-base"
            >
              {target.title}
            </h2>
            <p className="font-mono text-[11px] font-bold text-slate-400">
              {target.lat.toFixed(5)}°N, {target.lng.toFixed(5)}°E
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="3D 현장 로드뷰 닫기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-white active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 2. 본문: 3D 파노라마 캔버스 또는 무인도/해상 미촬영 폴백 */}
        <div className="relative flex-1 bg-slate-950">
          {effectiveStatus === 'searching' && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-400 border-t-transparent" />
              <p className="text-sm font-extrabold text-sky-200">
                인접 해안도로·선착장 360° 3D 파노라마 탐색 중...
              </p>
              <p className="text-xs text-slate-400">
                반경 80m → 250m 순서로 가장 가까운 카카오 로드뷰 지점을 찾고 있습니다.
              </p>
            </div>
          )}

          {effectiveStatus === 'ready' && (
            <>
              <div
                ref={containerRef}
                className="h-full w-full"
                aria-label="카카오 360도 3D 현장 로드뷰 캔버스"
              />

              {/* 상단 좌측 방위각·틸트 HUD 배지 */}
              <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-xl border border-slate-600/90 bg-[#0b192c]/90 px-3 py-1.5 text-xs font-extrabold text-sky-200 shadow-lg backdrop-blur-md">
                <Compass className="h-4 w-4 text-amber-400" />
                <span>
                  방위각 {currentPan}° · 상하각 {currentTilt}°
                </span>
              </div>
            </>
          )}

          {(effectiveStatus === 'not_found' || effectiveStatus === 'sdk_unavailable') && (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <div className="max-w-md rounded-3xl border-2 border-amber-500/60 bg-slate-900/95 p-5 shadow-2xl">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-300">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-base font-black text-white">
                  {effectiveStatus === 'sdk_unavailable'
                    ? '카카오맵 엔진 연결 후 3D 로드뷰를 사용할 수 있습니다'
                    : '이 해상·도서 지점(반경 250m)에는 촬영된 3D 로드뷰가 없습니다'}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">
                  {effectiveStatus === 'sdk_unavailable'
                    ? '현재 오프라인 또는 레거시 지도 모드입니다. 온라인 상태에서 카카오맵 엔진으로 전환하면 360° 3D 파노라마를 열람할 수 있습니다.'
                    : '무인도·외해 갯바위·해상 구역은 차량/선박 로드뷰 촬영 구간이 존재하지 않습니다. 지명 가림이 없는 순수 위성뷰(SKYVIEW)와 2.5D 입체 지형도를 결합해 암초와 접안 여건을 확인해 주세요.'}
                </p>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      onFallbackToSatelliteTerrain(target.lat, target.lng);
                      onClose();
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-400 px-3 py-2.5 text-xs font-black text-slate-950 shadow active:scale-95"
                  >
                    <Satellite className="h-4 w-4" />
                    <span>순수 위성뷰(SKYVIEW) + 2.5D 지형도로 보기</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-200"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. 하단 원터치 360° 회전·시점 제어 바 (젖은 장갑/한 손 조작 최적화) */}
        {effectiveStatus === 'ready' && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 bg-slate-900/95 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleAdjustViewpoint(-45)}
                className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-600 bg-slate-800 px-2.5 text-xs font-extrabold text-white active:scale-95"
                title="왼쪽으로 45도 회전"
              >
                <RotateCcw className="h-3.5 w-3.5 text-sky-300" />
                <span>좌 45°</span>
              </button>
              <button
                type="button"
                onClick={() => handleAdjustViewpoint(45)}
                className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-600 bg-slate-800 px-2.5 text-xs font-extrabold text-white active:scale-95"
                title="오른쪽으로 45도 회전"
              >
                <RotateCw className="h-3.5 w-3.5 text-sky-300" />
                <span>우 45°</span>
              </button>
              <button
                type="button"
                onClick={handleResetNorth}
                className="inline-flex h-9 items-center gap-1 rounded-xl border border-amber-400/60 bg-amber-500/20 px-2.5 text-xs font-extrabold text-amber-200 active:scale-95"
                title="정북(0°) 및 수평 시점으로 초기화"
              >
                <Compass className="h-3.5 w-3.5" />
                <span>정북 초기화</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onFallbackToSatelliteTerrain(target.lat, target.lng);
                onClose();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-400/60 bg-emerald-500/20 px-3 text-xs font-extrabold text-emerald-200 active:scale-95"
            >
              <LocateFixed className="h-3.5 w-3.5" />
              <span>위성+2.5D 지형도로 위치 보기</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
