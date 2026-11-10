import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Anchor,
  BookOpen,
  Check,
  Compass,
  Info,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Waves,
  Wind,
  X,
} from 'lucide-react';
import type { WeatherThresholds } from '../../types/weather';
import { SAFE_DEFAULT_THRESHOLDS } from '../../services/ecmwfWeatherService';
import {
  APP_RELEASE_DATE,
  APP_VERSION,
  APP_VERSION_DISPLAY,
  DATA_BASELINE_LABEL,
} from '../../config/appVersion';

export type SettingsInitialSection = 'thresholds' | 'guide';

interface WeatherThresholdSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  thresholds: WeatherThresholds;
  defaultThresholds?: WeatherThresholds;
  isCustomThresholds?: boolean;
  initialSection?: SettingsInitialSection;
  onSave: (thresholds: WeatherThresholds) => boolean | void;
  onReset?: () => void;
}

const KNOT_TO_MS = 0.514444;

function formatKnotsToMs(knots: number): string {
  if (!Number.isFinite(knots) || knots <= 0) return '0.0';
  return (knots * KNOT_TO_MS).toFixed(1);
}

export function WeatherThresholdSettings({
  isOpen,
  onClose,
  thresholds,
  defaultThresholds = SAFE_DEFAULT_THRESHOLDS,
  isCustomThresholds = false,
  initialSection = 'thresholds',
  onSave,
  onReset,
}: WeatherThresholdSettingsProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const guideSectionRef = useRef<HTMLElement | null>(null);

  const [windGood, setWindGood] = useState<number>(thresholds.windKnot.good);
  const [windMod, setWindMod] = useState<number>(thresholds.windKnot.moderate);
  const [waveGood, setWaveGood] = useState<number>(thresholds.waveMeter.good);
  const [waveMod, setWaveMod] = useState<number>(thresholds.waveMeter.moderate);

  // 네이티브 <dialog> Top-Layer 열기/닫기 동기화 ([RC-SET-01] 해결)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      if (initialSection === 'guide') {
        window.setTimeout(() => {
          guideSectionRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }, 80);
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen, initialSection]);

  if (!isOpen) return null;

  const windGoodNum = Number(windGood);
  const windModNum = Number(windMod);
  const waveGoodNum = Number(waveGood);
  const waveModNum = Number(waveMod);

  const windError: string | null =
    !Number.isFinite(windGoodNum) || !Number.isFinite(windModNum) || windGoodNum <= 0
      ? '풍속 기준치는 0보다 큰 숫자를 입력해야 합니다.'
      : windGoodNum >= windModNum
        ? `풍속 '좋음 상한선(${windGoodNum}kn)'은 '보통 상한선(${windModNum}kn)'보다 작아야 합니다.`
        : windModNum > 60
          ? '풍속 상한선은 60kn 이하로 설정하세요.'
          : null;

  const waveError: string | null =
    !Number.isFinite(waveGoodNum) || !Number.isFinite(waveModNum) || waveGoodNum <= 0
      ? '파고 기준치는 0보다 큰 숫자를 입력해야 합니다.'
      : waveGoodNum >= waveModNum
        ? `파고 '좋음 상한선(${waveGoodNum}m)'은 '보통 상한선(${waveModNum}m)'보다 작아야 합니다.`
        : waveModNum > 15
          ? '파고 상한선은 15m 이하로 설정하세요.'
          : null;

  const isFormValid = windError === null && waveError === null;

  const isMatchesDefault =
    windGoodNum === defaultThresholds.windKnot.good &&
    windModNum === defaultThresholds.windKnot.moderate &&
    waveGoodNum === defaultThresholds.waveMeter.good &&
    waveModNum === defaultThresholds.waveMeter.moderate;

  const handleResetToDefault = () => {
    setWindGood(defaultThresholds.windKnot.good);
    setWindMod(defaultThresholds.windKnot.moderate);
    setWaveGood(defaultThresholds.waveMeter.good);
    setWaveMod(defaultThresholds.waveMeter.moderate);
    onReset?.();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    const result = onSave({
      windKnot: { good: windGoodNum, moderate: windModNum },
      waveMeter: { good: waveGoodNum, moderate: waveModNum },
    });

    if (result !== false) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
      aria-labelledby="threshold-settings-title"
      className="bada-modal-dialog knps-modal-surface fixed inset-0 z-[1400] m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-3xl border-2 border-emerald-500/55 bg-[#061c24] p-0 text-white shadow-2xl"
    >
      {/* 상단 고정 헤더 */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-700/90 bg-[#061c24]/95 px-5 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-400/40 bg-teal-500/20 text-teal-300 shadow">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2
                id="threshold-settings-title"
                className="text-base font-black tracking-tight text-white sm:text-lg"
              >
                설정 및 이용 안내
              </h2>
              <span
                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black ${
                  isCustomThresholds || !isMatchesDefault
                    ? 'border-teal-400/60 bg-teal-950/90 text-teal-200'
                    : 'border-slate-600 bg-slate-800 text-slate-300'
                }`}
              >
                {isCustomThresholds || !isMatchesDefault ? '사용자 설정' : '표준 기본값'}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              기상 판정 기준은 기기에 자동 저장되어 다음 실행 시에도 유지됩니다
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="설정 창 닫기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-white transition hover:border-slate-400 active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-5 px-5 pt-4 pb-6">
        {/* 섹션 1: 바닷길 콕콕 풍속·파고 판정 기준 설정 */}
        <section aria-labelledby="weather-threshold-section-title">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <h3
                id="weather-threshold-section-title"
                className="text-sm font-black tracking-tight text-white"
              >
                바닷길 콕콕 기상 판정 기준 설정
              </h3>
            </div>
            <button
              type="button"
              onClick={handleResetToDefault}
              disabled={isMatchesDefault && !isCustomThresholds}
              title="풍속(14/20kn) 및 파고(1.0/1.8m) 표준 기본값으로 복원"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800/90 px-2.5 py-1 text-xs font-extrabold text-sky-300 transition hover:border-sky-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>기본값 복원</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
            {/* 1-1. 풍속 판정 기준 (<fieldset> + <legend>) */}
            <fieldset className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3.5 space-y-3">
              <legend className="flex items-center gap-1.5 px-1 text-xs font-black text-sky-300">
                <Wind className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                <span>풍속 (knots) 판정 기준 (ECMWF IFS 10m)</span>
              </legend>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="wind-good-input"
                    className="mb-1 block text-xs font-bold text-slate-300"
                  >
                    좋음 상한선 (&lt;)
                  </label>
                  <div
                    className={`flex items-center rounded-xl border bg-slate-800 px-3 py-2 ${
                      windError ? 'border-red-400' : 'border-slate-600 focus-within:border-sky-400'
                    }`}
                  >
                    <input
                      id="wind-good-input"
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="1"
                      max="50"
                      value={windGood}
                      aria-invalid={windError ? true : undefined}
                      aria-describedby={windError ? 'wind-threshold-error' : undefined}
                      onChange={(e) => setWindGood(Number(e.target.value))}
                      className="w-full bg-transparent font-mono text-base font-black text-white focus:outline-none"
                    />
                    <span className="ml-1 text-xs font-bold text-slate-300">kn</span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] font-bold text-sky-300/90">
                    ≈ {formatKnotsToMs(windGoodNum)} m/s 미만
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="wind-moderate-input"
                    className="mb-1 block text-xs font-bold text-slate-300"
                  >
                    보통 상한선 (≤)
                  </label>
                  <div
                    className={`flex items-center rounded-xl border bg-slate-800 px-3 py-2 ${
                      windError ? 'border-red-400' : 'border-slate-600 focus-within:border-sky-400'
                    }`}
                  >
                    <input
                      id="wind-moderate-input"
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="1"
                      max="60"
                      value={windMod}
                      aria-invalid={windError ? true : undefined}
                      aria-describedby={windError ? 'wind-threshold-error' : undefined}
                      onChange={(e) => setWindMod(Number(e.target.value))}
                      className="w-full bg-transparent font-mono text-base font-black text-white focus:outline-none"
                    />
                    <span className="ml-1 text-xs font-bold text-slate-300">kn</span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] font-bold text-slate-300">
                    ≈ {formatKnotsToMs(windModNum)} m/s 이하
                  </p>
                </div>
              </div>

              {windError ? (
                <div
                  id="wind-threshold-error"
                  role="alert"
                  className="flex items-start gap-1.5 rounded-xl border border-red-500/60 bg-red-950/80 px-2.5 py-2 text-xs font-bold text-red-200"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
                  <span>{windError}</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] font-extrabold">
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/60 px-1.5 py-1 text-emerald-300">
                    좋음: &lt;{windGoodNum}kn
                  </div>
                  <div className="rounded-lg border border-slate-500/50 bg-slate-800/90 px-1.5 py-1 text-slate-200">
                    보통: {windGoodNum}~{windModNum}kn
                  </div>
                  <div className="rounded-lg border border-red-500/40 bg-red-950/60 px-1.5 py-1 text-red-300">
                    나쁨: &gt;{windModNum}kn
                  </div>
                </div>
              )}
            </fieldset>

            {/* 1-2. 파고 판정 기준 (<fieldset> + <legend>) */}
            <fieldset className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3.5 space-y-3">
              <legend className="flex items-center gap-1.5 px-1 text-xs font-black text-teal-300">
                <Waves className="h-3.5 w-3.5 text-teal-400" aria-hidden="true" />
                <span>유의파고 (m) 판정 기준 (ECMWF WAM)</span>
              </legend>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="wave-good-input"
                    className="mb-1 block text-xs font-bold text-slate-300"
                  >
                    좋음 상한선 (&lt;)
                  </label>
                  <div
                    className={`flex items-center rounded-xl border bg-slate-800 px-3 py-2 ${
                      waveError ? 'border-red-400' : 'border-slate-600 focus-within:border-teal-400'
                    }`}
                  >
                    <input
                      id="wave-good-input"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0.1"
                      max="10"
                      value={waveGood}
                      aria-invalid={waveError ? true : undefined}
                      aria-describedby={waveError ? 'wave-threshold-error' : undefined}
                      onChange={(e) => setWaveGood(Number(e.target.value))}
                      className="w-full bg-transparent font-mono text-base font-black text-white focus:outline-none"
                    />
                    <span className="ml-1 text-xs font-bold text-slate-300">m</span>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="wave-moderate-input"
                    className="mb-1 block text-xs font-bold text-slate-300"
                  >
                    보통 상한선 (≤)
                  </label>
                  <div
                    className={`flex items-center rounded-xl border bg-slate-800 px-3 py-2 ${
                      waveError ? 'border-red-400' : 'border-slate-600 focus-within:border-teal-400'
                    }`}
                  >
                    <input
                      id="wave-moderate-input"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0.1"
                      max="15"
                      value={waveMod}
                      aria-invalid={waveError ? true : undefined}
                      aria-describedby={waveError ? 'wave-threshold-error' : undefined}
                      onChange={(e) => setWaveMod(Number(e.target.value))}
                      className="w-full bg-transparent font-mono text-base font-black text-white focus:outline-none"
                    />
                    <span className="ml-1 text-xs font-bold text-slate-300">m</span>
                  </div>
                </div>
              </div>

              {waveError ? (
                <div
                  id="wave-threshold-error"
                  role="alert"
                  className="flex items-start gap-1.5 rounded-xl border border-red-500/60 bg-red-950/80 px-2.5 py-2 text-xs font-bold text-red-200"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
                  <span>{waveError}</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] font-extrabold">
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/60 px-1.5 py-1 text-emerald-300">
                    좋음: &lt;{waveGoodNum}m
                  </div>
                  <div className="rounded-lg border border-slate-500/50 bg-slate-800/90 px-1.5 py-1 text-slate-200">
                    보통: {waveGoodNum}~{waveModNum}m
                  </div>
                  <div className="rounded-lg border border-red-500/40 bg-red-950/60 px-1.5 py-1 text-red-300">
                    나쁨: &gt;{waveModNum}m
                  </div>
                </div>
              )}
            </fieldset>

            <button
              type="submit"
              disabled={!isFormValid}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-sky-400 py-3 text-sm font-black text-slate-950 shadow-lg transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Check className="h-4 w-4 stroke-[2.8]" aria-hidden="true" />
              <span>기상 기준 저장 및 즉시 반영</span>
            </button>
          </form>
        </section>

        {/* 섹션 2: 간단한 이용 안내 (핵심 기능 3단계 가이드) */}
        <section
          ref={guideSectionRef}
          aria-labelledby="usage-guide-section-title"
          className="border-t border-slate-700/80 pt-4"
        >
          <div className="mb-2.5 flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h3
              id="usage-guide-section-title"
              className="text-sm font-black tracking-tight text-white"
            >
              간단한 이용 안내
            </h3>
          </div>

          <div className="space-y-2.5">
            <div className="rounded-2xl border border-slate-700/90 bg-slate-900/80 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-xs font-black text-sky-300">
                  1
                </span>
                <Anchor className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                <span className="text-xs font-black text-white">
                  꼬미의 바다수첩 (접안지 55개소 · 공간 레이어)
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                한려해상(통영·거제) 주요 접안지의 암초·수심 위험요소와 현장 사진, 3D 로드뷰를 확인합니다. 기본으로 <strong className="text-red-300">위험주의(적색)</strong> 지점이 우선 표시되며, 상단 <strong className="text-emerald-300">[+ 등급 선택]</strong>에서 전체 등급을 켤 수 있습니다.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700/90 bg-slate-900/80 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-xs font-black text-teal-300">
                  2
                </span>
                <Compass className="h-4 w-4 shrink-0 text-teal-400" aria-hidden="true" />
                <span className="text-xs font-black text-white">
                  바닷길 콕콕 (실항로 시간계산 · 해상기상 판정)
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                136개 항포구·선착장 간 육지·섬을 우회하는 해상 실항로 거리·소요시간을 계산합니다. 구간 카드를 탭하면 해당 구간이 자동 확대되며, 설정한 풍속·파고 기준치로 48시간 기상 신호등(좋음·보통·나쁨)을 즉시 판정합니다.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700/90 bg-slate-900/80 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-xs font-black text-emerald-300">
                  3
                </span>
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span className="text-xs font-black text-white">
                  현장 기록 & 오프라인 자동 보존
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                상괭이 목격 좌표·개체수 기록과 기상 판정 기준은 기기 내부에 자동 저장되어 해상 통신 음영지역(오프라인)이나 앱 재실행 시에도 그대로 유지됩니다.
              </p>
            </div>
          </div>
        </section>

        {/* 섹션 3: 앱 버전 및 데이터 기준 확인 */}
        <section
          aria-labelledby="app-version-section-title"
          className="rounded-2xl border border-emerald-500/35 bg-slate-950/90 p-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Info className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <h3
                id="app-version-section-title"
                className="text-xs font-black tracking-tight text-emerald-300"
              >
                앱 버전 및 데이터 기준
              </h3>
            </div>
            <span className="rounded-lg border border-emerald-400/50 bg-emerald-950 px-2 py-0.5 font-mono text-xs font-black text-emerald-200">
              {APP_VERSION_DISPLAY} ({APP_VERSION} · {APP_RELEASE_DATE})
            </span>
          </div>
          <p className="mt-1.5 text-[11px] font-bold text-slate-300">
            {DATA_BASELINE_LABEL}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            국립공원공단 한려해상국립공원 해양 현장업무 지원 PWA
          </p>
        </section>
      </div>
    </dialog>
  );
}
