import { useState } from 'react';
import {
  SlidersHorizontal,
  RefreshCw,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  Plus,
  WifiOff,
  Wind,
  Waves,
} from 'lucide-react';
import type { MarineWeatherStatusResult, WeatherThresholds } from '../../types/weather';
import type { RouteWaypoint } from '../../types/route';

interface MarineWeatherPanelProps {
  weather: MarineWeatherStatusResult;
  thresholds?: WeatherThresholds;
  waypoints?: RouteWaypoint[];
  nearestAreaLabel?: string;
  onSelectWaypointWeather?: (lat: number, lng: number, name: string) => void;
  onAddCurrentWeatherAsWaypoint?: () => void;
  onOpenSettings: () => void;
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
  onRefresh,
}: MarineWeatherPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const current = weather.current;
  const isCurrentMatchingWaypoint = waypoints.some(
    (wp) =>
      Math.abs(weather.lat - wp.lat) < 0.002 &&
      Math.abs(weather.lng - wp.lng) < 0.002,
  );

  // 신호등 색상 및 텍스트 매핑 (3단계: 좋음-초록, 보통-회색, 나쁨-빨강, 실패/미확인-'?')
  const gradeMeta = {
    good: {
      label: '좋음',
      color: '#10b981',
      pillClass: 'bg-emerald-500 text-slate-950',
      desc: '풍속(IFS)·파고(WAM) 모두 설정 기준 양호 구간',
    },
    moderate: {
      label: '보통',
      color: '#94a3b8',
      pillClass: 'bg-slate-300 text-slate-950',
      desc: '풍속(IFS)·파고(WAM) 중 하나 이상 보통 주의 구간',
    },
    bad: {
      label: '나쁨',
      color: '#ef4444',
      pillClass: 'bg-red-500 text-white',
      desc: '풍속(IFS)·파고(WAM) 중 하나 이상 나쁨(위험) 구간',
    },
    unknown: {
      label: '미확인 (?)',
      color: '#64748b',
      pillClass: 'bg-slate-700 text-amber-300',
      desc: '예보 자료가 없거나 조회 실패 (좋음/보통으로 판정하지 않음)',
    },
  }[current?.grade || 'unknown'];

  return (
    <section
      className="knps-hud-surface pointer-events-auto relative flex max-h-[calc(100dvh-10.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full flex-col overflow-hidden rounded-3xl border-2 border-emerald-500/45 bg-[#061c24]/95 p-2.5 text-white shadow-2xl backdrop-blur-md sm:p-3.5"
      aria-label="해상기상 상태판정 패널"
    >
      <div
        aria-hidden="true"
        className="knps-tricolor-bar pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-95"
      />
      {/* 상단 기상 판정 결과 헤더 */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black tracking-wider text-sky-400 uppercase">
              ECMWF 해상기상 3단계 판정
            </span>
            {nearestAreaLabel && (
              <span className="rounded bg-sky-500/20 px-1.5 py-0.2 text-[10px] font-extrabold text-sky-300">
                {nearestAreaLabel}
              </span>
            )}
            <span className="font-mono text-[10px] font-bold text-slate-400">
              ({weather.lat.toFixed(3)}°N, {weather.lng.toFixed(3)}°E)
            </span>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white text-[10px] font-black text-white shadow"
              style={{ backgroundColor: gradeMeta.color }}
            >
              {current?.grade === 'unknown' || !current ? '?' : ''}
            </span>
            <span className="text-xl leading-none font-black tracking-tight text-white sm:text-2xl">
              {weather.isLoading ? '예보 조회 중...' : gradeMeta.label}
            </span>
            {current && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${gradeMeta.pillClass}`}
              >
                {current.displayTime}
              </span>
            )}
            {current && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200">
                <span className="inline-flex items-center gap-0.5 rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-sky-300">
                  <Wind className="h-3 w-3" />
                  {current.windSpeedKnots !== null
                    ? `${current.windSpeedKnots.toFixed(1)}kn`
                    : '?'}
                </span>
                <span className="inline-flex items-center gap-0.5 rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-teal-300">
                  <Waves className="h-3 w-3" />
                  {current.waveHeightMeters !== null
                    ? `${current.waveHeightMeters.toFixed(2)}m`
                    : '?'}
                </span>
              </div>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] font-bold text-slate-300">
            {gradeMeta.desc}
            {thresholds && (
              <span className="ml-1 font-mono text-[10px] text-slate-400">
                (양호 &lt;{thresholds.windKnot.good}kn·&lt;{thresholds.waveMeter.good}m / 주의 &lt;{thresholds.windKnot.moderate}kn·&lt;{thresholds.waveMeter.moderate}m)
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            aria-label="기상 정보 새로고침"
            title="기상 예보 다시 불러오기"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-slate-300 active:scale-95 sm:h-9 sm:w-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${weather.isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="기준값 설정"
            title="풍속·파고 판정 기준치 설정"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-sky-400 active:scale-95 sm:h-9 sm:w-9"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsCollapsed((v) => !v)}
            aria-label={isCollapsed ? '기상 패널 펼치기' : '기상 패널 접기'}
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
        <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-slate-700/80 pt-2 pr-0.5">
          {/* 바닷길 시간계산 항로(출발·경유·도착) 해역 원터치 기상 연동 칩 */}
          {waypoints.length > 0 && onSelectWaypointWeather && (
            <div
              role="group"
              aria-label="현재 항로 지점별 기상 빠른 조회"
              className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-slate-700/90 bg-slate-900/90 px-2 py-1.5 scrollbar-none"
            >
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-black text-sky-400">
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
                        ? 'border-sky-300 bg-sky-400 text-slate-950 shadow'
                        : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-sky-400'
                    }`}
                  >
                    <span className="opacity-80">[{roleLabel}]</span>
                    <span className="max-w-[115px] truncate">{wp.name}</span>
                  </button>
                );
              })}

              {!isCurrentMatchingWaypoint && onAddCurrentWeatherAsWaypoint && (
                <button
                  type="button"
                  onClick={onAddCurrentWeatherAsWaypoint}
                  className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg border border-amber-400/80 bg-amber-500/25 px-2 py-0.5 text-[11px] font-black text-amber-200 shadow transition active:scale-95"
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
              className="flex items-center gap-2 rounded-xl border border-red-500/60 bg-red-950/80 px-3 py-2 text-xs font-bold text-red-200"
            >
              <WifiOff className="h-4 w-4 shrink-0 text-red-400" />
              <span>
                조회 실패 ({weather.error}) — 안전을 위해 &apos;?&apos;(미확인)로 표시합니다.
              </span>
            </div>
          )}

          {/* 날짜/시간 좌우 타임라인 슬라이더 (API가 제공하는 예보 시각만 선택 가능) */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-1.5">
              <span className="truncate text-xs font-extrabold text-slate-300">
                예보 날짜·시각 선택 (48시간 KST)
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {weather.selectedIndex !== 0 && weather.hourly.length > 0 && (
                  <button
                    type="button"
                    onClick={() => weather.setSelectedIndex(0)}
                    className="rounded-md border border-sky-400/60 bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-black text-sky-300 active:scale-95"
                  >
                    현재시각으로
                  </button>
                )}
                <span className="font-mono text-xs font-bold text-sky-300">
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
                      ? '#10b981'
                      : item.grade === 'moderate'
                        ? '#94a3b8'
                        : item.grade === 'bad'
                          ? '#ef4444'
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
                          ? 'border-white bg-slate-800 shadow-md'
                          : 'border-slate-700/80 bg-slate-900/80'
                      }`}
                    >
                      <span className="font-mono text-[10px] font-bold text-slate-400">
                        {item.datePart}
                      </span>
                      <span className="font-mono text-xs font-black text-white">
                        {item.hourPart}
                      </span>
                      <span
                        className="mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/80 text-[9px] font-black text-white"
                        style={{ backgroundColor: color }}
                      >
                        {item.grade === 'unknown' ? '?' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-center text-xs text-slate-400">
                {weather.isLoading
                  ? '선택한 해역의 ECMWF 풍속(IFS)·파고(WAM) 예보를 조회하는 중입니다...'
                  : '예보 자료가 없습니다 (?) — 해역 위치를 다시 선택하거나 새로고침하세요.'}
              </div>
            )}
          </div>

          {/* 사용상 제한 및 연안 9km 격자 한계 안내 (설계서 5.7항) */}
          <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-2.5">
            <div className="flex items-start gap-2 text-[11px] leading-snug text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p>
                <strong>참고 상태 및 연안 격자 한계 안내:</strong> 9 km 모델 격자 예보이며 현장 관측값이 아닙니다. 작은 섬·방파제·국지 돌풍 등 연안 지형 효과를 다 표현하지 못할 수 있으며, 실제 출항 안전을 보증하지 않으므로 기상특보와 현장 관측을 반드시 함께 확인하세요.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400">
            <span>
              예보 모델: <strong className="text-slate-300">ECMWF IFS HRES 9 km · ECMWF WAM 9 km</strong> / API 제공: Open-Meteo
            </span>
            <span className="flex items-center gap-1 font-bold text-sky-300">
              <HelpCircle className="h-3 w-3" />
              지도 탭 또는 핀 드래그로 해역 이동
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
