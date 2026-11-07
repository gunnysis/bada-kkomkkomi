import { Layers, X, Info } from 'lucide-react';
import type { MapLayerConfig } from '../../types/config';

interface LayerControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  layers: MapLayerConfig[];
  onToggleLayer: (layerId: string) => void;
  showPorpoiseLayer: boolean;
  onTogglePorpoiseLayer: () => void;
  porpoiseCount: number;
}

export function LayerControlModal({
  isOpen,
  onClose,
  layers,
  onToggleLayer,
  showPorpoiseLayer,
  onTogglePorpoiseLayer,
  porpoiseCount,
}: LayerControlModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="layer-modal-title"
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border-2 border-slate-600 bg-[#0b192c] p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700/90 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 id="layer-modal-title" className="text-base font-black tracking-tight text-white">
                공간정보 레이어 관리
              </h2>
              <p className="text-xs text-slate-400">지도에 표시할 공간정보를 선택하세요</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="레이어 창 닫기"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-white active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {/* QGIS 공간 레이어 목록 */}
          {layers.map((layer) => (
            <label
              key={layer.id}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/80 p-3.5 transition active:scale-[0.99] hover:border-slate-500"
            >
              <input
                type="checkbox"
                checked={layer.visible}
                onChange={() => onToggleLayer(layer.id)}
                className="mt-1 h-5 w-5 rounded border-slate-600 bg-slate-800 text-sky-500 accent-sky-500 focus:ring-sky-400"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: layer.color }}
                  />
                  <span className="text-sm font-extrabold text-white">{layer.name}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{layer.description}</p>
              </div>
            </label>
          ))}

          {/* 상괭이 관찰기록 레이어 */}
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-teal-500/40 bg-teal-950/30 p-3.5 transition active:scale-[0.99] hover:border-teal-400">
            <input
              type="checkbox"
              checked={showPorpoiseLayer}
              onChange={onTogglePorpoiseLayer}
              className="mt-1 h-5 w-5 rounded border-teal-600 bg-slate-800 text-teal-400 accent-teal-400 focus:ring-teal-400"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 items-center justify-center rounded-full bg-teal-400" />
                <span className="text-sm font-extrabold text-teal-200">
                  개인 상괭이 관찰 표식
                </span>
                <span className="rounded bg-teal-900/80 px-1.5 py-0.2 text-[10px] font-black text-teal-300">
                  {porpoiseCount}건
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                기기에 저장된 상괭이 목격 위치 핀 표시
              </p>
            </div>
          </label>
        </div>

        <div className="mt-5 rounded-2xl border border-sky-500/30 bg-sky-950/30 p-3">
          <div className="flex items-start gap-2 text-xs text-sky-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            <p className="leading-relaxed">
              QGIS에서 내보낸 GeoJSON 파일은 <code className="text-amber-300">public/data/layers/</code>에 넣고 <code className="text-amber-300">app_config.json</code>에 등록하면 앱 재빌드 없이 자동 연동됩니다.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 flex w-full items-center justify-center rounded-xl bg-sky-500 py-3 text-sm font-black text-slate-950 shadow active:scale-95"
        >
          확인
        </button>
      </div>
    </div>
  );
}
