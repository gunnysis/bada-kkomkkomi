import { useState } from 'react';
import {
  SlidersHorizontal,
  RefreshCw,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  WifiOff,
} from 'lucide-react';
import type { MarineWeatherStatusResult } from '../../types/weather';

interface MarineWeatherPanelProps {
  weather: MarineWeatherStatusResult;
  onOpenSettings: () => void;
  onRefresh: () => void;
}

export function MarineWeatherPanel({
  weather,
  onOpenSettings,
  onRefresh,
}: MarineWeatherPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const current = weather.current;

  // 신호등 색상 및 텍스트 매핑 (3단계: 좋음-초록, 보통-회색, 나쁨-빨강, 실패/미확인-'?')
  const gradeMeta = {
    good: {
      label: '좋음',
      badge: '🟢',
      color: '#10b981',
      pillClass: 'bg-emerald-500 text-slate-950',
      desc: '풍속·파고 모두 설정 기준 양호 구간',
    },
    moderate: {
      label: '보통',
      badge: '⚪',
      color: '#94a3b8',
      pillClass: 'bg-slate-300 text-slate-950',
      desc: '풍속·파고 중 하나 이상 보통 주의 구간',
    },
    bad: {
      label: '나쁨',
      badge: '🔴',
      color: '#ef4444',
      pillClass: 'bg-red-500 text-white',
      desc: '풍속·파고 중 하나 이상 나쁨(위험) 구간',
    },
    unknown: {
      label: '미확인 (?)',
      badge: '?',
      color: '#64748b',
      pillClass: 'bg-slate-700 text-amber-300',
      desc: '예보 자료가 없거나 조회 실패 (좋음/보통으로 판정하지 않음)',
    },
  }[current?.grade || 'unknown'];

  return (
    <section
      className="pointer-events-auto flex max-h-[calc(100dvh-10.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full flex-col overflow-hidden rounded-3xl border-2 border-slate-600/95 bg-[#0b192c]/95 p-2.5 text-white shadow-2xl backdrop-blur-md sm:p-3.5"
      aria-label="해상기상 상태판정 패널"
    >
      {/* 상단 기상 판정 결과 헤더 */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black tracking-wider text-sky-400 uppercase">
              해상기상 3단계 판정
            </span>
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
          </div>
          <p className="mt-0.5 truncate text-[11px] font-bold text-slate-300">{gradeMeta.desc}</p>
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
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-300">
                예보 날짜·시각 선택 (좌우 슬라이드)
              </span>
              <span className="font-mono text-xs font-bold text-sky-300">
                {current?.displayTime ?? '자료 없음'}
              </span>
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

                  return (
                    <button
                      key={`forecast-${item.time}`}
                      type="button"
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
                  ? '선택한 해역의 풍속·파고 예보를 조회하는 중입니다...'
                  : '예보 자료가 없습니다 (?) — 해역 위치를 다시 선택하거나 새로고침하세요.'}
              </div>
            )}
          </div>

          {/* 사용상 제한 안내 */}
          <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-2.5">
            <div className="flex items-start gap-2 text-[11px] leading-snug text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p>
                <strong>참고 상태 안내:</strong> 사용자 설정 기준에 따른 참고 등급이며 실제 출항 안전을 보장하지 않습니다. 상세 수치는 Windy 등 전문 기상 서비스에서 확인하세요.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>출처: Open-Meteo Weather &amp; Marine API</span>
            <span className="flex items-center gap-1 text-sky-300 font-bold">
              <HelpCircle className="h-3 w-3" />
              지도 탭 또는 핀 드래그로 해역 이동
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
