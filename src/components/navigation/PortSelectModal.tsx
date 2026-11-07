import { useMemo, useState } from 'react';
import { Anchor, LocateFixed, MapPin, Search, X } from 'lucide-react';
import type { MarinePort, PortRegion } from '../../types/port';

interface PortSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetLabel: string;
  ports: MarinePort[];
  userLocation: { lat: number; lng: number } | null;
  onSelectPort: (port: MarinePort) => void;
  onSelectUserGps: () => void;
}

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
  const [regionFilter, setRegionFilter] = useState<'all' | PortRegion | 'docking'>('all');

  const filteredPorts = useMemo(() => {
    return ports.filter((p) => {
      if (regionFilter === 'docking' && p.category !== 'docking') return false;
      if ((regionFilter === '통영' || regionFilter === '거제') && p.region !== regionFilter) {
        return false;
      }
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [ports, query, regionFilter]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="port-select-title"
      className="fixed inset-0 z-[1350] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86dvh] w-full max-w-lg flex-col rounded-3xl border-2 border-slate-600 bg-[#0b192c] p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700/90 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400">
              <Anchor className="h-5 w-5" />
            </div>
            <div>
              <h2 id="port-select-title" className="text-base font-black tracking-tight text-white">
                {targetLabel} 항포구·접안지 선택
              </h2>
              <p className="text-xs text-slate-400">
                항구를 선택하거나 지도에서 핀을 드래그해 지정하세요
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-white active:scale-95"
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
          className="mt-3 flex min-h-11 w-full items-center justify-between rounded-2xl border border-sky-400/60 bg-sky-950/60 px-4 py-2.5 text-left transition active:scale-[0.99] hover:border-sky-400"
        >
          <div className="flex items-center gap-2.5">
            <LocateFixed className="h-5 w-5 text-sky-400" />
            <div>
              <p className="text-xs font-black text-sky-200">
                내 선박 현재 GPS 위치로 설정
              </p>
              <p className="font-mono text-[11px] text-slate-400">
                {userLocation
                  ? `${userLocation.lat.toFixed(4)}°N, ${userLocation.lng.toFixed(4)}°E`
                  : '클릭 시 GPS 신호 수신 또는 통영·거제 해역 기준점 적용'}
              </p>
            </div>
          </div>
          <span className="rounded-lg bg-sky-500 px-2.5 py-1 text-[11px] font-black text-slate-950">
            즉시 적용
          </span>
        </button>

        {/* 검색창 */}
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="항구명 검색 (예: 당동항, 제승당, 저구항, 삼덕항...)"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pr-4 pl-10 text-sm font-bold text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
          />
        </div>

        {/* 권역 필터 탭 */}
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
          {(
            [
              { key: 'all', label: '전체' },
              { key: 'docking', label: '공식 접안지' },
              { key: '통영', label: '통영 해역' },
              { key: '거제', label: '거제 해역' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setRegionFilter(tab.key)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-extrabold transition ${
                regionFilter === tab.key
                  ? 'border-sky-400 bg-sky-500 text-slate-950'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 항포구 목록 */}
        <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
          {filteredPorts.map((port) => (
            <button
              key={port.id}
              type="button"
              onClick={() => {
                onSelectPort(port);
                onClose();
              }}
              className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/90 p-3 text-left transition active:scale-[0.99] hover:border-sky-400/70"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                      port.category === 'docking'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    }`}
                  >
                    {port.category === 'docking' ? `접안지 · ${port.id}` : `${port.region} 항포구`}
                  </span>
                  <span className="text-sm font-extrabold text-white">{port.name}</span>
                </div>
                <p className="text-xs text-slate-400">{port.description}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end font-mono text-[11px] text-slate-400">
                <span className="flex items-center gap-0.5 text-sky-300 font-bold">
                  <MapPin className="h-3 w-3" />
                  선택
                </span>
                <span>{port.lat.toFixed(3)}°N</span>
                <span>{port.lng.toFixed(3)}°E</span>
              </div>
            </button>
          ))}

          {filteredPorts.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center text-xs text-slate-400">
              일치하는 항포구가 없습니다. 지도에서 직접 핀을 드래그하거나 탭하여 지정할 수 있습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
