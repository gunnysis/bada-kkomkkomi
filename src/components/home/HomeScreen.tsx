import { useEffect, useRef } from 'react';
import { ArrowRight, Download, Layers, Navigation, Waves, Wifi, WifiOff } from 'lucide-react';
import type { NavPanelType } from '../../hooks/useAppRoute';

export type NotebookLaunchPreset = 'hazard' | 'all' | 'layers';

export interface HomeScreenProps {
  lastTriggeredCardId: 'notebook' | 'navigation' | null;
  onSelectFeatureCard: (target: 'notebook' | 'navigation') => void;
  onSelectNotebookPreset?: (preset: NotebookLaunchPreset) => void;
  onSelectNavigationPanel?: (panel: NavPanelType) => void;
  hasActiveWorkspace?: boolean;
  activeWorkspaceSummary?: string;
  onResumeWorkspace?: () => void;
  hazardCount?: number;
  totalDockingCount?: number;
  totalPortsCount?: number;
  isOnline: boolean;
  isStandalone: boolean;
  onInstallClick: () => void;
}

/**
 * 초기 접속 인트로 허브 (HomeScreen v1.5)
 * - 시안(2x2 4개 카드)을 유지하면서 '꼬미의 바다수첩'과 '바닷길 콕콕'의 세부 기능으로 원터치 직행(Quick-Jump)할 수 있는 런처 칩을 제공합니다.
 * - 중첩 <button> 금지 웹 표준을 준수하기 위해 각 활성 카드는 <article> 컨테이너 내부에 대표 진입 <button>과 하단 직행 <button> 그룹을 분리 배치했습니다.
 */
export function HomeScreen({
  lastTriggeredCardId,
  onSelectFeatureCard,
  onSelectNotebookPreset,
  onSelectNavigationPanel,
  hasActiveWorkspace = false,
  activeWorkspaceSummary,
  onResumeWorkspace,
  hazardCount = 9,
  totalDockingCount = 55,
  totalPortsCount = 136,
  isOnline,
  isStandalone,
  onInstallClick,
}: HomeScreenProps) {
  const notebookBtnRef = useRef<HTMLButtonElement | null>(null);
  const navigationBtnRef = useRef<HTMLButtonElement | null>(null);

  // Workspace에서 Home으로 복귀했을 때 마지막 실행 카드로 초점(Focus) 복원
  useEffect(() => {
    if (lastTriggeredCardId === 'notebook') {
      notebookBtnRef.current?.focus({ preventScroll: true });
    } else if (lastTriggeredCardId === 'navigation') {
      navigationBtnRef.current?.focus({ preventScroll: true });
    }
  }, [lastTriggeredCardId]);

  const handleLaunchNotebook = (preset: NotebookLaunchPreset) => {
    if (onSelectNotebookPreset) {
      onSelectNotebookPreset(preset);
      return;
    }
    onSelectFeatureCard('notebook');
  };

  const handleLaunchNavigation = (panel: NavPanelType) => {
    if (onSelectNavigationPanel) {
      onSelectNavigationPanel(panel);
      return;
    }
    onSelectFeatureCard('navigation');
  };

  return (
    <div
      className="fixed inset-0 z-[1200] min-h-dvh w-full overflow-y-auto bg-gradient-to-b from-[#d1fae5] via-[#7dd3fc] to-[#063940] text-slate-900 select-none"
      style={{
        paddingTop: 'calc(var(--safe-top) + 0.75rem)',
        paddingBottom: 'calc(var(--safe-bottom) + 1.5rem)',
      }}
    >
      {/* 배경 장식용 한려해상국립공원 다도해 섬 능선(KNPS Green) · 태양(Amber) · 청정 바다(Blue) 파노라마 SVG (aria-hidden="true") */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden opacity-95"
      >
        <svg
          className="absolute top-3 left-0 w-full max-w-4xl opacity-80"
          viewBox="0 0 800 240"
          fill="none"
        >
          {/* 국립공원 상징 태양 광채 */}
          <circle cx="670" cy="64" r="54" fill="#fde68a" fillOpacity="0.45" />
          <circle cx="670" cy="64" r="34" fill="#f59e0b" fillOpacity="0.32" />
          {/* 구름 & 바닷새 */}
          <path
            d="M420 58c8-10 22-10 30 0 8-10 22-10 30 0"
            stroke="#ffffff"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M485 38c6-8 18-8 24 0 6-8 18-8 24 0"
            stroke="#ffffff"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="110" cy="80" r="45" fill="#ffffff" fillOpacity="0.5" />
          <circle cx="155" cy="75" r="55" fill="#ffffff" fillOpacity="0.55" />
        </svg>

        {/* 하단 다도해 녹색 섬 실루엣 & 청정 해역 물결 */}
        <svg
          className="absolute inset-x-0 bottom-0 h-44 w-full"
          viewBox="0 0 1200 220"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M0 150C140 105 260 95 410 142C560 185 730 92 920 128C1040 150 1130 120 1200 108V220H0V150Z"
            fill="#047857"
            fillOpacity="0.38"
          />
          <path
            d="M0 168C190 132 360 184 560 148C760 112 960 158 1200 134V220H0V168Z"
            fill="#0066b3"
            fillOpacity="0.45"
          />
          <path
            d="M0 188C240 168 480 204 740 180C960 160 1090 184 1200 176V220H0V188Z"
            fill="#061c24"
            fillOpacity="0.88"
          />
        </svg>
      </div>

      <main className="relative mx-auto flex w-full max-w-lg flex-col px-4 sm:px-6">
        {/* 상단 국립공원공단(KNPS) 공식 3원색 기관 배지 & 온라인/설치 상태 바 */}
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-600/30 bg-white/95 px-3 py-1.5 shadow-md backdrop-blur-md">
            <svg
              aria-hidden="true"
              className="h-6 w-7 shrink-0"
              viewBox="0 0 40 30"
              fill="none"
            >
              {/* KNPS 상징: 태양(Amber/Orange) + 산림(Green) + 해양(Blue) */}
              <circle cx="30" cy="7" r="4.5" fill="#f59e0b" />
              <path d="M16 3L3 17h26L16 3Z" fill="#00854a" />
              <path d="M12 17L23 6l12 11H12Z" fill="#0066b3" fillOpacity="0.9" />
              <path
                d="M3 20c5-2 10 2 16 0s11-2 18 0l-17 8-17-8Z"
                fill="#0284c7"
              />
            </svg>
            <div className="leading-tight">
              <div className="flex items-center gap-1">
                <span className="text-xs font-black tracking-tight text-[#052e2b]">
                  국립공원공단
                </span>
                <span className="rounded bg-emerald-700 px-1 py-0.2 text-[9px] font-extrabold text-white">
                  한려해상
                </span>
              </div>
              <span className="block text-[8px] font-extrabold tracking-wider text-[#0066b3]">
                KOREA NATIONAL PARK SERVICE
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {!isStandalone && (
              <button
                type="button"
                onClick={onInstallClick}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border-2 border-emerald-950/20 bg-gradient-to-r from-[#00854a] to-[#0d9488] px-3 py-1 text-xs font-black text-white shadow-md transition active:scale-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
              >
                <Download className="h-3.5 w-3.5 stroke-[2.6]" aria-hidden="true" />
                <span>앱 설치</span>
              </button>
            )}
            <div
              role="status"
              className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-extrabold shadow-sm ${
                isOnline
                  ? 'border-emerald-400/50 bg-[#062c28]/95 text-emerald-200'
                  : 'border-amber-400/70 bg-amber-950/95 text-amber-200'
              }`}
            >
              {isOnline ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              )}
              <span>{isOnline ? '온라인' : '오프라인'}</span>
            </div>
          </div>
        </div>

        {/* 히어로 영역: 타이틀 + 부제 + 국립공원 레인저 꼬미 캐릭터 일러스트 */}
        <section
          aria-labelledby="home-hero-title"
          className="relative mt-3 flex items-end justify-between gap-2 pt-1 pb-3 sm:mt-4"
        >
          <div className="z-10 flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/60 bg-gradient-to-r from-[#00854a] to-[#0066b3] px-3 py-0.5 text-[11px] font-black text-white shadow-sm">
              <span className="h-2 w-2 rounded-full bg-amber-300" />
              <span>해양국립공원 현장업무 지원 PWA</span>
            </div>
            <h1
              id="home-hero-title"
              className="mt-1.5 text-4xl font-black tracking-tight text-[#042f2e] drop-shadow-[0_2px_0_rgba(255,255,255,0.92)] sm:text-5xl"
            >
              바다꼼꼬미
            </h1>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-emerald-600/25 bg-white/95 px-3.5 py-1.5 shadow-md">
              <span className="h-2.5 w-1 rounded-full bg-[#00854a]" />
              <p className="text-xs font-black tracking-tight text-[#064e3b] sm:text-sm">
                우리 손안의 해양국립공원 업무수첩
              </p>
            </div>
          </div>

          {/* 망원경을 든 국립공원 레인저 꼬미 마스코트 벡터 일러스트 (장식용, aria-hidden="true") */}
          <div aria-hidden="true" className="relative z-10 shrink-0">
            <svg
              className="h-28 w-28 drop-shadow-xl sm:h-34 sm:w-34"
              viewBox="0 0 160 160"
              fill="none"
            >
              <ellipse
                cx="92"
                cy="48"
                rx="54"
                ry="22"
                transform="rotate(14 92 48)"
                fill="#f3e5ab"
                stroke="#064e3b"
                strokeWidth="4.5"
              />
              <circle
                cx="132"
                cy="38"
                r="14"
                fill="#334155"
                stroke="#064e3b"
                strokeWidth="4"
              />
              <path
                d="M52 38C58 14 114 14 128 46L52 38Z"
                fill="#fef3c7"
                stroke="#064e3b"
                strokeWidth="4.5"
              />
              {/* 국립공원공단 레인저 모자 그린-블루 리본 */}
              <path
                d="M52 38L127 46"
                stroke="#00854a"
                strokeWidth="6.5"
                strokeLinecap="round"
              />
              <circle cx="90" cy="31" r="5" fill="#00854a" stroke="#ffffff" strokeWidth="1.5" />
              <path
                d="M54 52C44 76 46 118 46 148H126C126 118 128 82 118 56C106 42 66 40 54 52Z"
                fill="#475569"
                stroke="#064e3b"
                strokeWidth="4.5"
              />
              <path
                d="M72 106C78 115 92 115 98 106"
                stroke="#ffffff"
                strokeWidth="7"
                strokeLinecap="round"
              />
              {/* 국립공원 레인저 안전 조끼 스트랩 */}
              <path
                d="M56 105L50 146M114 106L122 146"
                stroke="#10b981"
                strokeWidth="9"
                strokeLinecap="round"
              />
              <ellipse cx="80" cy="74" rx="11" ry="8.5" fill="#ffffff" />
              <ellipse cx="80" cy="71" rx="5" ry="3.8" fill="#0f172a" />
              <circle cx="96" cy="64" r="4.2" fill="#0f172a" />
              <circle cx="97.5" cy="62.5" r="1.5" fill="#ffffff" />
              <path
                d="M73 83C73 92 88 92 88 83H73Z"
                fill="#be123c"
                stroke="#0f172a"
                strokeWidth="2.8"
              />
              <path d="M76 88C78 86 83 86 85 88" stroke="#fda4af" strokeWidth="3" />
              <g transform="rotate(-10 42 78)">
                <rect
                  x="16"
                  y="66"
                  width="38"
                  height="18"
                  rx="8"
                  fill="#0066b3"
                  stroke="#0f172a"
                  strokeWidth="4"
                />
                <circle
                  cx="24"
                  cy="75"
                  r="7"
                  fill="#34d399"
                  stroke="#0f172a"
                  strokeWidth="3.5"
                />
                <circle
                  cx="42"
                  cy="75"
                  r="7"
                  fill="#38bdf8"
                  stroke="#0f172a"
                  strokeWidth="3.5"
                />
              </g>
              <path
                d="M24 44L32 50M34 32L39 41M18 56L28 58"
                stroke="#f59e0b"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </section>

        {/* 이전 작업 세션이 열려 있을 때 원터치 복귀 배너 */}
        {hasActiveWorkspace && onResumeWorkspace && (
          <button
            type="button"
            onClick={onResumeWorkspace}
            className="knps-hud-surface mb-3 flex w-full items-center justify-between gap-2 rounded-2xl border-2 px-3.5 py-2.5 text-left text-white shadow-xl transition active:scale-[0.99]"
          >
            <div className="min-w-0">
              <span className="block text-[10px] font-black tracking-wider text-emerald-300 uppercase">
                진행 중인 국립공원 해상 작업공간 보존됨
              </span>
              <span className="block truncate text-xs font-extrabold text-sky-100 sm:text-sm">
                {activeWorkspaceSummary || '직전 지도 화면으로 이어서 돌아가기'}
              </span>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 px-2.5 py-1 text-xs font-black text-slate-950 shadow">
              <span>이어서 보기</span>
              <ArrowRight className="h-3.5 w-3.5 stroke-[2.8]" />
            </span>
          </button>
        )}

        {/* 4대 주요 기능 카드 컨테이너 (KNPS 3원색 시그니처 상단 리본 + 2x2 그리드 + 원터치 직행 칩) */}
        <nav
          aria-label="주요 기능"
          className="relative overflow-hidden rounded-[2rem] border-4 border-white/95 bg-white/95 p-3.5 shadow-2xl backdrop-blur-md sm:p-5"
        >
          <div
            aria-hidden="true"
            className="knps-tricolor-bar absolute inset-x-0 top-0 h-1.5"
          />

          <div className="grid grid-cols-1 gap-3.5 pt-1 min-[350px]:grid-cols-2 sm:gap-4">
            {/* 카드 1 (활성): 꼬미의 바다수첩 (KNPS Marine Blue & Eco Green) */}
            <article
              aria-label="꼬미의 바다수첩"
              className="flex min-h-[192px] w-full flex-col justify-between overflow-hidden rounded-3xl border-2 border-emerald-500/45 bg-gradient-to-b from-[#ecfdf5] via-[#e0f2fe] to-[#bae6fd] p-2.5 shadow-md transition hover:border-[#00854a] hover:shadow-lg sm:p-3.5"
            >
              <button
                ref={notebookBtnRef}
                type="button"
                onClick={() => handleLaunchNotebook('hazard')}
                className="group flex flex-1 flex-col items-center justify-center rounded-2xl px-1.5 pt-1 pb-2 text-center transition active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#00854a]"
              >
                <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white shadow-sm">
                  🚨 위험주의 {hazardCount}곳 우선 표시
                </span>
                <svg
                  aria-hidden="true"
                  className="mb-1.5 h-13 w-16 transition-transform group-hover:scale-105 sm:h-15 sm:w-18"
                  viewBox="0 0 96 76"
                  fill="none"
                >
                  <path
                    d="M12 18L36 12L60 18L84 12V62L60 68L36 62L12 68V18Z"
                    fill="#ffffff"
                    stroke="#064e3b"
                    strokeWidth="4"
                    strokeLinejoin="round"
                  />
                  <path d="M16 21L35 16V58L16 63V21Z" fill="#34d399" />
                  <path d="M37 16L59 21V63L37 58V16Z" fill="#0ea5e9" />
                  <path d="M61 21L80 16V58L61 63V21Z" fill="#6ee7b7" />
                  <path d="M36 12V62M60 18V68" stroke="#064e3b" strokeWidth="3" />
                  <path
                    d="M68 6C59.7 6 53 12.7 53 21C53 32 68 46 68 46C68 46 83 32 83 21C83 12.7 76.3 6 68 6Z"
                    fill="#ef4444"
                    stroke="#ffffff"
                    strokeWidth="3"
                  />
                  <circle cx="68" cy="21" r="5.5" fill="#ffffff" />
                </svg>
                <span className="text-base font-black tracking-tight text-[#042f2e] sm:text-xl">
                  꼬미의 바다수첩
                </span>
                <span className="mt-0.5 text-[11px] leading-snug font-bold text-[#0f5132] sm:text-xs">
                  공원구역 · 갯바위 접안 · 현장정보
                </span>
              </button>

              <div
                role="group"
                aria-label="꼬미의 바다수첩 세부 기능 바로가기"
                className="grid grid-cols-3 gap-1 border-t border-emerald-600/25 pt-2"
              >
                <button
                  type="button"
                  onClick={() => handleLaunchNotebook('hazard')}
                  title="위험·암초 주의 9개소 집중 표시로 바로 이동"
                  className="flex min-h-8 items-center justify-center rounded-xl bg-red-600 px-1 py-1 text-[10px] font-black whitespace-nowrap text-white shadow-sm transition hover:bg-red-700 active:scale-95"
                >
                  🚨위험 {hazardCount}
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchNotebook('all')}
                  title="전체 55개 접안지 모두 보기로 바로 이동"
                  className="flex min-h-8 items-center justify-center rounded-xl border border-[#0066b3]/50 bg-white/95 px-1 py-1 text-[10px] font-black whitespace-nowrap text-[#0066b3] shadow-sm transition hover:bg-sky-50 active:scale-95"
                >
                  전체 {totalDockingCount}
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchNotebook('layers')}
                  title="국립공원 공간정보 레이어 관리 창 바로 열기"
                  className="flex min-h-8 items-center justify-center gap-0.5 rounded-xl bg-[#00854a] px-1 py-1 text-[10px] font-black whitespace-nowrap text-white shadow-sm transition hover:bg-[#047857] active:scale-95"
                >
                  <Layers className="h-2.5 w-2.5 shrink-0" />
                  <span>레이어</span>
                </button>
              </div>
            </article>

            {/* 카드 2 (활성): 바닷길 콕콕 (KNPS Ocean Blue & Sun Vitality) */}
            <article
              aria-label="바닷길 콕콕"
              className="flex min-h-[192px] w-full flex-col justify-between overflow-hidden rounded-3xl border-2 border-[#0066b3]/45 bg-gradient-to-b from-[#f0fdfa] via-[#ccfbf1] to-[#99f6e4] p-2.5 shadow-md transition hover:border-[#0066b3] hover:shadow-lg sm:p-3.5"
            >
              <button
                ref={navigationBtnRef}
                type="button"
                onClick={() => handleLaunchNavigation('route')}
                className="group flex flex-1 flex-col items-center justify-center rounded-2xl px-1.5 pt-1 pb-2 text-center transition active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0066b3]"
              >
                <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[#0066b3] px-2 py-0.5 text-[10px] font-black text-white shadow-sm">
                  ⚓ 항포구 {totalPortsCount}곳 · ECMWF 기상
                </span>
                <svg
                  aria-hidden="true"
                  className="mb-1.5 h-13 w-16 transition-transform group-hover:scale-105 sm:h-15 sm:w-18"
                  viewBox="0 0 96 76"
                  fill="none"
                >
                  <circle cx="68" cy="20" r="9" fill="#f59e0b" />
                  <path
                    d="M54 34H78C83.5 34 88 29.5 88 24C88 18.8 84 14.5 78.9 14.1C76.8 9.3 72 6 66.5 6C59 6 53 12 53 19.5"
                    fill="#ffffff"
                    stroke="#0066b3"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <rect
                    x="30"
                    y="8"
                    width="14"
                    height="6"
                    rx="2"
                    fill="#00854a"
                    stroke="#042f2e"
                    strokeWidth="3"
                  />
                  <circle
                    cx="37"
                    cy="40"
                    r="24"
                    fill="#ffffff"
                    stroke="#042f2e"
                    strokeWidth="5"
                  />
                  <path
                    d="M37 40L48 30"
                    stroke="#ea580c"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                  />
                  <circle cx="37" cy="40" r="4" fill="#00854a" />
                  <path
                    d="M52 52C58 47 66 47 72 52C78 57 86 57 90 52"
                    stroke="#0066b3"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M52 62C58 57 66 57 72 62C78 67 86 67 90 62"
                    stroke="#0d9488"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-base font-black tracking-tight text-[#042f2e] sm:text-xl">
                  바닷길 콕콕
                </span>
                <span className="mt-0.5 text-[11px] leading-snug font-bold text-[#0c4a6e] sm:text-xs">
                  실항로 시간계산 · 기상상태판정
                </span>
              </button>

              <div
                role="group"
                aria-label="바닷길 콕콕 세부 기능 바로가기"
                className="grid grid-cols-2 gap-1 border-t border-teal-500/35 pt-2"
              >
                <button
                  type="button"
                  onClick={() => handleLaunchNavigation('route')}
                  title="실항로 시간계산기로 바로 이동"
                  className="flex min-h-8 items-center justify-center gap-1 rounded-xl bg-[#0066b3] px-1.5 py-1 text-[10px] font-black whitespace-nowrap text-white shadow-sm transition hover:bg-[#0369a1] active:scale-95"
                >
                  <Navigation className="h-2.5 w-2.5 shrink-0" />
                  <span>시간계산</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchNavigation('weather')}
                  title="ECMWF 해상기상 판정 화면으로 바로 이동"
                  className="flex min-h-8 items-center justify-center gap-1 rounded-xl border border-[#00854a]/60 bg-white/95 px-1.5 py-1 text-[10px] font-black whitespace-nowrap text-[#042f2e] shadow-sm transition hover:bg-emerald-50 active:scale-95"
                >
                  <Waves className="h-2.5 w-2.5 shrink-0 text-[#00854a]" />
                  <span>기상판정</span>
                </button>
              </div>
            </article>

            {/* 카드 3 (추후 기능 개발 시 연결 예정 - 현재 클릭 무시/disabled): 꼬미의 달력 */}
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="relative flex min-h-[142px] w-full cursor-not-allowed flex-col items-center justify-center rounded-3xl border-2 border-emerald-200/80 bg-gradient-to-b from-[#f0fdf4] to-[#dcfce7] p-3 text-center opacity-75 saturate-50 shadow-sm sm:p-4"
            >
              <span className="absolute top-2.5 right-2.5 rounded-full bg-[#064e3b]/90 px-2 py-0.5 text-[10px] font-black text-amber-200">
                출시 예정
              </span>
              <svg
                aria-hidden="true"
                className="mb-1.5 h-13 w-16 sm:h-15 sm:w-18"
                viewBox="0 0 96 76"
                fill="none"
              >
                <rect
                  x="16"
                  y="14"
                  width="52"
                  height="48"
                  rx="8"
                  fill="#ffffff"
                  stroke="#00854a"
                  strokeWidth="4"
                />
                <path d="M16 26H68" stroke="#00854a" strokeWidth="4" />
                <rect x="26" y="8" width="6" height="12" rx="3" fill="#00854a" />
                <rect x="52" y="8" width="6" height="12" rx="3" fill="#00854a" />
                <rect x="24" y="33" width="8" height="7" rx="1.5" fill="#6ee7b7" />
                <rect x="38" y="33" width="8" height="7" rx="1.5" fill="#6ee7b7" />
                <rect x="52" y="33" width="8" height="7" rx="1.5" fill="#6ee7b7" />
                <rect x="24" y="45" width="8" height="7" rx="1.5" fill="#6ee7b7" />
                <rect x="38" y="45" width="8" height="7" rx="1.5" fill="#6ee7b7" />
                <path d="M52 54L84 54L78 66H56L52 54Z" fill="#064e3b" />
                <path d="M60 44H74L77 54H57L60 44Z" fill="#0066b3" />
              </svg>
              <span className="text-base font-black tracking-tight text-[#042f2e] sm:text-xl">
                꼬미의 달력
              </span>
              <span className="mt-1 text-[11px] leading-snug font-bold text-slate-700 sm:text-xs">
                운항불가 일정 · 직원 메모
              </span>
            </button>

            {/* 카드 4 (추후 기능 개발 시 연결 예정 - 현재 클릭 무시/disabled): 설정 */}
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="relative flex min-h-[142px] w-full cursor-not-allowed flex-col items-center justify-center rounded-3xl border-2 border-slate-300 bg-gradient-to-b from-[#f1f5f9] to-[#cbd5e1] p-3 text-center opacity-75 saturate-50 shadow-sm sm:p-4"
            >
              <span className="absolute top-2.5 right-2.5 rounded-full bg-[#064e3b]/90 px-2 py-0.5 text-[10px] font-black text-amber-200">
                출시 예정
              </span>
              <svg
                aria-hidden="true"
                className="mb-1.5 h-13 w-16 sm:h-15 sm:w-18"
                viewBox="0 0 96 76"
                fill="none"
              >
                <circle cx="48" cy="38" r="18" stroke="#334155" strokeWidth="10" />
                <path
                  d="M48 8V16M48 60V68M18 38H26M70 38H78M27 17L33 23M63 53L69 59M69 17L63 23M33 53L27 59"
                  stroke="#334155"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <circle cx="48" cy="38" r="8" fill="#f8fafc" />
              </svg>
              <span className="text-base font-black tracking-tight text-[#042f2e] sm:text-xl">
                설정
              </span>
              <span className="mt-1 text-[11px] leading-snug font-bold text-slate-700 sm:text-xs">
                앱 설정 · 이용 안내
              </span>
            </button>
          </div>
        </nav>

        {/* 하단 안내 푸터 */}
        <footer className="mt-3.5 text-center text-xs font-extrabold text-emerald-100 drop-shadow">
          국립공원공단 한려해상 · 통영·거제 {totalDockingCount}개 접안지 · {totalPortsCount}개 항포구/선착장 지원 [v1.8]
        </footer>
      </main>
    </div>
  );
}
