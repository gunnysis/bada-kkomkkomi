import { SlidersHorizontal, RefreshCw, AlertTriangle, HelpCircle } from 'lucide-react';
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
  const current = weather.current;

  // 신호등 색상 및 텍스트 매핑 (3단계: 좋음-초록, 보통-회색, 나쁨-빨강)
  const gradeMeta = {
    good: {
      label: '좋음',
      color: '#10b981',
      bgClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60',
      pillClass: 'bg-emerald-500 text-slate-950',
      desc: '설정 기준 풍속·파고 모두 양호 구간',
    },
    moderate: {
      label: '보통',
      color: '#94a3b8',
      bgClass: 'bg-slate-700/40 text-slate-300 border-slate-500/60',
      pillClass: 'bg-slate-400 text-slate-950',
      desc: '풍속 또는 파고 주의 관찰 구간',
    },
    bad: {
      label: '나쁨',
      color: '#ef4444',
      bgClass: 'bg-red-500/20 text-red-300 border-red-500/60',
      pillClass: 'bg-red-500 text-white',
      desc: '설정 기준 풍속 또는 파고 초과 구간',
    },
    unknown: {
      label: '미확인 (?)',
      color: '#64748b',
      bgClass: 'bg-slate-800 text-slate-400 border-slate-700',
      pillClass: 'bg-slate-600 text-white',
      desc: '예보 자료 없음 또는 조회 실패',
    },
  }[current?.grade || 'unknown'];

  return (
    <div
      className="pointer-events-auto mx-auto w-full max-w-lg rounded-3xl border-2 border-slate-600/90 bg-[#0b192c]/95 p-4 text-white shadow-2xl backdrop-blur-md"
      aria-label="해상기상 상태판정 패널"
    >
      {/* 상단 기상 판정 결과 헤더 */}
      <div className="flex items-start justify-between border-b border-slate-700/80 pb-3">
        <div>
          <span className="text-xs font-black tracking-wider text-sky-400 uppercase">
            해상기상 판정 상태 (3단계)
          </span>
          <div className="flex items-center gap-2.5 mt-0.5">
            <span
              className="flex h-5 w-5 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: gradeMeta.color }}
            />
            <span className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              {gradeMeta.label}
            </span>
            <span className={`rounded-lg px-2 py-0.5 text-xs font-extrabold ${gradeMeta.pillClass}`}>
              {current?.displayTime || '선택 시각'}
            </span>
          </div>
          <p className="mt-0.5 text-xs font-bold text-slate-400">{gradeMeta.desc}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            aria-label="기상 정보 새로고침"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-600 bg-slate-800 text-slate-300 shadow active:scale-95"
            title="기상 예보 다시 불러오기"
          >
            <RefreshCw className={`h-4 w-4 ${weather.isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="기준값 설정"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-600 bg-slate-800 text-sky-400 shadow active:scale-95"
            title="풍속·파고 판정 기준 설정"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 날짜/시간 좌우 타임라인 슬라이더 */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-extrabold text-slate-300">
            예보 시각 선택 (좌우 슬라이드)
          </span>
          <span className="font-mono text-xs font-bold text-sky-300">
            {current?.displayTime}
          </span>
        </div>

        {weather.hourly.length > 0 ? (
          <div className="flex gap-1.5 overflow-x-auto pb-1.5 pt-1 scrollbar-none">
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
                  onClick={() => weather.selectedIndex !== idx && weather.hourly[idx] && (weather as any).setSelectedIndex?.(idx)}
                  className={`flex min-h-12 w-15 shrink-0 flex-col items-center justify-center rounded-xl border-2 transition active:scale-95 ${
                    isSelected
                      ? 'border-white bg-slate-800 shadow-md'
                      : 'border-slate-700/80 bg-slate-900/80'
                  }`}
                >
                  <span className="text-[10px] font-bold text-slate-400">
                    {item.displayTime.split(' ')[1]}
                  </span>
                  <span
                    className="mt-1 h-3 w-3 rounded-full border border-white/60"
                    style={{ backgroundColor: color }}
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-center text-xs text-slate-400">
            {weather.isLoading ? '기상 예보 불러오는 중...' : '기상 예보 데이터가 없습니다.'}
          </div>
        )}
      </div>

      {/* 기상 제한 경고 배너 */}
      <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-950/30 p-2.5">
        <div className="flex items-start gap-2 text-[11px] text-amber-200 leading-snug">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <p>
            <strong>참고용 기상 안내:</strong> 실제 출항 가능 여부를 보증하지 않으며, 조류·너울·시정 등은 별도 확인해야 합니다. 상세 수치는 전문 기상청/Windy에서 확인하세요.
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
        <span>출처: Open-Meteo Marine Forecast API</span>
        <span className="flex items-center gap-1">
          <HelpCircle className="h-3 w-3" />
          지도 위 핀을 드래그해 해역 변경
        </span>
      </div>
    </div>
  );
}
