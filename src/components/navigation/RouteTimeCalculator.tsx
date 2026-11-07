import { useState } from 'react';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Compass,
  Gauge,
  MapPin,
  MousePointerClick,
  Plus,
  RotateCcw,
  Trash2,
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
}: RouteTimeCalculatorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeSubView, setActiveSubView] = useState<'points' | 'legs'>('points');

  const totalMins = Math.round(calculation.totalDurationMinutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const timeFormatted = hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`;

  return (
    <section
      className="pointer-events-auto w-full rounded-3xl border-2 border-slate-600/95 bg-[#0b192c]/95 p-3.5 text-white shadow-2xl backdrop-blur-md"
      aria-label="바닷길 시간계산 패널"
    >
      {/* 상단: 전체 예상 소요시간 초대형 HUD (이동거리보다 소요시간 최우선 표시) */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black tracking-wider text-sky-400 uppercase">
              전체 예상 소요시간
            </span>
            <span className="rounded-md border border-amber-400/50 bg-amber-500/20 px-1.5 py-0.5 font-mono text-[11px] font-black text-amber-300">
              {speedKnots} kn 기준
            </span>
          </div>

          <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <span className="text-3xl leading-none font-black tracking-tight text-white sm:text-4xl">
              {timeFormatted}
            </span>
            {hours > 0 && (
              <span className="font-mono text-xs font-bold text-slate-300">
                (총 {totalMins}분)
              </span>
            )}
          </div>

          <p className="mt-1 font-mono text-xs font-bold text-slate-300">
            총 이동거리:{' '}
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
        <div className="mt-3 space-y-3 border-t border-slate-700/80 pt-3">
          {/* 1. 지도 탭 동작 모드 선택 바 (요구사항: 지도를 탭하여 포인트 지정) */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-2xl border border-slate-700/90 bg-slate-900/90 px-2.5 py-2">
            <span className="flex items-center gap-1 text-[11px] font-extrabold text-slate-300">
              <MousePointerClick className="h-3.5 w-3.5 text-sky-400" />
              <span>지도 탭 동작:</span>
            </span>
            <div className="flex gap-1">
              {(
                [
                  { mode: 'add_waypoint', label: '+ 경유지 추가' },
                  { mode: 'set_start', label: '출발지 지정' },
                  { mode: 'set_end', label: '목적지 지정' },
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

          {/* 2. 탭 전환: [출발·경유·목적지 설정] vs [구간별 소요시간·방위각] */}
          <div className="flex items-center justify-between gap-2">
            <div className="grid flex-1 grid-cols-2 gap-1.5 rounded-xl bg-slate-900 p-1">
              <button
                type="button"
                onClick={() => setActiveSubView('points')}
                className={`rounded-lg py-1.5 text-xs font-black transition ${
                  activeSubView === 'points'
                    ? 'bg-slate-700 text-white shadow'
                    : 'text-slate-400'
                }`}
              >
                항구·좌표 지정 ({waypoints.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubView('legs')}
                className={`rounded-lg py-1.5 text-xs font-black transition ${
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

          {/* 2-A. 출발지 / 경유지 / 목적지 카드 리스트 (항구 검색 모달 & 지도 핀 드래그 실시간 동기화) */}
          {activeSubView === 'points' ? (
            <div className="max-h-36 space-y-1.5 overflow-y-auto pr-0.5">
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
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-extrabold text-white">
                            {wp.name}
                          </span>
                          <span
                            className={`shrink-0 rounded px-1 py-0.2 text-[9px] font-bold ${
                              wp.isCustomCoord
                                ? 'bg-slate-800 text-slate-300'
                                : 'bg-sky-500/20 text-sky-300'
                            }`}
                          >
                            {wp.isCustomCoord ? '해상좌표' : '항구스냅'}
                          </span>
                        </div>
                        <p className="font-mono text-[10px] text-slate-400">
                          {wp.lat.toFixed(4)}°N, {wp.lng.toFixed(4)}°E
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
            /* 2-B. 구간별 예상 소요시간 · 해리(NM) · 방위각(Bearing) 목록 */
            <div className="max-h-36 space-y-1.5 overflow-y-auto pr-0.5">
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
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-slate-400">
                      <span className="flex items-center gap-0.5 text-sky-300">
                        <Compass className="h-3 w-3" />
                        방위 {leg.bearingDeg}° ({leg.cardinal})
                      </span>
                      <span>·</span>
                      <span>
                        {leg.distanceNm.toFixed(2)} NM ({leg.distanceKm.toFixed(1)} km)
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="rounded-lg bg-amber-400 px-2 py-1 font-mono text-xs font-black text-slate-950">
                      {Math.round(leg.durationMinutes)}분
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 3. 선박 속력(knots) 프리셋 + 슬라이더 */}
          <div className="rounded-2xl border border-slate-700/90 bg-slate-900/90 p-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-extrabold text-slate-200">
                <Gauge className="h-4 w-4 text-sky-400" />
                <span>예상 선박 속력</span>
              </span>
              <div className="flex gap-1">
                {SPEED_PRESETS.map((p) => (
                  <button
                    key={p.knots}
                    type="button"
                    onClick={() => onChangeSpeed(p.knots)}
                    className={`rounded-lg px-2 py-0.5 font-mono text-[10px] font-black transition ${
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
              <span className="w-14 text-right font-mono text-sm font-black text-amber-300">
                {speedKnots} kn
              </span>
            </div>
          </div>

          <p className="text-[10px] leading-tight text-slate-400">
            * 핀을 드래그해 항구 반경 500m 내에 놓으면 항구명으로 자동 스냅되며, 해상 이동 시 실시간 좌표가 반영됩니다. (실제 항로·수심·암초 우회는 별도 확인 필수)
          </p>
        </div>
      )}
    </section>
  );
}
