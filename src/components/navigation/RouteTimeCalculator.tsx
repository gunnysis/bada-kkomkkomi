import { useState } from 'react';
import { Plus, Trash2, Gauge, RotateCcw } from 'lucide-react';
import type { RouteCalculationResult, RouteWaypoint } from '../../types/route';

interface RouteTimeCalculatorProps {
  waypoints?: RouteWaypoint[];
  speedKnots: number;
  calculation: RouteCalculationResult;
  onAddWaypoint: () => void;
  onRemoveWaypoint: (id: string) => void;
  onChangeSpeed: (speed: number) => void;
  onResetRoute: () => void;
}

export function RouteTimeCalculator({
  speedKnots,
  calculation,
  onAddWaypoint,
  onRemoveWaypoint,
  onChangeSpeed,
  onResetRoute,
}: RouteTimeCalculatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 소요시간 분 ➔ 시간+분 변환
  const totalMins = Math.round(calculation.totalDurationMinutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const timeFormatted = hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`;

  return (
    <div
      className="pointer-events-auto mx-auto w-full max-w-lg rounded-3xl border-2 border-slate-600/90 bg-[#0b192c]/95 p-4 text-white shadow-2xl backdrop-blur-md"
      aria-label="바닷길 시간계산 패널"
    >
      {/* 상단: 전체 예상 소요시간 대형 HUD (요구사항: 이동거리보다 소요시간 우선 표시) */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-700/80 pb-3">
        <div>
          <span className="text-xs font-black tracking-wider text-sky-400 uppercase">
            전체 예상 소요시간
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              {timeFormatted}
            </span>
            <span className="font-mono text-sm font-bold text-slate-300">
              ({totalMins}분)
            </span>
          </div>
          <p className="mt-0.5 font-mono text-xs font-bold text-slate-400">
            총 이동거리: <span className="text-amber-300 font-extrabold">{calculation.totalDistanceNm.toFixed(1)} NM</span> ({calculation.totalDistanceKm.toFixed(1)} km)
          </p>
        </div>

        <button
          type="button"
          onClick={onResetRoute}
          aria-label="경로 초기화"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-600 bg-slate-800 text-slate-300 shadow active:scale-95"
          title="경로 기본값 복원"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
      </div>

      {/* 속력(knots) 조절 슬라이더 및 입력 */}
      <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-900/90 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
            <Gauge className="h-4 w-4 text-sky-400" />
            <span>선박 예상 속력</span>
          </span>
          <div className="flex items-center gap-1 font-mono text-base font-black text-amber-300">
            <span>{speedKnots}</span>
            <span className="text-xs font-bold text-slate-400">knots</span>
          </div>
        </div>
        <input
          type="range"
          min={5}
          max={35}
          step={1}
          value={speedKnots}
          onChange={(e) => onChangeSpeed(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-sky-400"
        />
        <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-500">
          <span>5 kn (저속)</span>
          <span>15 kn (순항)</span>
          <span>35 kn (고속단정)</span>
        </div>
      </div>

      {/* 구간별 상세 접기/펼치기 토글 */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs font-bold text-sky-300 underline underline-offset-4"
          >
            {isExpanded ? '구간별 상세 접기 ▲' : `구간별 소요시간 보기 (${calculation.legs.length}개 구간) ▼`}
          </button>
          <button
            type="button"
            onClick={onAddWaypoint}
            className="flex items-center gap-1 rounded-xl border border-sky-400/50 bg-sky-500/20 px-2.5 py-1 text-xs font-black text-sky-300 active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>경유지 추가</span>
          </button>
        </div>

        {isExpanded && (
          <div className="mt-2.5 max-h-40 space-y-2 overflow-y-auto pr-1">
            {calculation.legs.map((leg, idx) => (
              <div
                key={`leg-${idx}`}
                className="flex items-center justify-between rounded-xl border border-slate-700/80 bg-slate-900/80 p-2 text-xs"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-black text-slate-300">
                    {idx + 1}
                  </span>
                  <span className="truncate font-bold text-slate-200">
                    {leg.from.name} → {leg.to.name}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 pl-2">
                  <span className="font-mono font-extrabold text-amber-300">
                    {Math.round(leg.durationMinutes)}분
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    ({leg.distanceNm.toFixed(1)} NM)
                  </span>
                  {leg.to.type === 'waypoint' && (
                    <button
                      type="button"
                      onClick={() => onRemoveWaypoint(leg.to.id)}
                      className="text-red-400 hover:text-red-300"
                      title="경유지 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 text-[10px] text-slate-400 leading-tight">
        * 지도의 핀(🟢출발 / 🟡경유 / 🔴도착)을 손가락으로 드래그하여 정확한 위치로 이동할 수 있습니다.
      </div>
    </div>
  );
}
