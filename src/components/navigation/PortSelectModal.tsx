import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  calculateHaversineKm,
  kmToNauticalMiles,
  searchMarinePorts,
} from '../../services/routeGeoService';

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
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTabKey>('all');
  const [sortByGpsDistance, setSortByGpsDistance] = useState<boolean>(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

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
    const base = searchMarinePorts(ports, query, activeFilter);
    if (!sortByGpsDistance || !userLocation) {
      return base;
    }
    return [...base].sort((a, b) => {
      const distA = calculateHaversineKm(userLocation.lat, userLocation.lng, a.lat, a.lng);
      const distB = calculateHaversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng);
      return distA - distB;
    });
  }, [ports, query, activeFilter, sortByGpsDistance, userLocation]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
      aria-labelledby="port-select-title"
      className="bada-modal-dialog knps-modal-surface fixed inset-0 z-[1350] m-auto max-h-[88dvh] w-[calc(100%-1.5rem)] max-w-xl overflow-hidden rounded-3xl border-2 border-[#00a79d]/65 bg-white p-4 text-[#003360] shadow-2xl sm:p-5"
    >
      <div className="flex max-h-[calc(88dvh-2.5rem)] min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sky-200 pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-[#0066b3]">
              <Anchor className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="port-select-title"
                className="truncate text-base font-black tracking-tight text-[#003360]"
              >
                {targetLabel} 항포구·소규모 선착장 선택
              </h2>
              <p className="truncate text-xs font-bold text-slate-600">
                정규 어항·소규모 접안시설({ports.length}개소) 초성·별칭·섬 이름 검색 지원
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-[#003360] shadow-2xs active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* [GAP-03 해소] 임의 GPS 좌표 즉시 삽입 대신 현재 GPS 기준 가까운 등록 항구 순 정렬 보조 기능 제공 */}
        <button
          type="button"
          onClick={() => {
            if (!userLocation) {
              onSelectUserGps();
              setSortByGpsDistance(true);
            } else {
              setSortByGpsDistance((prev) => !prev);
            }
          }}
          aria-pressed={Boolean(userLocation && sortByGpsDistance)}
          className={`mt-2.5 flex min-h-11 w-full shrink-0 items-center justify-between gap-2 rounded-2xl border px-3.5 py-2 text-left transition active:scale-[0.99] ${
            userLocation && sortByGpsDistance
              ? 'border-[#00846c] bg-emerald-50/90 text-[#003360]'
              : 'border-sky-300 bg-sky-50/90 text-[#003360] hover:border-[#0066b3]'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <LocateFixed className="h-5 w-5 shrink-0 text-[#0066b3]" />
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-[#003360]">
                내 선박 현재 GPS에서 가까운 등록 항구 순 정렬
              </p>
              <p className="truncate font-mono text-[11px] font-bold tabular-nums text-slate-600">
                {userLocation
                  ? `기준 위치: ${userLocation.lat.toFixed(4)}°N, ${userLocation.lng.toFixed(4)}°E`
                  : '클릭 시 현재 GPS 위치를 확인하여 가까운 등록 항포구 순으로 정렬합니다'}
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-black text-white shadow-2xs ${
              userLocation && sortByGpsDistance ? 'bg-[#00846c]' : 'bg-[#0066b3]'
            }`}
          >
            {userLocation && sortByGpsDistance ? '가까운 순 켜짐' : '가까운 순 정렬'}
          </span>
        </button>

        {/* 검색창 */}
        <div className="relative mt-2 shrink-0">
          <label htmlFor="port-select-search-input" className="sr-only">
            항포구 및 소규모 선착장 검색
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            id="port-select-search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="항구·선착장·섬·초성 검색 (예: ㅅㄷㅎ, 원항, 노대도, 부잔교, 제승당)"
            className="min-h-11 w-full rounded-xl border-2 border-slate-400 bg-white py-2 pr-4 pl-10 text-base font-bold text-[#003360] placeholder-slate-400 shadow-2xs focus:border-[#0066b3] focus:outline-none"
          />
        </div>

        {/* 빠른 검색 추천 칩 */}
        <div className="mt-2 flex shrink-0 items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          <span className="shrink-0 text-[10px] font-extrabold text-slate-500">추천:</span>
          {QUICK_SEARCH_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setQuery((prev) => (prev === chip ? '' : chip))}
              className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-extrabold transition ${
                query === chip
                  ? 'border-amber-500 bg-amber-400 text-slate-950'
                  : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-[#0066b3]'
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
                  ? 'border-[#0066b3] bg-[#0066b3] text-white shadow-2xs'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-sky-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 항포구 및 소규모 선착장 목록 */}
        <div className="bada-contained-scroll-region mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {filteredPorts.map((port, idx) => {
            const isSmallBerth =
              port.subCategory === 'small_berth' || port.category === 'docking';
            const tidalBadge =
              port.tidalSensitivity === 'HIGH'
                ? 'border-red-300 bg-red-50 text-red-800'
                : port.tidalSensitivity === 'MEDIUM'
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-emerald-300 bg-emerald-50 text-[#00846c]';

            return (
              <button
                key={port.id}
                type="button"
                onClick={() => {
                  onSelectPort(port);
                  onClose();
                }}
                className={`${idx >= 8 ? 'bada-deferred-port-item ' : ''}flex w-full items-start justify-between gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-2xs transition hover:border-[#00a79d] hover:bg-sky-50/50 active:scale-[0.99]`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
                        isSmallBerth
                          ? 'border border-amber-300 bg-amber-50 text-amber-900'
                          : 'border border-sky-300 bg-sky-50 text-[#0066b3]'
                      }`}
                    >
                      {isSmallBerth
                        ? port.facilityLabel || '소규모 선착장'
                        : port.portClassLabel || `${port.region} 어항`}
                    </span>

                    {port.islandName && (
                      <span className="shrink-0 rounded border border-teal-300 bg-teal-50 px-1.5 py-0.5 text-[10px] font-extrabold text-[#00846c]">
                        {port.islandName}
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
                    <span className="text-sm font-extrabold text-[#003360]">{port.name}</span>
                    {port.eupmyeondong && (
                      <span className="text-[11px] font-bold text-slate-500">
                        ({port.region} {port.eupmyeondong})
                      </span>
                    )}
                    {port.aliases && port.aliases.length > 0 && (
                      <span className="text-[10px] font-bold text-[#0066b3]">
                        · 별칭: {port.aliases.slice(0, 2).join(', ')}
                      </span>
                    )}
                  </div>

                  <p className="line-clamp-2 text-xs leading-snug text-slate-600">
                    {port.description}
                  </p>

                  {port.hazards && port.hazards.length > 0 && (
                    <p className="flex items-center gap-1 text-[11px] font-bold text-[#870b41]">
                      <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" />
                      <span className="truncate">주의: {port.hazards.join(' · ')}</span>
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end font-mono text-[11px] font-bold tabular-nums text-slate-500">
                  <span className="flex items-center gap-0.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-0.5 font-sans text-[11px] font-black text-[#0066b3]">
                    <MapPin className="h-3 w-3" />
                    선택
                  </span>
                  {userLocation && (
                    <span className="mt-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-[#00846c]">
                      {kmToNauticalMiles(
                        calculateHaversineKm(
                          userLocation.lat,
                          userLocation.lng,
                          port.lat,
                          port.lng,
                        ),
                      ).toFixed(1)}{' '}
                      NM
                    </span>
                  )}
                  <span className="mt-1">{port.lat.toFixed(3)}°N</span>
                  <span>{port.lng.toFixed(3)}°E</span>
                  {port.maxVesselTons !== undefined && (
                    <span className="mt-0.5 flex items-center gap-0.5 text-[10px] font-bold text-slate-600">
                      <Compass className="h-2.5 w-2.5 text-[#0066b3]" />≤{port.maxVesselTons}t
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {filteredPorts.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-600">
              검색어와 일치하는 항포구·소규모 선착장이 없습니다. 다른 검색어나 권역 필터를 선택해 보세요.
            </div>
          )}
        </div>

        <p className="mt-2 shrink-0 border-t border-sky-200/80 pt-2 text-[10.5px] font-semibold leading-snug text-slate-600">
          데이터 출처: 해양수산부·지자체 어항고시(81곳) + 국립공원 소규모 접안시설(50곳)·조사선 거점(5곳) 및 국립해양조사원(KHOA) 수심·해안선 기준
        </p>
      </div>
    </dialog>
  );
}
