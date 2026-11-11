import { useState } from 'react';
import {
  SlidersHorizontal,
  RefreshCw,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Info,
  MapPin,
  Plus,
  WifiOff,
  Wind,
  Waves,
} from 'lucide-react';
import type { MarineWeatherStatusResult, WeatherThresholds } from '../../types/weather';
import type { RouteWaypoint } from '../../types/route';
import type { SourceCategoryKey } from '../../config/dataSources';

interface MarineWeatherPanelProps {
  weather: MarineWeatherStatusResult;
  thresholds?: WeatherThresholds;
  waypoints?: RouteWaypoint[];
  nearestAreaLabel?: string;
  onSelectWaypointWeather?: (lat: number, lng: number, name: string) => void;
  onAddCurrentWeatherAsWaypoint?: () => void;
  onOpenSettings: () => void;
  onOpenSourcesInfo?: (sourceId: SourceCategoryKey) => void;
  onRefresh: () => void;
}

export function MarineWeatherPanel({
  weather,
  thresholds,
  waypoints = [],
  nearestAreaLabel,
  onSelectWaypointWeather,
  onAddCurrentWeatherAsWaypoint,
  onOpenSettings,
  onOpenSourcesInfo,
  onRefresh,
}: MarineWeatherPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const current = weather.current;
  const isCurrentMatchingWaypoint = waypoints.some(
    (wp) =>
      Math.abs(weather.lat - wp.lat) < 0.002 &&
      Math.abs(weather.lng - wp.lng) < 0.002,
  );

  // 신호등 색상 및 텍스트 매핑 (3단계: 좋음-초록, 보통-앰버/슬레이트, 나쁨-빨강, 실패/미확인-'?')
  const gradeMeta = {
    good: {
      label: '좋음',
      color: '#00846c',
      pillClass: 'bg-emerald-600 text-white',
      desc: '풍속(IFS)·파고(WAM) 모두 설정 기준 양호 구간',
    },
    moderate: {
      label: '보통',
      color: '#d97706',
      pillClass: 'bg-amber-400 text-slate-950',
      desc: '풍속(IFS)·파고(WAM) 중 하나 이상 보통 주의 구간',
    },
    bad: {
      label: '나쁨',
      color: '#dc2626',
      pillClass: 'bg-red-600 text-white',
      desc: '풍속(IFS)·파고(WAM) 중 하나 이상 나쁨(위험) 구간',
    },
    unknown: {
      label: '미확인 (?)',
      color: '#64748b',
      pillClass: 'bg-slate-600 text-white',
      desc: '예보 자료가 없거나 조회 실패 (좋음/보통으로 판정하지 않음)',
    },
  }[current?.grade || 'unknown'];

  return (
    <section
      className="knps-hud-surface bada-hud-panel pointer-events-auto relative flex max-h-[calc(100dvh-10.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full flex-col overflow-hidden rounded-3xl border-2 border-[#00a79d]/55 bg-white/96 p-2.5 text-[#003360] shadow-2xl backdrop-blur-md sm:p-3.5"
      aria-label="해상기상 상태판정 패널"
    >
      <div
        aria-hidden="true"
        className="knps-tricolor-bar pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-95"
      />
      {/* 상단 2단 계층형 기상 판정 헤더 (Row 1: 타이틀·해역배지·유틸 툴바 / Row 2: 전폭 100% 기상 신호등·수치·기준치 브리핑 박스) */}
      <div className="shrink-0">
        {/* Row 1: 좌측 타이틀·해역 배지 + 우측 유틸리티 컨트롤 툴바 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[11px] font-black tracking-wider whitespace-nowrap text-[#0066b3] uppercase">
              ECMWF 해상기상 판정
            </span>
            {nearestAreaLabel && (
              <span className="min-w-0 truncate rounded-md border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-extrabold text-[#003360]">
                {nearestAreaLabel}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onRefresh}
              aria-label="기상 정보 새로고침"
              title="기상 예보 다시 불러오기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-[#003360] shadow-2xs active:scale-95 sm:h-8.5 sm:w-8.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${weather.isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="기준값 설정"
              title="풍속·파고 판정 기준치 설정"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-[#0066b3] shadow-2xs active:scale-95 sm:h-8.5 sm:w-8.5"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsCollapsed((v) => !v)}
              aria-label={isCollapsed ? '기상 패널 펼치기' : '기상 패널 접기'}
              className="flex h-8 shrink-0 items-center gap-0.5 rounded-xl border border-sky-300 bg-sky-50 px-2.5 text-xs font-black whitespace-nowrap text-[#0066b3] active:scale-95 sm:h-8.5"
            >
              <span>{isCollapsed ? '펼치기' : '접기'}</span>
              {isCollapsed ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              )}
            </button>
          </div>
        </div>

        {/* Row 2: 전폭(100%) 기상 판정 히어로 브리핑 박스 */}
        <div className="mt-1.5 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50/90 via-teal-50/60 to-emerald-50/50 px-2.5 py-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-white text-[10px] font-black text-white shadow"
                style={{ backgroundColor: gradeMeta.color }}
              >
                {current?.grade === 'unknown' || !current ? '?' : ''}
              </span>
              <span className="shrink-0 text-xl leading-none font-black tracking-tight whitespace-nowrap text-[#003360] sm:text-2xl">
                {weather.isLoading ? '예보 조회 중...' : gradeMeta.label}
              </span>
              {current && (
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap tabular-nums shadow-2xs ${gradeMeta.pillClass}`}
                >
                  {current.displayTime}
                </span>
              )}
            </div>

            {current && (
              <div className="flex shrink-0 items-center gap-1 text-[11px] font-bold">
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-sky-300 bg-white px-1.5 py-0.5 font-mono whitespace-nowrap tabular-nums text-[#0066b3] shadow-2xs">
                  <Wind className="h-3 w-3 shrink-0" />
                  {current.windSpeedKnots !== null
                    ? `${current.windSpeedKnots.toFixed(1)}kn`
                    : '?'}
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-teal-300 bg-white px-1.5 py-0.5 font-mono whitespace-nowrap tabular-nums text-[#00846c] shadow-2xs">
                  <Waves className="h-3 w-3 shrink-0" />
                  {current.waveHeightMeters !== null
                    ? `${current.waveHeightMeters.toFixed(2)}m`
                    : '?'}
                </span>
              </div>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10px]">
            <span className="font-bold text-slate-700">
              {gradeMeta.desc}
            </span>
            <span className="font-mono font-semibold whitespace-nowrap tabular-nums text-slate-600">
              {thresholds
                ? `양호 <${thresholds.windKnot.good}kn·<${thresholds.waveMeter.good}m / 주의 ≤${thresholds.windKnot.moderate}kn·≤${thresholds.waveMeter.moderate}m`
                : `${weather.lat.toFixed(3)}°N, ${weather.lng.toFixed(3)}°E`}
            </span>
          </div>
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-sky-200/80 pt-2 pr-0.5">
          {/* 바닷길 시간계산 항로(출발·경유·도착) 해역 원터치 기상 연동 칩 */}
          {waypoints.length > 0 && onSelectWaypointWeather && (
            <div
              role="group"
              aria-label="현재 항로 지점별 기상 빠른 조회"
              className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-sky-200 bg-sky-50/75 px-2 py-1.5 scrollbar-none"
            >
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-black text-[#0066b3]">
                <MapPin className="h-3 w-3" />
                항로 해역:
              </span>
              {waypoints.map((wp, idx) => {
                const roleLabel =
                  wp.type === 'start'
                    ? '출발'
                    : wp.type === 'end'
                      ? '도착'
                      : `경유${idx}`;
                const isNearCurrent =
                  Math.abs(weather.lat - wp.lat) < 0.002 &&
                  Math.abs(weather.lng - wp.lng) < 0.002;
                return (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => onSelectWaypointWeather(wp.lat, wp.lng, wp.name)}
                    className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-extrabold transition active:scale-95 ${
                      isNearCurrent
                        ? 'border-[#0066b3] bg-[#0066b3] text-white shadow-2xs'
                        : 'border-slate-300 bg-white text-[#003360] hover:border-[#0066b3]'
                    }`}
                  >
                    <span className="opacity-85">[{roleLabel}]</span>
                    <span className="max-w-[115px] truncate">{wp.name}</span>
                  </button>
                );
              })}

              {!isCurrentMatchingWaypoint && onAddCurrentWeatherAsWaypoint && (
                <button
                  type="button"
                  onClick={onAddCurrentWeatherAsWaypoint}
                  className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-900 shadow-2xs transition active:scale-95"
                  title="현재 기상 조회 중인 해역을 항로 경유지로 추가"
                >
                  <Plus className="h-3 w-3" />
                  <span>이 해역 경유지 추가</span>
                </button>
              )}
            </div>
          )}

          {/* 조회 실패 / 자료 없음 경고 배너 */}
          {weather.error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-800"
            >
              <WifiOff className="h-4 w-4 shrink-0 text-red-600" />
              <span>
                조회 실패 ({weather.error}) — 안전을 위해 &apos;?&apos;(미확인)로 표시합니다.
              </span>
            </div>
          )}

          {/* 날짜/시간 좌우 타임라인 슬라이더 (API가 제공하는 예보 시각만 선택 가능) */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-1.5">
              <span className="truncate text-xs font-extrabold text-[#003360]">
                예보 날짜·시각 선택 (48시간 KST)
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {weather.selectedIndex !== 0 && weather.hourly.length > 0 && (
                  <button
                    type="button"
                    onClick={() => weather.setSelectedIndex(0)}
                    className="rounded-md border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-black text-[#0066b3] active:scale-95"
                  >
                    현재시각으로
                  </button>
                )}
                <span className="font-mono text-xs font-bold text-[#0066b3]">
                  {current?.displayTime ?? '자료 없음'}
                </span>
              </div>
            </div>

            {weather.hourly.length > 0 ? (
              <div className="flex gap-1.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-none">
                {weather.hourly.map((item, idx) => {
                  const isSelected = idx === weather.selectedIndex;
                  const color =
                    item.grade === 'good'
                      ? '#00846c'
                      : item.grade === 'moderate'
                        ? '#d97706'
                        : item.grade === 'bad'
                          ? '#dc2626'
                          : '#64748b';
                  const itemGradeLabel =
                    item.grade === 'good'
                      ? '좋음'
                      : item.grade === 'moderate'
                        ? '보통'
                        : item.grade === 'bad'
                          ? '나쁨'
                          : '미확인';

                  return (
                    <button
                      key={`forecast-${item.time}`}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${item.datePart} ${item.hourPart} 기상 판정 ${itemGradeLabel}`}
                      onClick={() => weather.setSelectedIndex(idx)}
                      className={`flex min-h-14 w-16 shrink-0 flex-col items-center justify-center rounded-xl border-2 px-1 py-1.5 transition active:scale-95 ${
                        isSelected
                          ? 'border-[#0066b3] bg-sky-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-sky-300'
                      }`}
                    >
                      <span className="font-mono text-[10px] font-bold text-slate-500">
                        {item.datePart}
                      </span>
                      <span className="font-mono text-xs font-black text-[#003360]">
                        {item.hourPart}
                      </span>
                      <span
                        className="mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white text-[9px] font-black text-white shadow-2xs"
                        style={{ backgroundColor: color }}
                      >
                        {item.grade === 'unknown' ? '?' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-bold text-slate-600">
                {weather.isLoading
                  ? '선택한 해역의 ECMWF 풍속(IFS)·파고(WAM) 예보를 조회하는 중입니다...'
                  : '예보 자료가 없습니다 (?) — 해역 위치를 다시 선택하거나 새로고침하세요.'}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-600">
            <span>
              🌊 <strong className="font-extrabold text-[#003360]">유럽중기예보센터(ECMWF 9km)</strong> · Open-Meteo API
            </span>
            <div className="flex items-center gap-1.5">
              {onOpenSourcesInfo && (
                <button
                  type="button"
                  onClick={() => onOpenSourcesInfo('marine_weather')}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-extrabold text-[#0066b3] transition hover:border-[#0066b3] active:scale-95"
                >
                  <Info className="h-2.5 w-2.5" aria-hidden="true" />
                  <span>출처·한계 상세</span>
                </button>
              )}
              <span className="flex items-center gap-0.5 font-bold text-[#0066b3]">
                <HelpCircle className="h-3 w-3" />
                지도 탭·핀 드래그 이동
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
