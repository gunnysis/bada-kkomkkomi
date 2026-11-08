import { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  EyeOff,
  Gauge,
  MapPin,
  MousePointerClick,
  Plus,
  RotateCcw,
  Trash2,
  Waves,
} from 'lucide-react';
import type { RouteCalculationResult, RouteWaypoint } from '../../types/route';

export type RouteMapTapMode = 'add_waypoint' | 'set_start' | 'set_end';

interface RouteTimeCalculatorProps {
  waypoints: RouteWaypoint[];
  speedKnots: number;
  calculation: RouteCalculationResult;
  mapTapMode: RouteMapTapMode;
  onChangeMapTapMode: (mode: RouteMapTapMode) => void;
  onOpenPortSelector: (waypointId: string, label: string) => void;
  onAddWaypoint: () => void;
  onRemoveWaypoint: (id: string) => void;
  onReverseRoute: () => void;
  onChangeSpeed: (speed: number) => void;
  onResetRoute: () => void;
  onFlyToWaypoint: (lat: number, lng: number) => void;
  showPortMarkersOnMap?: boolean;
  onTogglePortMarkersOnMap?: () => void;
  totalPortsCount?: number;
}

const SPEED_PRESETS = [
  { knots: 10, label: '10kn (저속)' },
  { knots: 15, label: '15kn (순항)' },
  { knots: 20, label: '20kn (중속)' },
  { knots: 28, label: '28kn (고속)' },
];

export function RouteTimeCalculator({
  waypoints,
  speedKnots,
  calculation,
  mapTapMode,
  onChangeMapTapMode,
  onOpenPortSelector,
  onAddWaypoint,
  onRemoveWaypoint,
  onReverseRoute,
  onChangeSpeed,
  onResetRoute,
  onFlyToWaypoint,
  showPortMarkersOnMap = true,
  onTogglePortMarkersOnMap,
  totalPortsCount = 0,
}: RouteTimeCalculatorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeSubView, setActiveSubView] = useState<'points' | 'legs'>('points');

  const totalMins = Math.round(calculation.totalDurationMinutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const timeFormatted = hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`;

  const hasCautionOrDanger = calculation.legs.some(
    (l) => l.safetyLevel === 'caution' || l.safetyLevel === 'danger',
  );

  return (
    <section
      className="pointer-events-auto w-full rounded-3xl border-2 border-slate-600/95 bg-[#0b192c]/95 p-3.5 text-white shadow-2xl backdrop-blur-md"
      aria-label="바닷길 시간계산 패널"
    >
      {/* 상단: 전체 예상 소요시간 초대형 HUD (이동거리보다 소요시간 최우선 표시) */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-black tracking-wider text-sky-400 uppercase">
              전체 예상 소요시간
            </span>
            <span className="rounded-md border border-amber-400/50 bg-amber-500/20 px-1.5 py-0.5 font-mono text-[11px] font-black tabular-nums text-amber-300">
              {speedKnots} kn 기준
            </span>
            {hasCautionOrDanger && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/60 bg-amber-950/90 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300">
                <AlertTriangle className="h-3 w-3 text-amber-400" />
                접안수심·장애물 주의
              </span>
            )}
          </div>

          <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <span className="text-3xl leading-none font-black tracking-tight tabular-nums text-white sm:text-4xl">
              {timeFormatted}
            </span>
            {hours > 0 && (
              <span className="font-mono text-xs font-bold tabular-nums text-slate-300">
                (총 {totalMins}분)
              </span>
            )}
          </div>

          <p className="mt-1 font-mono text-xs font-bold tabular-nums text-slate-300">
            해상 실항로:{' '}
            <span className="font-extrabold text-amber-300">
              {calculation.totalDistanceNm.toFixed(1)} NM
            </span>{' '}
            <span className="text-slate-400">
              ({calculation.totalDistanceKm.toFixed(1)} km · {calculation.legs.length}구간)
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onReverseRoute}
            aria-label="출발지와 목적지 반전"
            title="출발 ↔ 도착 역방향 전환"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-sky-300 active:scale-95"
          >
            <ArrowUpDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onResetRoute}
            aria-label="경로 초기화"
            title="경로 기본값 복원"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-slate-300 active:scale-95"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsCollapsed((v) => !v)}
            aria-label={isCollapsed ? '계산기 패널 펼치기' : '계산기 패널 접기'}
            className="flex h-10 items-center gap-1 rounded-xl border border-sky-400/60 bg-sky-500/20 px-2.5 text-xs font-black text-sky-300 active:scale-95"
          >
            <span>{isCollapsed ? '펼치기' : '접기'}</span>
            {isCollapsed ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-3 space-y-2.5 border-t border-slate-700/80 pt-3">
          {/* 1. 지도 탭 동작 모드 선택 바 + 소규모 선착장/항구 마커 표시 토글 */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-2xl border border-slate-700/90 bg-slate-900/90 px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-[11px] font-extrabold text-slate-300">
                <MousePointerClick className="h-3.5 w-3.5 text-sky-400" />
                <span>지도 탭:</span>
              </span>
              <div className="flex gap-1">
                {(
                  [
                    { mode: 'add_waypoint', label: '+ 경유지' },
                    { mode: 'set_start', label: '출발지' },
                    { mode: 'set_end', label: '목적지' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.mode}
                    type="button"
                    onClick={() => onChangeMapTapMode(item.mode)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-black transition active:scale-95 ${
                      mapTapMode === item.mode
                        ? 'bg-sky-400 text-slate-950 shadow'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {onTogglePortMarkersOnMap && (
              <button
                type="button"
                onClick={onTogglePortMarkersOnMap}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-extrabold transition active:scale-95 ${
                  showPortMarkersOnMap
                    ? 'border-amber-400/70 bg-amber-500/20 text-amber-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400'
                }`}
                title="지도에 소규모 선착장 및 항구 마커 표시/숨김"
              >
                {showPortMarkersOnMap ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                <span>선착장핀 ({totalPortsCount})</span>
              </button>
            )}
          </div>

          {/* 2. 탭 전환: [출발·경유·목적지 설정] vs [구간별 소요시간·방위각] */}
          <div className="flex items-center justify-between gap-2">
            <div className="grid flex-1 grid-cols-2 gap-1.5 rounded-xl bg-slate-900 p-1">
              <button
                type="button"
                onClick={() => setActiveSubView('points')}
                className={`rounded-lg py-1.5 text-xs font-black tabular-nums transition ${
                  activeSubView === 'points'
                    ? 'bg-slate-700 text-white shadow'
                    : 'text-slate-400'
                }`}
              >
                항구·선착장 ({waypoints.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubView('legs')}
                className={`rounded-lg py-1.5 text-xs font-black tabular-nums transition ${
                  activeSubView === 'legs'
                    ? 'bg-slate-700 text-white shadow'
                    : 'text-slate-400'
                }`}
              >
                구간별 소요시간 ({calculation.legs.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onAddWaypoint}
              className="flex min-h-9 shrink-0 items-center gap-1 rounded-xl border border-amber-400/60 bg-amber-500/20 px-2.5 py-1.5 text-xs font-black text-amber-300 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>경유지</span>
            </button>
          </div>

          {/* 2-A. 출발지 / 경유지 / 목적지 카드 리스트 */}
          {activeSubView === 'points' ? (
            <div className="max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
              {waypoints.map((wp, idx) => {
                const badgeColor =
                  wp.type === 'start'
                    ? 'bg-emerald-500 text-slate-950'
                    : wp.type === 'end'
                      ? 'bg-rose-500 text-white'
                      : 'bg-amber-400 text-slate-950';
                const roleLabel =
                  wp.type === 'start'
                    ? '출발'
                    : wp.type === 'end'
                      ? '도착'
                      : `경유 ${idx}`;
                const isSmallBerth =
                  wp.subCategory === 'small_berth' || wp.subCategory === 'official_docking';

                return (
                  <div
                    key={wp.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-2.5 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => onFlyToWaypoint(wp.lat, wp.lng)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      title="탭하여 지도에서 위치 보기"
                    >
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${badgeColor}`}
                      >
                        {roleLabel}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="truncate text-xs font-extrabold text-white">
                            {wp.name}
                          </span>
                          <span
                            className={`shrink-0 rounded px-1 py-0.2 text-[9px] font-bold ${
                              wp.isCustomCoord
                                ? 'bg-slate-800 text-slate-300'
                                : isSmallBerth
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-sky-500/20 text-sky-300'
                            }`}
                          >
                            {wp.isCustomCoord
                              ? '해상좌표'
                              : wp.facilityLabel || (isSmallBerth ? '소규모선착장' : '항구스냅')}
                          </span>
                          {wp.minDepthMeters !== undefined && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-slate-800 px-1 py-0.2 font-mono text-[9px] font-bold tabular-nums text-sky-300">
                              <Waves className="h-2.5 w-2.5" />
                              {wp.minDepthMeters.toFixed(1)}m
                            </span>
                          )}
                        </div>
                        <p className="truncate font-mono text-[10px] tabular-nums text-slate-400">
                          {wp.lat.toFixed(4)}°N, {wp.lng.toFixed(4)}°E
                          {wp.hazards && wp.hazards.length > 0
                            ? ` · ⚠️ ${wp.hazards[0]}`
                            : ''}
                        </p>
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenPortSelector(wp.id, roleLabel)}
                        className="flex items-center gap-1 rounded-lg border border-sky-400/50 bg-sky-500/15 px-2 py-1.5 text-[11px] font-black text-sky-300 active:scale-95"
                      >
                        <MapPin className="h-3 w-3" />
                        <span>항구선택</span>
                      </button>
                      {wp.type === 'waypoint' && (
                        <button
                          type="button"
                          onClick={() => onRemoveWaypoint(wp.id)}
                          aria-label={`${roleLabel} 삭제`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/40 bg-red-950/50 text-red-300 active:scale-90"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 2-B. 구간별 예상 소요시간 · 해리(NM) · 방위각(Bearing) · 변침점 우회 정보 */
            <div className="max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
              {calculation.legs.map((leg) => (
                <div
                  key={leg.id}
                  onClick={() => onFlyToWaypoint(leg.midLat, leg.midLng)}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-3 py-2 text-xs hover:border-sky-400/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-500/20 font-mono text-[10px] font-black text-sky-300">
                        {leg.index}
                      </span>
                      <span className="truncate font-extrabold text-slate-100">
                        {leg.from.name} → {leg.to.name}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] tabular-nums text-slate-400">
                      <span className="flex items-center gap-0.5 text-sky-300">
                        <Compass className="h-3 w-3" />
                        방위 {leg.bearingDeg}° ({leg.cardinal})
                      </span>
                      <span>·</span>
                      <span>
                        {leg.distanceNm.toFixed(2)} NM ({leg.distanceKm.toFixed(1)} km)
                      </span>
                      {leg.detourFactor && leg.detourFactor > 1.05 && (
                        <span className="text-amber-300">
                          (우회 {leg.detourFactor.toFixed(2)}x)
                        </span>
                      )}
                    </div>
                    {leg.waypointNames && leg.waypointNames.length > 0 && (
                      <p className="mt-0.5 truncate text-[10px] text-slate-400">
                        수로 경유: {leg.waypointNames.join(' → ')}
                      </p>
                    )}
                    {leg.safetyNote && (
                      <p className="mt-0.5 truncate text-[10px] font-bold text-amber-300">
                        ⚠️ {leg.safetyNote}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="rounded-lg bg-amber-400 px-2 py-1 font-mono text-xs font-black tabular-nums text-slate-950">
                      {Math.round(leg.durationMinutes)}분
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 3. 선박 속력(knots) 프리셋 + 슬라이더 */}
          <div className="rounded-2xl border border-slate-700/90 bg-slate-900/90 p-2.5">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-extrabold text-slate-200">
                <Gauge className="h-4 w-4 text-sky-400" />
                <span>예상 선박 속력</span>
              </span>
              <div className="flex flex-wrap gap-1">
                {SPEED_PRESETS.map((p) => (
                  <button
                    key={p.knots}
                    type="button"
                    onClick={() => onChangeSpeed(p.knots)}
                    className={`rounded-lg px-2 py-0.5 font-mono text-[10px] font-black tabular-nums transition ${
                      speedKnots === p.knots
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min={5}
                max={35}
                step={1}
                value={speedKnots}
                onChange={(e) => onChangeSpeed(Number(e.target.value))}
                aria-label="선박 예상 속력 슬라이더"
                className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-700 accent-sky-400"
              />
              <span className="w-14 text-right font-mono text-sm font-black tabular-nums text-amber-300">
                {speedKnots} kn
              </span>
            </div>
          </div>

          <p className="text-[10px] leading-tight text-slate-400">
            * 핀 드래그 또는 지도 위 선착장 마커를 탭하면 반경 500m 내 항구·소규모 선착장으로 자동 스냅되며, 해상 변침점(A*)을 경유한 실항로 거리·소요시간이 계산됩니다.
          </p>
        </div>
      )}
    </section>
  );
}
