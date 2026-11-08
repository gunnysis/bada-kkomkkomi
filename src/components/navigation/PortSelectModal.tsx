import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  Compass,
  LocateFixed,
  MapPin,
  Search,
  Waves,
  X,
} from 'lucide-react';
import type { MarinePort } from '../../types/port';
import { searchMarinePorts } from '../../services/routeGeoService';

interface PortSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetLabel: string;
  ports: MarinePort[];
  userLocation: { lat: number; lng: number } | null;
  onSelectPort: (port: MarinePort) => void;
  onSelectUserGps: () => void;
}

type FilterTabKey = 'all' | 'small_berth' | 'port' | '통영' | '거제' | 'island';

const QUICK_SEARCH_CHIPS = [
  '삼덕항',
  '제승당',
  '저구항',
  '욕지도',
  '사량도',
  '노대도',
  '부잔교',
  '슬립웨이',
  'ㅅㄷㅎ',
  'ㅈㅅㅍ',
];

export function PortSelectModal({
  isOpen,
  onClose,
  targetLabel,
  ports,
  userLocation,
  onSelectPort,
  onSelectUserGps,
}: PortSelectModalProps) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTabKey>('all');

  const counts = useMemo(() => {
    return {
      all: ports.length,
      small_berth: ports.filter((p) => p.subCategory === 'small_berth' || p.category === 'docking')
        .length,
      port: ports.filter((p) => p.subCategory === 'port' || p.category === 'port').length,
      통영: ports.filter((p) => p.region === '통영').length,
      거제: ports.filter((p) => p.region === '거제').length,
      island: ports.filter((p) => Boolean(p.islandName)).length,
    };
  }, [ports]);

  const filteredPorts = useMemo(() => {
    return searchMarinePorts(ports, query, activeFilter);
  }, [ports, query, activeFilter]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="port-select-title"
      className="fixed inset-0 z-[1350] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-xl flex-col rounded-3xl border-2 border-slate-600 bg-[#0b192c] p-4 text-white shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700/90 pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400">
              <Anchor className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="port-select-title"
                className="truncate text-base font-black tracking-tight text-white"
              >
                {targetLabel} 항포구·소규모 선착장 선택
              </h2>
              <p className="truncate text-xs text-slate-400">
                정규 어항·소규모 접안시설({ports.length}개소) 초성·별칭·섬 이름 검색 지원
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-white active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 현재 내 선박 GPS 위치로 즉시 지정 버튼 */}
        <button
          type="button"
          onClick={() => {
            onSelectUserGps();
            onClose();
          }}
          className="mt-2.5 flex min-h-11 w-full shrink-0 items-center justify-between gap-2 rounded-2xl border border-sky-400/60 bg-sky-950/60 px-3.5 py-2 text-left transition active:scale-[0.99] hover:border-sky-400"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <LocateFixed className="h-5 w-5 shrink-0 text-sky-400" />
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-sky-200">
                내 선박 현재 GPS 위치로 설정
              </p>
              <p className="truncate font-mono text-[11px] tabular-nums text-slate-400">
                {userLocation
                  ? `${userLocation.lat.toFixed(4)}°N, ${userLocation.lng.toFixed(4)}°E`
                  : '클릭 시 GPS 신호 수신 또는 통영·거제 해역 기준점 적용'}
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-sky-500 px-2.5 py-1 text-[11px] font-black text-slate-950">
            즉시 적용
          </span>
        </button>

        {/* 검색창 */}
        <div className="relative mt-2 shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="항구·선착장·섬·초성 검색 (예: ㅅㄷㅎ, 원항, 노대도, 부잔교, 제승당)"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pr-4 pl-10 text-sm font-bold text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
          />
        </div>

        {/* 빠른 검색 추천 칩 */}
        <div className="mt-2 flex shrink-0 items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          <span className="shrink-0 text-[10px] font-extrabold text-slate-400">추천:</span>
          {QUICK_SEARCH_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setQuery((prev) => (prev === chip ? '' : chip))}
              className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-extrabold transition ${
                query === chip
                  ? 'border-amber-400 bg-amber-400 text-slate-950'
                  : 'border-slate-700/90 bg-slate-900/90 text-slate-300 hover:border-sky-400/60'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* 권역 및 시설 유형 필터 탭 */}
        <div className="mt-2 flex shrink-0 gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {(
            [
              { key: 'all', label: `전체 (${counts.all})` },
              { key: 'small_berth', label: `소규모 선착장·접안지 (${counts.small_berth})` },
              { key: 'port', label: `정규 어항 (${counts.port})` },
              { key: '통영', label: `통영 (${counts.통영})` },
              { key: '거제', label: `거제 (${counts.거제})` },
              { key: 'island', label: `부속 섬 (${counts.island})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key)}
              className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-xs font-extrabold tabular-nums transition ${
                activeFilter === tab.key
                  ? 'border-sky-400 bg-sky-500 text-slate-950'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 항포구 및 소규모 선착장 목록 */}
        <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {filteredPorts.map((port) => {
            const isSmallBerth =
              port.subCategory === 'small_berth' || port.category === 'docking';
            const tidalBadge =
              port.tidalSensitivity === 'HIGH'
                ? 'border-red-500/50 bg-red-500/20 text-red-300'
                : port.tidalSensitivity === 'MEDIUM'
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                  : 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300';

            return (
              <button
                key={port.id}
                type="button"
                onClick={() => {
                  onSelectPort(port);
                  onClose();
                }}
                className="flex w-full items-start justify-between gap-2.5 rounded-2xl border border-slate-700/80 bg-slate-900/90 p-3 text-left transition active:scale-[0.99] hover:border-sky-400/70"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
                        isSmallBerth
                          ? 'border border-amber-500/40 bg-amber-500/20 text-amber-300'
                          : 'border border-sky-500/40 bg-sky-500/20 text-sky-300'
                      }`}
                    >
                      {isSmallBerth
                        ? port.facilityLabel || '소규모 선착장'
                        : port.portClassLabel || `${port.region} 어항`}
                    </span>

                    {port.islandName && (
                      <span className="shrink-0 rounded border border-teal-500/40 bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-teal-300">
                        🏝️ {port.islandName}
                      </span>
                    )}

                    {port.minDepthMeters !== undefined && (
                      <span
                        className={`inline-flex shrink-0 items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${tidalBadge}`}
                      >
                        <Waves className="h-2.5 w-2.5" />
                        수심 {port.minDepthMeters.toFixed(1)}m
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-sm font-extrabold text-white">{port.name}</span>
                    {port.eupmyeondong && (
                      <span className="text-[11px] font-bold text-slate-400">
                        ({port.region} {port.eupmyeondong})
                      </span>
                    )}
                    {port.aliases && port.aliases.length > 0 && (
                      <span className="text-[10px] font-semibold text-sky-300/90">
                        · 별칭: {port.aliases.slice(0, 2).join(', ')}
                      </span>
                    )}
                  </div>

                  <p className="line-clamp-2 text-xs leading-snug text-slate-300">
                    {port.description}
                  </p>

                  {port.hazards && port.hazards.length > 0 && (
                    <p className="flex items-center gap-1 text-[11px] font-bold text-amber-300/95">
                      <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
                      <span className="truncate">주의: {port.hazards.join(' · ')}</span>
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end font-mono text-[11px] tabular-nums text-slate-400">
                  <span className="flex items-center gap-0.5 rounded-lg bg-sky-500/20 px-2 py-0.5 font-sans text-[11px] font-black text-sky-300">
                    <MapPin className="h-3 w-3" />
                    선택
                  </span>
                  <span className="mt-1">{port.lat.toFixed(3)}°N</span>
                  <span>{port.lng.toFixed(3)}°E</span>
                  {port.maxVesselTons !== undefined && (
                    <span className="mt-0.5 flex items-center gap-0.5 text-[10px] font-bold text-slate-300">
                      <Compass className="h-2.5 w-2.5 text-sky-400" />≤{port.maxVesselTons}t
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {filteredPorts.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center text-xs text-slate-400">
              검색어와 일치하는 항포구·소규모 선착장이 없습니다. 지도에서 직접 핀을 드래그하거나 탭하여 지정할 수 있습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
