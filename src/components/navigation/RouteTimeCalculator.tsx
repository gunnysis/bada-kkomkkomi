import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Copy,
  Eye,
  EyeOff,
  Gauge,
  Hand,
  MapPin,
  MousePointerClick,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  Waves,
  Wind,
  X,
} from 'lucide-react';
import type { RouteCalculationResult, RouteWaypoint } from '../../types/route';

export type RouteMapTapMode = 'pan_only' | 'add_waypoint' | 'set_start' | 'set_end';

interface RouteTimeCalculatorProps {
  waypoints: RouteWaypoint[];
  speedKnots: number;
  calculation: RouteCalculationResult;
  mapTapMode: RouteMapTapMode;
  onChangeMapTapMode: (mode: RouteMapTapMode) => void;
  onOpenPortSelector: (waypointId: string, label: string) => void;
  onAddWaypoint: () => void;
  onRemoveWaypoint: (id: string) => void;
  onClearWaypoints?: () => void;
  onMoveWaypoint?: (id: string, direction: 'up' | 'down') => void;
  canUndoRoute?: boolean;
  onUndoRoute?: () => void;
  onReverseRoute: () => void;
  onChangeSpeed: (speed: number) => void;
  onResetRoute: () => void;
  onFlyToWaypoint: (lat: number, lng: number) => void;
  onCheckWeatherAtPoint?: (lat: number, lng: number, label: string) => void;
  showPortMarkersOnMap?: boolean;
  onTogglePortMarkersOnMap?: () => void;
  totalPortsCount?: number;
}

const SPEED_PRESETS = [
  { knots: 10, label: '10kn' },
  { knots: 15, label: '15kn' },
  { knots: 20, label: '20kn' },
  { knots: 28, label: '28kn' },
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
  onClearWaypoints,
  onMoveWaypoint,
  canUndoRoute = false,
  onUndoRoute,
  onReverseRoute,
  onChangeSpeed,
  onResetRoute,
  onFlyToWaypoint,
  onCheckWeatherAtPoint,
  showPortMarkersOnMap = true,
  onTogglePortMarkersOnMap,
  totalPortsCount = 0,
}: RouteTimeCalculatorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeSubView, setActiveSubView] = useState<'points' | 'legs'>('points');
  const [copiedBriefing, setCopiedBriefing] = useState(false);
  const [nowTimestamp, setNowTimestamp] = useState<number>(() => Date.now());
  const copyTimerRef = useRef<number | null>(null);
  const prevWaypointCountRef = useRef<number>(waypoints.length);
  const pointsListRef = useRef<HTMLDivElement | null>(null);

  const intermediateCount = Math.max(0, waypoints.length - 2);

  // 신규 경유지가 추가되면 자동으로 '항구·선착장' 목록으로 전환하고 새로 추가된 경유지로 스크롤
  useEffect(() => {
    let scrollTimerId: number | null = null;
    if (waypoints.length > prevWaypointCountRef.current) {
      setActiveSubView('points');
      scrollTimerId = window.setTimeout(() => {
        const listEl = pointsListRef.current;
        if (!listEl) return;
        const wpItems = listEl.querySelectorAll('[data-waypoint-row="waypoint"]');
        const lastWpItem = wpItems[wpItems.length - 1] as HTMLElement | undefined;
        lastWpItem?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
    }
    prevWaypointCountRef.current = waypoints.length;
    return () => {
      if (scrollTimerId !== null) window.clearTimeout(scrollTimerId);
    };
  }, [waypoints.length]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(intervalId);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const totalMins = Math.round(calculation.totalDurationMinutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const timeFormatted = hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`;

  const etaTimeKst = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(nowTimestamp + totalMins * 60_000));

  const hasCautionOrDanger = calculation.legs.some(
    (l) => l.safetyLevel === 'caution' || l.safetyLevel === 'danger',
  );

  const handleCopyRouteBriefing = useCallback(async () => {
    const wpChain = waypoints.map((w) => w.name).join(' → ');
    const legLines = calculation.legs.map(
      (leg) =>
        `  ${leg.index}구간: ${leg.from.name} → ${leg.to.name} | ${leg.distanceNm.toFixed(1)}NM (${leg.distanceKm.toFixed(1)}km) | 약 ${Math.round(leg.durationMinutes)}분 | 침로 ${leg.bearingDeg}°(${leg.cardinal})${leg.safetyNote ? ` | ⚠️ ${leg.safetyNote}` : ''}`,
    );
    const text = [
      `[바다꼼꼬미 실항로 운항 브리핑]`,
      `• 항로: ${wpChain}`,
      `• 선속: ${speedKnots} kn`,
      `• 총 실항로 거리: ${calculation.totalDistanceNm.toFixed(1)} NM (${calculation.totalDistanceKm.toFixed(1)} km)`,
      `• 예상 소요시간: 약 ${timeFormatted} (현 시각 출항 시 ${etaTimeKst} 도착 예정)`,
      ...legLines,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedBriefing(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedBriefing(false), 2000);
    } catch {
      setCopiedBriefing(false);
    }
  }, [waypoints, calculation, speedKnots, timeFormatted, etaTimeKst]);

  return (
    <section
      className="knps-hud-surface pointer-events-auto relative flex max-h-[calc(100dvh-10.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full flex-col overflow-hidden rounded-3xl border-2 border-emerald-500/45 bg-[#061c24]/95 p-2.5 text-white shadow-2xl backdrop-blur-md sm:p-3.5"
      aria-label="바닷길 시간계산 패널"
    >
      <div
        aria-hidden="true"
        className="knps-tricolor-bar pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-95"
      />
      {/* 상단 고정 헤더: 전체 예상 소요시간 및 실항로 요약 (1~2줄 초컴팩트 구성) */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black tracking-wider text-sky-400 uppercase">
              예상 소요시간
            </span>
            <span className="rounded border border-amber-400/50 bg-amber-500/20 px-1.5 py-0.2 font-mono text-[10px] font-black tabular-nums text-amber-300">
              {speedKnots}kn
            </span>
            <span
              className="inline-flex items-center gap-0.5 rounded border border-sky-400/50 bg-sky-500/15 px-1.5 py-0.2 font-mono text-[10px] font-extrabold tabular-nums text-sky-200"
              title="현재 시각 출항 기준 예상 도착 시각 (KST)"
            >
              <Clock className="h-2.5 w-2.5 text-sky-300" />
              {etaTimeKst} 도착예정
            </span>
            {hasCautionOrDanger && (
              <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/60 bg-amber-950/90 px-1.5 py-0.2 text-[10px] font-extrabold text-amber-300">
                <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
                수심·암초주의
              </span>
            )}
          </div>

          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-xl leading-none font-black tracking-tight tabular-nums text-white sm:text-2xl">
              {timeFormatted}
            </span>
            <span className="truncate font-mono text-xs font-bold tabular-nums text-slate-300">
              · 실항로{' '}
              <strong className="font-extrabold text-amber-300">
                {calculation.totalDistanceNm.toFixed(1)} NM
              </strong>{' '}
              <span className="text-[11px] text-slate-400">
                ({calculation.totalDistanceKm.toFixed(1)}km · {calculation.legs.length}구간)
              </span>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onUndoRoute && (
            <button
              type="button"
              onClick={onUndoRoute}
              disabled={!canUndoRoute}
              aria-label="직전 경로 변경 실행취소"
              title="방금 추가·삭제·이동한 경로 되돌리기"
              className={`flex h-8 items-center gap-0.5 rounded-xl border px-2 text-[11px] font-black transition active:scale-95 sm:h-9 sm:px-2.5 ${
                canUndoRoute
                  ? 'border-amber-400/90 bg-amber-500/25 text-amber-200 shadow'
                  : 'cursor-not-allowed border-slate-700/80 bg-slate-900/60 text-slate-500'
              }`}
            >
              <Undo2 className="h-3.5 w-3.5 shrink-0" />
              <span>실행취소</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyRouteBriefing}
            aria-label="운항 항로 브리핑 복사"
            title="출발·경유·도착 및 소요시간·방위각 브리핑 복사"
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition active:scale-95 sm:h-9 sm:w-9 ${
              copiedBriefing
                ? 'border-emerald-400 bg-emerald-500/25 text-emerald-300'
                : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-sky-400'
            }`}
          >
            {copiedBriefing ? (
              <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            ) : (
              <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onReverseRoute}
            aria-label="출발지와 목적지 반전"
            title="출발 ↔ 도착 역방향 전환"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-sky-300 active:scale-95 sm:h-9 sm:w-9"
          >
            <ArrowUpDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
          <button
            type="button"
            onClick={onResetRoute}
            aria-label="경로 초기화"
            title="경로 기본값 복원"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-slate-300 active:scale-95 sm:h-9 sm:w-9"
          >
            <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsCollapsed((v) => !v)}
            aria-label={isCollapsed ? '계산기 패널 펼치기' : '계산기 패널 접기'}
            className="flex h-8 items-center gap-0.5 rounded-xl border border-sky-400/60 bg-sky-500/20 px-2 text-xs font-black text-sky-300 active:scale-95 sm:h-9 sm:px-2.5"
          >
            <span>{isCollapsed ? '펼치기' : '접기'}</span>
            {isCollapsed ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto border-t border-slate-700/80 pt-2 pr-0.5">
          {/* 1. 지도 탭 동작 모드 선택 바 (이동 잠금 지원) + 소규모 선착장/항구 마커 표시 토글 */}
          <div className="flex items-center justify-between gap-1 rounded-xl border border-slate-700/90 bg-slate-900/90 px-2 py-1">
            <div className="flex min-w-0 items-center gap-1">
              {mapTapMode === 'pan_only' ? (
                <Hand className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : (
                <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-sky-400" />
              )}
              <div className="flex flex-wrap gap-1" role="group" aria-label="지도 탭 동작 모드">
                {(
                  [
                    { mode: 'pan_only', label: '이동만' },
                    { mode: 'add_waypoint', label: '+경유지' },
                    { mode: 'set_start', label: '출발지' },
                    { mode: 'set_end', label: '목적지' },
                  ] as const
                ).map((item) => {
                  const isActive = mapTapMode === item.mode;
                  return (
                    <button
                      key={item.mode}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() =>
                        onChangeMapTapMode(
                          isActive && item.mode !== 'pan_only' ? 'pan_only' : item.mode,
                        )
                      }
                      className={`rounded-lg px-1.5 py-0.5 text-[11px] font-black transition active:scale-95 sm:px-2 ${
                        isActive
                          ? item.mode === 'pan_only'
                            ? 'bg-emerald-400 text-slate-950 shadow'
                            : 'bg-sky-400 text-slate-950 shadow'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {onTogglePortMarkersOnMap && (
              <button
                type="button"
                onClick={onTogglePortMarkersOnMap}
                className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-extrabold tabular-nums transition active:scale-95 ${
                  showPortMarkersOnMap
                    ? 'border-amber-400/70 bg-amber-500/20 text-amber-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400'
                }`}
                title="지도에 소규모 선착장 및 항구 마커 표시/숨김"
              >
                {showPortMarkersOnMap ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3" />
                )}
                <span>선착장({totalPortsCount})</span>
              </button>
            )}
          </div>

          {/* 2. 탭 전환: [출발·경유·목적지 설정] vs [구간별 소요시간·방위각] + 경유지 일괄 비우기/추가 */}
          <div className="flex items-center justify-between gap-1">
            <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl bg-slate-900 p-0.5">
              <button
                type="button"
                onClick={() => setActiveSubView('points')}
                className={`rounded-lg py-1 text-[11px] font-black tabular-nums transition ${
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
                className={`rounded-lg py-1 text-[11px] font-black tabular-nums transition ${
                  activeSubView === 'legs'
                    ? 'bg-slate-700 text-white shadow'
                    : 'text-slate-400'
                }`}
              >
                구간별 시간 ({calculation.legs.length})
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {intermediateCount > 0 && onClearWaypoints && (
                <button
                  type="button"
                  onClick={onClearWaypoints}
                  aria-label={`중간 경유지 ${intermediateCount}곳 모두 취소`}
                  title="출발지와 목적지만 남기고 중간 경유지 모두 비우기"
                  className="flex h-7 shrink-0 items-center gap-0.5 rounded-xl border border-red-400/70 bg-red-950/80 px-2 text-[11px] font-black text-red-200 shadow active:scale-95"
                >
                  <Trash2 className="h-3 w-3 text-red-300" />
                  <span>경유취소({intermediateCount})</span>
                </button>
              )}
              <button
                type="button"
                onClick={onAddWaypoint}
                className="flex h-7 shrink-0 items-center gap-0.5 rounded-xl border border-amber-400/60 bg-amber-500/20 px-2 text-[11px] font-black text-amber-300 active:scale-95"
              >
                <Plus className="h-3 w-3" />
                <span>경유지</span>
              </button>
            </div>
          </div>

          {/* 2-A. 출발지 / 경유지 / 목적지 카드 리스트 (순서 변경 및 명확한 [✕ 취소] 버튼 지원) */}
          {activeSubView === 'points' ? (
            <div
              ref={pointsListRef}
              className="max-h-36 space-y-1 overflow-y-auto pr-0.5 sm:max-h-44"
            >
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
                const canMoveUp = wp.type === 'waypoint' && idx > 1;
                const canMoveDown = wp.type === 'waypoint' && idx < waypoints.length - 2;

                return (
                  <div
                    key={wp.id}
                    data-waypoint-row={wp.type}
                    className={`flex items-center justify-between gap-1.5 rounded-xl border px-2 py-1.5 ${
                      wp.type === 'waypoint'
                        ? 'border-amber-500/50 bg-slate-900/95'
                        : 'border-slate-700/80 bg-slate-900/90'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onFlyToWaypoint(wp.lat, wp.lng)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      title="탭하여 지도에서 위치 보기"
                    >
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${badgeColor}`}
                      >
                        {roleLabel}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
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
                              : wp.facilityLabel || (isSmallBerth ? '선착장' : '항구')}
                          </span>
                          {wp.minDepthMeters !== undefined && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-slate-800 px-1 py-0.2 font-mono text-[9px] font-bold tabular-nums text-sky-300">
                              <Waves className="h-2.5 w-2.5" />
                              {wp.minDepthMeters.toFixed(1)}m
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[10px] tabular-nums text-slate-400">
                          {wp.hazards && wp.hazards.length > 0 ? (
                            <>
                              <span className="font-bold text-amber-300">
                                ⚠️ {wp.hazards[0]}
                              </span>
                              <span className="font-mono text-slate-500">
                                {' '}
                                · {wp.lat.toFixed(3)}°N, {wp.lng.toFixed(3)}°E
                              </span>
                            </>
                          ) : (
                            <span className="font-mono">
                              {wp.lat.toFixed(4)}°N, {wp.lng.toFixed(4)}°E
                            </span>
                          )}
                        </p>
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      {wp.type === 'waypoint' && intermediateCount >= 2 && onMoveWaypoint && (
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            disabled={!canMoveUp}
                            onClick={() => onMoveWaypoint(wp.id, 'up')}
                            aria-label={`${roleLabel} 순서 위로 이동`}
                            title="경유 순서 앞으로 이동"
                            className={`flex h-7 w-6 items-center justify-center rounded-md border transition active:scale-90 ${
                              canMoveUp
                                ? 'border-slate-600 bg-slate-800 text-slate-200 hover:border-sky-400'
                                : 'cursor-not-allowed border-slate-800 bg-slate-950/50 text-slate-600'
                            }`}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={!canMoveDown}
                            onClick={() => onMoveWaypoint(wp.id, 'down')}
                            aria-label={`${roleLabel} 순서 아래로 이동`}
                            title="경유 순서 뒤로 이동"
                            className={`flex h-7 w-6 items-center justify-center rounded-md border transition active:scale-90 ${
                              canMoveDown
                                ? 'border-slate-600 bg-slate-800 text-slate-200 hover:border-sky-400'
                                : 'cursor-not-allowed border-slate-800 bg-slate-950/50 text-slate-600'
                            }`}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenPortSelector(wp.id, roleLabel)}
                        className="flex h-7 items-center gap-0.5 rounded-lg border border-sky-400/50 bg-sky-500/15 px-1.5 text-[11px] font-black text-sky-300 active:scale-95 sm:px-2"
                      >
                        <MapPin className="h-3 w-3" />
                        <span>항구선택</span>
                      </button>

                      {wp.type === 'waypoint' && (
                        <button
                          type="button"
                          onClick={() => onRemoveWaypoint(wp.id)}
                          aria-label={`${roleLabel} 취소`}
                          title="이 경유지 취소(삭제)"
                          className="flex h-7 items-center gap-0.5 rounded-lg border border-red-400/70 bg-red-950/80 px-2 text-[11px] font-black text-red-200 shadow transition hover:bg-red-900/90 active:scale-95"
                        >
                          <X className="h-3.5 w-3.5 stroke-[2.8] text-red-300" />
                          <span>취소</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 2-B. 구간별 예상 소요시간 · 해리(NM) · 방위각(Bearing) · 변침점 우회 정보 · 구간 해역 기상 바로가기 */
            <div className="max-h-36 space-y-1 overflow-y-auto pr-0.5 sm:max-h-44">
              {calculation.legs.map((leg) => (
                <div
                  key={leg.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-2.5 py-1.5 text-xs hover:border-sky-400/50"
                >
                  <button
                    type="button"
                    onClick={() => onFlyToWaypoint(leg.midLat, leg.midLng)}
                    className="min-w-0 flex-1 text-left"
                    title="탭하여 구간 중간 해역으로 지도 이동"
                  >
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
                  </button>

                  <div className="flex shrink-0 items-center gap-1 text-right">
                    {onCheckWeatherAtPoint && (
                      <button
                        type="button"
                        onClick={() =>
                          onCheckWeatherAtPoint(
                            leg.midLat,
                            leg.midLng,
                            `${leg.from.name}→${leg.to.name} 구간`,
                          )
                        }
                        aria-label={`${leg.index}구간 해상기상 확인`}
                        title="이 구간 중점 해역의 ECMWF 풍속·파고 판정 보기"
                        className="flex h-7 items-center gap-0.5 rounded-lg border border-sky-400/60 bg-sky-500/15 px-1.5 text-[10px] font-black text-sky-300 active:scale-95"
                      >
                        <Wind className="h-3 w-3" />
                        <span>기상</span>
                      </button>
                    )}
                    <span className="rounded-lg bg-amber-400 px-2 py-1 font-mono text-xs font-black tabular-nums text-slate-950">
                      {Math.round(leg.durationMinutes)}분
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 3. 선박 속력(knots) 프리셋 + 슬라이더 (초슬림 구성) */}
          <div className="rounded-xl border border-slate-700/90 bg-slate-900/90 px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="flex shrink-0 items-center gap-1 text-[11px] font-extrabold text-slate-200">
                <Gauge className="h-3.5 w-3.5 text-sky-400" />
                <span>선박 속력</span>
              </span>
              <div className="flex gap-1">
                {SPEED_PRESETS.map((p) => (
                  <button
                    key={p.knots}
                    type="button"
                    onClick={() => onChangeSpeed(p.knots)}
                    className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black tabular-nums transition ${
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

            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={5}
                max={35}
                step={1}
                value={speedKnots}
                onChange={(e) => onChangeSpeed(Number(e.target.value))}
                aria-label="선박 예상 속력 슬라이더"
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-700 accent-sky-400"
              />
              <span className="w-11 text-right font-mono text-[11px] font-black tabular-nums text-amber-300">
                {speedKnots} kn
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
