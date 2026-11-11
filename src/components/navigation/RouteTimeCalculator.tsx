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
  Info,
  MapPin,
  Maximize2,
  MousePointerClick,
  Navigation,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  Waves,
  Wind,
  X,
} from 'lucide-react';
import type { RouteCalculationResult, RouteWaypoint } from '../../types/route';
import type { SourceCategoryKey } from '../../config/dataSources';

export type RouteMapTapMode = 'pan_only' | 'add_waypoint' | 'set_start' | 'set_end';
export type RouteSheetStage = 'summary' | 'compact' | 'full';

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
  selectedLegIndex?: number | null;
  onSelectLeg?: (legIndex: number | null) => void;
  showDirectionArrows?: boolean;
  onToggleDirectionArrows?: () => void;
  showLegDurationOnMap?: boolean;
  onToggleLegDurationOnMap?: () => void;
  showLegDistanceOnMap?: boolean;
  onToggleLegDistanceOnMap?: () => void;
  onFitRouteBounds?: () => void;
  onOpenSourcesInfo?: (sourceId: SourceCategoryKey) => void;
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
  selectedLegIndex = null,
  onSelectLeg,
  showDirectionArrows = true,
  onToggleDirectionArrows,
  showLegDurationOnMap = true,
  onToggleLegDurationOnMap,
  showLegDistanceOnMap = true,
  onToggleLegDistanceOnMap,
  onFitRouteBounds,
  onOpenSourcesInfo,
}: RouteTimeCalculatorProps) {
  const [sheetStage, setSheetStage] = useState<RouteSheetStage>('summary');
  const isCollapsed = sheetStage === 'summary';
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

  const formatKstEtaFromOffsetMins = useCallback(
    (offsetMinutes: number) =>
      new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(nowTimestamp + Math.round(offsetMinutes) * 60_000)),
    [nowTimestamp],
  );

  const etaTimeKst = formatKstEtaFromOffsetMins(totalMins);

  const hasCautionOrDanger = calculation.legs.some(
    (l) => l.safetyLevel === 'caution' || l.safetyLevel === 'danger',
  );
  const effectiveSubView: 'points' | 'legs' =
    selectedLegIndex !== null ? 'legs' : activeSubView;
  const hasCalculatedRoute = waypoints.length >= 2;

  const handleCopyRouteBriefing = useCallback(async () => {
    const wpChain = waypoints.map((w) => w.name).join(' → ');
    const legLines = calculation.legs.map((leg) => {
      const cumMins = Math.round(leg.endCumulativeMinutes ?? leg.durationMinutes);
      const legEta = formatKstEtaFromOffsetMins(cumMins);
      const channelInfo =
        leg.waypointNames && leg.waypointNames.length > 0
          ? ` | 수로: ${leg.waypointNames.join('→')}`
          : '';
      return `  ${leg.index}구간: ${leg.from.name} → ${leg.to.name} | ${leg.distanceNm.toFixed(1)}NM (${leg.distanceKm.toFixed(1)}km) | 약 ${Math.round(leg.durationMinutes)}분 (${legEta} 도착예정) | 출항침로 ${leg.bearingDeg}°(${leg.cardinal})${channelInfo}${leg.safetyNote ? ` | ⚠️ ${leg.safetyNote}` : ''}`;
    });
    const text = [
      `[바다꼼꼬미 실항로 운항 브리핑]`,
      `• 항로: ${wpChain}`,
      `• 선속: ${speedKnots} kn`,
      `• 총 실항로 거리: ${calculation.totalDistanceNm.toFixed(1)} NM (${calculation.totalDistanceKm.toFixed(1)} km)`,
      `• 예상 소요시간: 약 ${timeFormatted} (현 시각 출항 시 ${etaTimeKst} 도착 예정)`,
      ...legLines,
      `※ 본 결과는 선속·수로 변침 기반 단순 추정치이며 조류·기상·선박 특성에 따라 달라질 수 있으므로 공식 항해 계획(해도·ECDIS·선장 판단)을 대체하지 않습니다.`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedBriefing(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedBriefing(false), 2000);
    } catch {
      setCopiedBriefing(false);
    }
  }, [waypoints, calculation, speedKnots, timeFormatted, etaTimeKst, formatKstEtaFromOffsetMins]);

  return (
    <section
      className="knps-hud-surface bada-hud-panel pointer-events-auto relative flex h-auto max-h-[calc(100dvh-10.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full flex-col overflow-hidden rounded-3xl border-2 border-[#00a79d]/60 bg-white/96 px-2.5 pt-2.5 pb-3 text-[#003360] shadow-2xl backdrop-blur-md sm:p-3.5"
      aria-label="바닷길 시간계산 패널"
    >
      <div
        aria-hidden="true"
        className="knps-tricolor-bar pointer-events-none absolute inset-x-0 top-0 h-1 opacity-95"
      />
      {/* Zone 1: 2단 계층형 상단 HUD 헤더 (Row 1: 타이틀·선속·유틸 툴바 / Row 2: 전폭 100% 히어로 브리핑 박스) */}
      <div className="shrink-0">
        {/* Row 1: 좌측 타이틀·선속 배지 + 우측 유틸리티 컨트롤 툴바 (수평 정렬 100% 보장) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[11px] font-black tracking-wider whitespace-nowrap text-sky-700 uppercase">
              예상 소요시간
            </span>
            <span className="shrink-0 rounded-md border border-amber-500/80 bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-black whitespace-nowrap tabular-nums text-amber-900">
              {speedKnots}kn
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {onFitRouteBounds && (
              <button
                type="button"
                onClick={onFitRouteBounds}
                disabled={!hasCalculatedRoute}
                aria-label="전체 항로 한눈에 보기"
                title="출발지부터 도착지까지 전체 항로가 화면에 들어오도록 지도 맞춤"
                className={`flex h-8 shrink-0 items-center justify-center gap-1 rounded-xl border px-2 text-[11px] font-black whitespace-nowrap transition sm:h-8.5 ${hasCalculatedRoute ? 'border-[#00846c] bg-emerald-50 text-[#00846c] hover:bg-emerald-100 active:scale-95' : 'cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400'}`}
              >
                <Maximize2 className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">전체항로</span>
              </button>
            )}
            {onUndoRoute && (
              <button
                type="button"
                onClick={onUndoRoute}
                disabled={!canUndoRoute}
                aria-label="직전 경로 변경 실행취소"
                title="방금 추가·삭제·이동한 경로 되돌리기"
                className={`flex h-8 w-8 shrink-0 items-center justify-center gap-1 rounded-xl border text-[11px] font-black whitespace-nowrap transition active:scale-95 sm:h-8.5 sm:w-auto sm:px-2.5 ${canUndoRoute
                    ? 'border-amber-500 bg-amber-100 text-amber-900 shadow-xs hover:bg-amber-200'
                    : 'cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400'
                  }`}
              >
                <Undo2 className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">실행취소</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyRouteBriefing}
              disabled={!hasCalculatedRoute}
              aria-label="운항 항로 브리핑 복사"
              title="출발·경유·도착 및 소요시간·방위각 브리핑 복사"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition sm:h-8.5 sm:w-8.5 ${!hasCalculatedRoute
                  ? 'cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400'
                  : copiedBriefing
                  ? 'border-[#00846c] bg-emerald-100 text-[#00846c]'
                  : 'border-slate-300 bg-white text-[#003360] hover:border-sky-400 hover:bg-sky-50 active:scale-95'
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
              disabled={!hasCalculatedRoute}
              aria-label="출발지와 목적지 반전"
              title="출발 ↔ 도착 역방향 전환"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border sm:h-8.5 sm:w-8.5 ${hasCalculatedRoute ? 'border-slate-300 bg-white text-sky-700 hover:border-sky-400 hover:bg-sky-50 active:scale-95' : 'cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400'}`}
            >
              <ArrowUpDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
            <button
              type="button"
              onClick={onResetRoute}
              aria-label="항로 비우기"
              title="출발지와 목적지를 모두 비우기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50 active:scale-95 sm:h-8.5 sm:w-8.5"
            >
              <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
            <div
              role="group"
              aria-label="계산기 시트 높이 단계"
              className="flex h-8 shrink-0 items-center gap-0.5 rounded-xl border border-sky-300 bg-sky-50 p-0.5 sm:h-8.5"
            >
              {(
                [
                  { stage: 'summary', label: '요약', title: '1단계 요약: 소요시간·거리만 표시 (지도 시야 최대 확보)' },
                  { stage: 'compact', label: '중간', title: '2단계 중간: 탭 모드·선속 슬라이더만 표시' },
                  { stage: 'full', label: '전체', title: '3단계 전체: 항구·구간 목록까지 모두 표시' },
                ] as const
              ).map((item) => {
                const isActive = sheetStage === item.stage;
                return (
                  <button
                    key={item.stage}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setSheetStage(item.stage)}
                    title={item.title}
                    className={`flex h-full items-center justify-center rounded-lg px-2 text-[11px] font-black whitespace-nowrap transition active:scale-95 ${isActive
                        ? 'bg-[#003360] text-white shadow-xs'
                        : 'text-[#003360] hover:bg-sky-100'
                      }`}
                  >
                    {item.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  setSheetStage((prev) => (prev === 'summary' ? 'full' : 'summary'))
                }
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? '계산기 패널 펼치기' : '계산기 패널 접기'}
                title={isCollapsed ? '전체 시트 펼치기' : '요약 모드로 접기'}
                className="flex h-full w-6 items-center justify-center rounded-lg text-[#003360] hover:bg-sky-100 active:scale-95"
              >
                {isCollapsed ? (
                  <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: 전폭(100%) 히어로 브리핑 박스 — 소요시간·실항로 거리·도착예정·안전주의 배지 무절단 노출 */}
        {!hasCalculatedRoute ? (
          <div className="mt-1.5 rounded-2xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-bold text-[#003360]">
            {waypoints.length === 0
              ? '출발지와 목적지를 지도에서 차례로 지정해 항로를 시작하세요.'
              : '출발지를 지정했습니다. 지도에서 목적지를 지정하면 항로를 계산합니다.'}
          </div>
        ) : (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 rounded-2xl border border-[#00a79d]/45 bg-[#f0f9ff] px-2.5 py-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="shrink-0 text-xl leading-none font-black tracking-tight whitespace-nowrap tabular-nums text-[#003360] sm:text-2xl">
              {timeFormatted}
            </span>
            <span className="font-mono text-xs font-bold whitespace-nowrap tabular-nums text-[#484843]">
              · 실항로{' '}
              <strong className="font-extrabold text-[#00846c]">
                {calculation.totalDistanceNm.toFixed(1)} NM
              </strong>{' '}
              <span className="text-[11px] text-slate-600">
                ({calculation.totalDistanceKm.toFixed(1)}km · {calculation.legs.length}구간)
              </span>
            </span>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-400 bg-white px-1.5 py-0.5 font-mono text-[10px] font-extrabold whitespace-nowrap tabular-nums text-[#003360]"
              title="현재 시각 출항 기준 예상 도착 시각 (KST)"
            >
              <Clock className="h-2.5 w-2.5 shrink-0 text-sky-700" />
              <span>{etaTimeKst} 도착예정</span>
            </span>
            {hasCautionOrDanger && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500 bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold whitespace-nowrap text-amber-900">
                <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-amber-700" />
                <span>수심·암초주의</span>
              </span>
            )}
            <span
              className="inline-flex shrink-0 items-center rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-slate-700"
              title="선속·수로 변침 기반 단순 추정치이며 공식 항해 계획(해도·ECDIS·선장 판단)을 대체하지 않습니다."
            >
              추정치·참고용
            </span>
          </div>
        </div>
        )}
      </div>

      {!isCollapsed && (
        <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto border-t border-sky-200 pt-2 pr-0.5">
          {/* Zone 2: 지도 탭 동작 모드 선택 바 (h-7 균일 규격 · 줄바꿈 제로) + 선착장 마커 토글 */}
          <div className="flex items-center justify-between gap-1.5 overflow-x-auto rounded-xl border border-sky-200 bg-sky-50/95 px-2 py-1 scrollbar-none">
            <div className="flex min-w-0 shrink-0 items-center gap-1">
              {mapTapMode === 'pan_only' ? (
                <Hand className="h-3.5 w-3.5 shrink-0 text-[#00846c]" />
              ) : (
                <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-sky-700" />
              )}
              <div className="flex items-center gap-1" role="group" aria-label="지도 탭 동작 모드">
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
                      className={`inline-flex h-7 shrink-0 items-center justify-center rounded-lg px-2 text-[11px] font-black whitespace-nowrap transition active:scale-95 ${isActive
                          ? item.mode === 'pan_only'
                            ? 'bg-[#00846c] text-white shadow-xs'
                            : 'bg-[#0284c7] text-white shadow-xs'
                          : 'border border-slate-300 bg-white text-[#003360] hover:bg-sky-100'
                        }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {onToggleLegDurationOnMap && (
                <button
                  type="button"
                  onClick={onToggleLegDurationOnMap}
                  aria-pressed={showLegDurationOnMap}
                  className={`inline-flex h-7 shrink-0 items-center gap-0.5 rounded-lg border px-1.5 text-[10px] font-extrabold whitespace-nowrap tabular-nums transition active:scale-95 ${showLegDurationOnMap
                      ? 'border-amber-500 bg-amber-50 text-amber-900'
                      : 'border-slate-300 bg-white text-slate-500'
                    }`}
                  title="지도 구간 배지에 예상 소요시간(분) 표시/숨김"
                >
                  <Clock className="h-2.5 w-2.5 shrink-0" />
                  <span>시간</span>
                </button>
              )}
              {onToggleLegDistanceOnMap && (
                <button
                  type="button"
                  onClick={onToggleLegDistanceOnMap}
                  aria-pressed={showLegDistanceOnMap}
                  className={`inline-flex h-7 shrink-0 items-center gap-0.5 rounded-lg border px-1.5 text-[10px] font-extrabold whitespace-nowrap tabular-nums transition active:scale-95 ${showLegDistanceOnMap
                      ? 'border-sky-400 bg-sky-50 text-sky-900'
                      : 'border-slate-300 bg-white text-slate-500'
                    }`}
                  title="지도 구간 배지에 해리(NM) 거리 표시/숨김"
                >
                  <span>NM</span>
                </button>
              )}
              {onToggleDirectionArrows && (
                <button
                  type="button"
                  onClick={onToggleDirectionArrows}
                  aria-pressed={showDirectionArrows}
                  className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-extrabold whitespace-nowrap tabular-nums transition active:scale-95 ${showDirectionArrows
                      ? 'border-[#00a79d] bg-teal-50 text-[#00846c]'
                      : 'border-slate-300 bg-white text-slate-600'
                    }`}
                  title="지도 폴리라인 위 진행 방향 화살표(➤) 및 변침점 수로명 표시/숨김"
                >
                  <Navigation className="h-3 w-3 shrink-0 rotate-45" />
                  <span>방향표시</span>
                </button>
              )}
              {onTogglePortMarkersOnMap && (
                <button
                  type="button"
                  onClick={onTogglePortMarkersOnMap}
                  className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-extrabold whitespace-nowrap tabular-nums transition active:scale-95 ${showPortMarkersOnMap
                      ? 'border-amber-500 bg-amber-100 text-amber-900'
                      : 'border-slate-300 bg-white text-slate-600'
                    }`}
                  title="지도에 소규모 선착장 및 항구 마커 표시/숨김"
                >
                  {showPortMarkersOnMap ? (
                    <Eye className="h-3 w-3 shrink-0" />
                  ) : (
                    <EyeOff className="h-3 w-3 shrink-0" />
                  )}
                  <span>선착장({totalPortsCount})</span>
                </button>
              )}
            </div>
          </div>

          {/* Zone 3 & Zone 4: 3단계 '전체(full)' 시트 모드일 때만 항구·선착장 및 구간별 시간 목록 노출 */}
          {sheetStage === 'full' && (
            <>
              {/* Zone 3: 탭 전환 ([항구·선착장] vs [구간별 시간]) + 경유지 비우기/추가 (h-8 균일 규격) */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="grid h-8 min-w-0 flex-1 grid-cols-2 gap-1 rounded-xl border border-sky-200 bg-sky-100/80 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLeg?.(null);
                      setActiveSubView('points');
                    }}
                    className={`flex items-center justify-center rounded-lg px-1.5 text-[11px] font-black whitespace-nowrap tabular-nums transition ${effectiveSubView === 'points'
                        ? 'bg-[#003360] text-white shadow-xs'
                        : 'text-[#003360] hover:bg-white/70'
                      }`}
                  >
                    항구·선착장 ({waypoints.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubView('legs')}
                    className={`flex items-center justify-center rounded-lg px-1.5 text-[11px] font-black whitespace-nowrap tabular-nums transition ${effectiveSubView === 'legs'
                        ? 'bg-[#003360] text-white shadow-xs'
                        : 'text-[#003360] hover:bg-white/70'
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
                      className="flex h-8 shrink-0 items-center gap-1 rounded-xl border border-[#b2415f] bg-rose-50 px-2 text-[11px] font-black whitespace-nowrap text-[#870b41] shadow-xs active:scale-95"
                    >
                      <Trash2 className="h-3 w-3 shrink-0 text-[#b2415f]" />
                      <span>비우기({intermediateCount})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onAddWaypoint}
                    disabled={!hasCalculatedRoute}
                    className={`flex h-8 shrink-0 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-black whitespace-nowrap ${hasCalculatedRoute ? 'border-amber-500 bg-amber-100 text-amber-900 hover:bg-amber-200 active:scale-95' : 'cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400'}`}
                  >
                    <Plus className="h-3 w-3 shrink-0" />
                    <span>경유지</span>
                  </button>
                </div>
              </div>

              {/* Zone 4-A: 출발지 / 경유지 / 목적지 2행 구조 카드 리스트 (1행 항구명 전체 노출 · 2행 시설·수심·위험요소) */}
              {effectiveSubView === 'points' ? (
                <div
                  ref={pointsListRef}
                  className="max-h-38 space-y-1 overflow-y-auto pr-0.5 sm:max-h-46"
                >
                  {waypoints.map((wp, idx) => {
                    const badgeColor =
                      wp.type === 'start'
                        ? 'bg-[#00846c] text-white'
                        : wp.type === 'end'
                          ? 'bg-[#b2415f] text-white'
                          : 'bg-amber-500 text-slate-950';
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
                    const incomingLeg = idx > 0 ? calculation.legs[idx - 1] : undefined;
                    const cumMinsToPoint = incomingLeg
                      ? Math.round(incomingLeg.endCumulativeMinutes ?? incomingLeg.durationMinutes)
                      : 0;
                    const pointEtaKst =
                      idx > 0 ? formatKstEtaFromOffsetMins(cumMinsToPoint) : null;

                    return (
                      <div
                        key={wp.id}
                        data-waypoint-row={wp.type}
                        className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 ${wp.type === 'waypoint'
                            ? 'border-amber-400 bg-amber-50/70'
                            : 'border-sky-200 bg-white'
                          }`}
                      >
                        <button
                          type="button"
                          onClick={() => onFlyToWaypoint(wp.lat, wp.lng)}
                          className="min-w-0 flex-1 text-left"
                          title="탭하여 지도에서 위치 보기"
                        >
                          {/* 카드 1행: 역할 배지 + 항구·선착장 전체 이름 + 누적 도착예정(ETA) 배지 */}
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-none font-black whitespace-nowrap ${badgeColor}`}
                            >
                              {roleLabel}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs font-extrabold text-[#003360]">
                              {wp.name}
                            </span>
                            {pointEtaKst && (
                              <span
                                className="shrink-0 rounded border border-sky-300 bg-sky-50 px-1.5 py-0.2 font-mono text-[9.5px] font-bold whitespace-nowrap tabular-nums text-sky-900"
                                title={`출발 후 약 ${cumMinsToPoint}분 경과 (${pointEtaKst} 도착예정)`}
                              >
                                +{cumMinsToPoint}분·{pointEtaKst}
                              </span>
                            )}
                          </div>

                          {/* 카드 2행: 시설유형 배지 + 최저수심 배지 + 위험요소(또는 해상좌표) */}
                          <div className="mt-1 flex items-center gap-1 text-[10px]">
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.2 text-[9px] font-bold whitespace-nowrap ${wp.isCustomCoord
                                  ? 'bg-slate-200 text-slate-800'
                                  : isSmallBerth
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-sky-100 text-sky-900'
                                }`}
                            >
                              {wp.isCustomCoord
                                ? '해상좌표'
                                : wp.facilityLabel || (isSmallBerth ? '선착장' : '항구')}
                            </span>
                            {wp.minDepthMeters !== undefined && (
                              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-sky-100 px-1.5 py-0.2 font-mono text-[9px] font-bold whitespace-nowrap tabular-nums text-sky-900">
                                <Waves className="h-2.5 w-2.5 shrink-0 text-sky-700" />
                                {wp.minDepthMeters.toFixed(1)}m
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate tabular-nums">
                              {wp.hazards && wp.hazards.length > 0 ? (
                                <span className="font-bold text-amber-800">
                                  ⚠️ {wp.hazards[0]}
                                </span>
                              ) : (
                                <span className="font-mono text-slate-600">
                                  {wp.lat.toFixed(4)}°N, {wp.lng.toFixed(4)}°E
                                </span>
                              )}
                            </span>
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
                                className={`flex h-7 w-6 items-center justify-center rounded-md border transition active:scale-90 ${canMoveUp
                                    ? 'border-slate-300 bg-white text-[#003360] hover:border-sky-400 hover:bg-sky-50'
                                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
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
                                className={`flex h-7 w-6 items-center justify-center rounded-md border transition active:scale-90 ${canMoveDown
                                    ? 'border-slate-300 bg-white text-[#003360] hover:border-sky-400 hover:bg-sky-50'
                                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                  }`}
                              >
                                <ArrowDown className="h-3 w-3" />
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => onOpenPortSelector(wp.id, roleLabel)}
                            className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-sky-400 bg-sky-100 px-2 text-[11px] font-black whitespace-nowrap text-[#003360] hover:bg-sky-200 active:scale-95"
                          >
                            <MapPin className="h-3 w-3 shrink-0 text-sky-700" />
                            <span>항구선택</span>
                          </button>

                          {wp.type === 'waypoint' && (
                            <button
                              type="button"
                              onClick={() => onRemoveWaypoint(wp.id)}
                              aria-label={`${roleLabel} 취소`}
                              title="이 경유지 취소(삭제)"
                              className="flex h-7 w-7 shrink-0 items-center justify-center gap-0.5 rounded-lg border border-[#b2415f] bg-rose-50 text-[11px] font-black whitespace-nowrap text-[#870b41] shadow-xs transition hover:bg-rose-100 active:scale-95 sm:w-auto sm:px-2"
                            >
                              <X className="h-3.5 w-3.5 shrink-0 stroke-[2.8] text-[#b2415f]" />
                              <span className="hidden sm:inline">취소</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Zone 4-B: 구간별 예상 소요시간 · 해리(NM) · 출항/입항 방위각(Bearing) · 누적 ETA · 구간 양방향 포커스 */
                <div className="max-h-38 space-y-1 overflow-y-auto pr-0.5 sm:max-h-46">
                  {calculation.legs.map((leg, legIdx) => {
                    const isSelected = selectedLegIndex === legIdx;
                    const cumMins = Math.round(
                      leg.endCumulativeMinutes ?? leg.durationMinutes,
                    );
                    const legEtaKst = formatKstEtaFromOffsetMins(cumMins);
                    const hasBearingTurn =
                      typeof leg.arrivalBearingDeg === 'number' &&
                      Math.abs(
                        ((leg.arrivalBearingDeg - leg.bearingDeg + 540) % 360) - 180,
                      ) >= 8;

                    return (
                      <div
                        key={leg.id}
                        className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-xs transition ${isSelected
                            ? 'border-2 border-[#00846c] bg-emerald-50 shadow-sm'
                            : 'border-sky-200 bg-white hover:border-sky-400'
                          }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectLeg?.(isSelected ? null : legIdx);
                            onFlyToWaypoint(leg.midLat, leg.midLng);
                          }}
                          className="min-w-0 flex-1 text-left"
                          title="탭하여 지도에서 이 구간 항로 강조 및 중심 이동"
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-black ${isSelected
                                  ? 'bg-[#00846c] text-white'
                                  : 'bg-sky-100 text-sky-900'
                                }`}
                            >
                              {leg.index}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-extrabold text-[#003360]">
                              {leg.from.name} → {leg.to.name}
                            </span>
                            <span className="shrink-0 font-mono text-[9.5px] font-bold whitespace-nowrap tabular-nums text-sky-800">
                              {legEtaKst} 도착
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10px] tabular-nums text-slate-600">
                            <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-sky-800">
                              <Compass className="h-3 w-3 shrink-0 text-sky-700" />
                              출항 {leg.bearingDeg}°({leg.cardinal})
                              {hasBearingTurn
                                ? ` → 입항 ${leg.arrivalBearingDeg}°(${leg.arrivalCardinal})`
                                : ''}
                            </span>
                            <span>·</span>
                            <span className="whitespace-nowrap font-bold text-[#003360]">
                              {leg.distanceNm.toFixed(2)}NM ({leg.distanceKm.toFixed(1)}km)
                            </span>
                            {leg.detourFactor && leg.detourFactor > 1.05 && (
                              <span className="whitespace-nowrap font-bold text-amber-800">
                                (우회 {leg.detourFactor.toFixed(2)}x)
                              </span>
                            )}
                          </div>
                          {leg.waypointNames && leg.waypointNames.length > 0 && (
                            <p className="mt-0.5 truncate text-[10px] font-bold text-[#00846c]">
                              ◆ 수로 경유: {leg.waypointNames.join(' → ')}
                            </p>
                          )}
                          {leg.safetyNote && (
                            <p className="mt-0.5 truncate text-[10px] font-bold text-amber-800">
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
                              className="flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-sky-400 bg-sky-100 px-1.5 text-[10px] font-black whitespace-nowrap text-[#003360] hover:bg-sky-200 active:scale-95"
                            >
                              <Wind className="h-3 w-3 shrink-0 text-sky-700" />
                              <span>기상</span>
                            </button>
                          )}
                          <span
                            className={`shrink-0 rounded-lg px-2 py-1 font-mono text-xs font-black whitespace-nowrap tabular-nums ${isSelected
                                ? 'bg-[#00846c] text-white'
                                : 'bg-amber-400 text-slate-950'
                              }`}
                          >
                            {Math.round(leg.durationMinutes)}분
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Zone 5: 선박 속력(knots) 프리셋 + 슬라이더 — NPIP 해안 사구 베이지(#F7F4EE) 카드 */}
          <div className="rounded-xl border border-[#d6c6b2] bg-[#f7f4ee] px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="flex shrink-0 items-center gap-1 text-[11px] font-extrabold whitespace-nowrap text-[#003360]">
                <Gauge className="h-3.5 w-3.5 shrink-0 text-[#00846c]" />
                <span>선박 속력</span>
              </span>
              <div className="flex shrink-0 gap-1">
                {SPEED_PRESETS.map((p) => (
                  <button
                    key={p.knots}
                    type="button"
                    onClick={() => onChangeSpeed(p.knots)}
                    className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-black whitespace-nowrap tabular-nums transition active:scale-95 ${speedKnots === p.knots
                        ? 'bg-[#003360] text-white shadow-xs'
                        : 'border border-[#d6c6b2] bg-white text-[#484843] hover:bg-amber-50'
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
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-[#d6c6b2] accent-[#00846c]"
              />
              <span className="w-12 shrink-0 text-right font-mono text-[11px] font-black whitespace-nowrap tabular-nums text-[#003360]">
                {speedKnots} kn
              </span>
            </div>
          </div>

          {/* 항로 알고리즘 원천 표기 + 항해 안전 고지 문구 (RC-SRC-04, RC-SAFETY-01) */}
          <div className="space-y-1 px-1">
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-bold text-slate-600">
              <span>
                🧭 <strong className="font-extrabold text-[#003360]">자체 A* 실항로</strong> (300변침점·378실측해안선 우회 · 오프라인 연산)
              </span>
              {onOpenSourcesInfo && (
                <button
                  type="button"
                  onClick={() => onOpenSourcesInfo('route_algorithm')}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-extrabold text-[#0066b3] transition hover:border-[#0066b3] active:scale-95"
                >
                  <Info className="h-2.5 w-2.5" aria-hidden="true" />
                  <span>원리·출처</span>
                </button>
              )}
            </div>
            <p className="text-[10px] leading-snug font-semibold text-slate-600">
              ※ 선속·수로 변침 기반 단순 추정치이며 조류·기상·선박 특성에 따라 달라질 수 있으므로 공식 항해 계획(해도·ECDIS·선장 판단)을 대체하지 않습니다.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
