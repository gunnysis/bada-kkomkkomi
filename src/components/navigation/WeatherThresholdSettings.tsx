import { useState } from 'react';
import { X, SlidersHorizontal, Check } from 'lucide-react';
import type { WeatherThresholds } from '../../types/weather';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface WeatherThresholdSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  thresholds: WeatherThresholds;
  onSave: (thresholds: WeatherThresholds) => void;
}

export function WeatherThresholdSettings({
  isOpen,
  onClose,
  thresholds,
  onSave,
}: WeatherThresholdSettingsProps) {
  const [windGood, setWindGood] = useState(thresholds.windKnot.good);
  const [windMod, setWindMod] = useState(thresholds.windKnot.moderate);
  const [waveGood, setWaveGood] = useState(thresholds.waveMeter.good);
  const [waveMod, setWaveMod] = useState(thresholds.waveMeter.moderate);

  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      windKnot: { good: Number(windGood), moderate: Number(windMod) },
      waveMeter: { good: Number(waveGood), moderate: Number(waveMod) },
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="threshold-settings-title"
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="knps-modal-surface w-full max-w-md rounded-3xl border-2 border-emerald-500/50 bg-[#061c24] p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700/90 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h2 id="threshold-settings-title" className="text-base font-black tracking-tight text-white">
                기상 판정 기준치 설정
              </h2>
              <p className="text-xs text-slate-400">선박 규모에 맞는 안전 기준을 입력하세요</p>
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* 풍속 기준 */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3.5 space-y-3">
            <span className="text-xs font-black text-sky-300">풍속 (knots) 기준치</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  좋음 상한선 (&lt;)
                </label>
                <div className="flex items-center rounded-xl border border-slate-600 bg-slate-800 px-3 py-2">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="50"
                    value={windGood}
                    onChange={(e) => setWindGood(Number(e.target.value))}
                    className="w-full bg-transparent font-mono text-sm font-black text-white focus:outline-none"
                  />
                  <span className="text-xs text-slate-400">kn</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  보통 상한선 (≤)
                </label>
                <div className="flex items-center rounded-xl border border-slate-600 bg-slate-800 px-3 py-2">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="60"
                    value={windMod}
                    onChange={(e) => setWindMod(Number(e.target.value))}
                    className="w-full bg-transparent font-mono text-sm font-black text-white focus:outline-none"
                  />
                  <span className="text-xs text-slate-400">kn</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400">
              * {windGood}kn 미만: 좋음 | {windGood}~{windMod}kn: 보통 | {windMod}kn 초과: 나쁨
            </p>
          </div>

          {/* 파고 기준 */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3.5 space-y-3">
            <span className="text-xs font-black text-sky-300">유의파고 (m) 기준치</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  좋음 상한선 (&lt;)
                </label>
                <div className="flex items-center rounded-xl border border-slate-600 bg-slate-800 px-3 py-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10"
                    value={waveGood}
                    onChange={(e) => setWaveGood(Number(e.target.value))}
                    className="w-full bg-transparent font-mono text-sm font-black text-white focus:outline-none"
                  />
                  <span className="text-xs text-slate-400">m</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  보통 상한선 (≤)
                </label>
                <div className="flex items-center rounded-xl border border-slate-600 bg-slate-800 px-3 py-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="15"
                    value={waveMod}
                    onChange={(e) => setWaveMod(Number(e.target.value))}
                    className="w-full bg-transparent font-mono text-sm font-black text-white focus:outline-none"
                  />
                  <span className="text-xs text-slate-400">m</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400">
              * {waveGood}m 미만: 좋음 | {waveGood}~{waveMod}m: 보통 | {waveMod}m 초과: 나쁨
            </p>
          </div>

          <button
            type="submit"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-black text-slate-950 shadow-lg active:scale-95"
          >
            <Check className="h-4 w-4" />
            <span>설정 저장 및 판정 반영</span>
          </button>
        </form>
      </div>
    </div>
  );
}
