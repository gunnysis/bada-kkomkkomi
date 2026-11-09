import { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Anchor,
  ArrowRight,
  Download,
  Layers,
  Navigation,
  Waves,
  Wifi,
  WifiOff,
} from 'lucide-react';
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
 * 초기 접속 인트로 허브 (HomeScreen v1.8)
 * - public/dev/intro_design.png 시안 원본 에셋(공식 국립공원공단 CI, 망원경 든 해양 레인저 꼬미, 240x180 정규화 4대 기능 카드 일러스트 아이콘, 해저 산호/해초 푸터) 및
 *   국립공원공단 공식 대표 캐릭터(반달이 & 꼬미) 이미지를 그대로 사용합니다.
 * - 2x2 그리드 전 카드의 [상단 배지 → 아이콘 슬롯 → 타이틀 → 부제 → 하단 액션] 수직·수평 기준선을 1px 단위로 일치시켰습니다.
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
  const base = import.meta.env.BASE_URL;

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
      className="fixed inset-0 z-[1200] flex min-h-dvh w-full flex-col justify-between overflow-y-auto bg-gradient-to-b from-[#bae6fd] via-[#7dd3fc] to-[#24a9e1] text-slate-900 select-none"
      style={{
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-3 pt-2 pb-1 sm:px-5 sm:pt-3">
        {/* 상단 상태 유틸리티 바: 히어로 일러스트(꼬미 레인저 모자·로고)를 가리지 않도록 상단 우측에 독립 정렬 */}
        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/80 bg-white/90 px-2.5 text-[11px] font-black text-[#072a40] shadow-sm backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-[#00854a]" />
            <span>한려해상국립공원 현장업무 PWA</span>
          </span>

          <div className="flex items-center gap-1.5">
            {!isStandalone && (
              <button
                type="button"
                onClick={onInstallClick}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-white/80 bg-[#00854a] px-2.5 text-[11px] font-black text-white shadow-sm transition hover:bg-[#047857] active:scale-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
              >
                <Download className="h-3 w-3 stroke-[2.6]" aria-hidden="true" />
                <span>앱 설치</span>
              </button>
            )}
            <div
              role="status"
              className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-extrabold shadow-sm backdrop-blur-md ${
                isOnline
                  ? 'border-emerald-300/80 bg-[#062c28]/90 text-emerald-200'
                  : 'border-amber-300/90 bg-amber-950/90 text-amber-200'
              }`}
            >
              {isOnline ? (
                <Wifi className="h-3 w-3 text-emerald-400" aria-hidden="true" />
              ) : (
                <WifiOff className="h-3 w-3 text-amber-400" aria-hidden="true" />
              )}
              <span>{isOnline ? '온라인' : '오프라인'}</span>
            </div>
          </div>
        </div>

        {/* 상단 히어로 배너: public/dev/intro_design.png 원본 일러스트 (국립공원공단 공식 CI + 바다꼼꼬미 + 해양 레인저 꼬미) */}
        <section
          aria-labelledby="home-hero-title"
          className="relative overflow-hidden rounded-t-[2rem] border-x-4 border-t-4 border-white/95 shadow-lg"
        >
          <img
            src={`${base}images/brand/hero_banner.png`}
            alt="국립공원공단 바다꼼꼬미 — 우리 손안의 해양공원 업무수첩 (해양 레인저 꼬미)"
            className="block h-auto w-full object-cover"
            decoding="async"
          />
          <h1 id="home-hero-title" className="sr-only">
            바다꼼꼬미 — 국립공원공단 우리 손안의 해양공원 업무수첩
          </h1>
        </section>

        {/* 4대 주요 기능 카드 컨테이너: 히어로 배너와 직결되는 2x2 그리드 (전 카드 수직·수평 정렬 일치) */}
        <nav
          aria-label="주요 기능"
          className="relative z-10 -mt-3 overflow-hidden rounded-[2rem] border-4 border-white bg-white/95 p-3 shadow-2xl backdrop-blur-md sm:p-4"
        >
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
            {/* 카드 1 (활성): 꼬미의 바다수첩 */}
            <article
              aria-label="꼬미의 바다수첩"
              className="flex h-full flex-col justify-between overflow-hidden rounded-3xl border-2 border-[#7dd3fc] bg-gradient-to-b from-[#dff3fd] via-[#d2effc] to-[#9bdaf8] p-2.5 shadow-md transition hover:border-[#0066b3] hover:shadow-lg sm:p-3.5"
            >
              <button
                ref={notebookBtnRef}
                type="button"
                onClick={() => handleLaunchNotebook('hazard')}
                className="group flex flex-1 flex-col items-center justify-between rounded-2xl px-1 pt-0.5 pb-2 text-center transition active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0066b3]"
              >
                <span className="inline-flex h-5 items-center gap-1 rounded-full bg-red-600 px-2 text-[10px] leading-none font-black whitespace-nowrap text-white shadow-sm">
                  <AlertTriangle className="h-2.5 w-2.5 shrink-0 stroke-[2.6]" aria-hidden="true" />
                  <span>위험주의 {hazardCount}곳 우선</span>
                </span>

                <div className="my-1.5 flex h-16 w-full items-center justify-center sm:h-20">
                  <img
                    src={`${base}images/brand/icon_notebook_map_alpha.png`}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-auto object-contain transition-transform group-hover:scale-105"
                  />
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-base leading-tight font-black tracking-tight whitespace-nowrap text-[#072a40] sm:text-xl">
                    꼬미의 바다수첩
                  </span>
                  <span className="mt-1 flex min-h-[1.75rem] items-center justify-center text-[11px] leading-tight font-bold text-[#1e4e68] sm:min-h-[1.25rem] sm:text-xs">
                    해양지도 · 접안정보 · 현장정보
                  </span>
                </div>
              </button>

              <div
                role="group"
                aria-label="꼬미의 바다수첩 세부 기능 바로가기"
                className="grid grid-cols-3 gap-1 border-t border-[#0066b3]/20 pt-2"
              >
                <button
                  type="button"
                  onClick={() => handleLaunchNotebook('hazard')}
                  title="위험·암초 주의 9개소 집중 표시로 바로 이동"
                  className="flex h-8 items-center justify-center gap-0.5 rounded-xl bg-red-600 px-1 text-[10px] font-black whitespace-nowrap text-white shadow-sm transition hover:bg-red-700 active:scale-95"
                >
                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                  <span>위험 {hazardCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchNotebook('all')}
                  title="전체 55개 접안지 모두 보기로 바로 이동"
                  className="flex h-8 items-center justify-center rounded-xl border border-[#0066b3]/50 bg-white/95 px-1 text-[10px] font-black whitespace-nowrap text-[#0066b3] shadow-sm transition hover:bg-sky-50 active:scale-95"
                >
                  전체 {totalDockingCount}
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchNotebook('layers')}
                  title="국립공원 공간정보 레이어 관리 창 바로 열기"
                  className="flex h-8 items-center justify-center gap-0.5 rounded-xl bg-[#00854a] px-1 text-[10px] font-black whitespace-nowrap text-white shadow-sm transition hover:bg-[#047857] active:scale-95"
                >
                  <Layers className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                  <span>레이어</span>
                </button>
              </div>
            </article>

            {/* 카드 2 (활성): 바닷길 콕콕 */}
            <article
              aria-label="바닷길 콕콕"
              className="flex h-full flex-col justify-between overflow-hidden rounded-3xl border-2 border-[#5eead4] bg-gradient-to-b from-[#dcfaf5] via-[#ccf6ee] to-[#8ae6d4] p-2.5 shadow-md transition hover:border-[#00854a] hover:shadow-lg sm:p-3.5"
            >
              <button
                ref={navigationBtnRef}
                type="button"
                onClick={() => handleLaunchNavigation('route')}
                className="group flex flex-1 flex-col items-center justify-between rounded-2xl px-1 pt-0.5 pb-2 text-center transition active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#00854a]"
              >
                <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[#0066b3] px-2 text-[10px] leading-none font-black whitespace-nowrap text-white shadow-sm">
                  <Anchor className="h-2.5 w-2.5 shrink-0 stroke-[2.6]" aria-hidden="true" />
                  <span>항포구 {totalPortsCount}곳 · 기상</span>
                </span>

                <div className="my-1.5 flex h-16 w-full items-center justify-center sm:h-20">
                  <img
                    src={`${base}images/brand/icon_navigation_clock_alpha.png`}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-auto object-contain transition-transform group-hover:scale-105"
                  />
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-base leading-tight font-black tracking-tight whitespace-nowrap text-[#072a40] sm:text-xl">
                    바닷길 콕콕
                  </span>
                  <span className="mt-1 flex min-h-[1.75rem] items-center justify-center text-[11px] leading-tight font-bold text-[#134e4a] sm:min-h-[1.25rem] sm:text-xs">
                    시간계산 · 기상상태판정
                  </span>
                </div>
              </button>

              <div
                role="group"
                aria-label="바닷길 콕콕 세부 기능 바로가기"
                className="grid grid-cols-2 gap-1 border-t border-teal-600/25 pt-2"
              >
                <button
                  type="button"
                  onClick={() => handleLaunchNavigation('route')}
                  title="실항로 시간계산기로 바로 이동"
                  className="flex h-8 items-center justify-center gap-1 rounded-xl bg-[#0066b3] px-1.5 text-[10px] font-black whitespace-nowrap text-white shadow-sm transition hover:bg-[#0369a1] active:scale-95"
                >
                  <Navigation className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                  <span>시간계산</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchNavigation('weather')}
                  title="ECMWF 해상기상 판정 화면으로 바로 이동"
                  className="flex h-8 items-center justify-center gap-1 rounded-xl border border-[#00854a]/60 bg-white/95 px-1.5 text-[10px] font-black whitespace-nowrap text-[#042f2e] shadow-sm transition hover:bg-emerald-50 active:scale-95"
                >
                  <Waves className="h-2.5 w-2.5 shrink-0 text-[#00854a]" aria-hidden="true" />
                  <span>기상판정</span>
                </button>
              </div>
            </article>

            {/* 카드 3 (출시 예정): 꼬미의 달력 */}
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="flex h-full cursor-not-allowed flex-col items-center justify-between rounded-3xl border-2 border-[#bfdbfe] bg-gradient-to-b from-[#e4f0fe] via-[#dbeafe] to-[#b3d4fc] p-2.5 text-center opacity-85 shadow-sm sm:p-3.5"
            >
              <span className="inline-flex h-5 items-center rounded-full bg-[#072a40]/85 px-2.5 text-[10px] leading-none font-black text-sky-100">
                출시 예정
              </span>

              <div className="my-1.5 flex h-14 w-full items-center justify-center sm:h-16">
                <img
                  src={`${base}images/brand/icon_calendar_boat_alpha.png`}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-auto object-contain"
                />
              </div>

              <div className="flex flex-col items-center">
                <span className="text-base leading-tight font-black tracking-tight whitespace-nowrap text-[#072a40] sm:text-xl">
                  꼬미의 달력
                </span>
                <span className="mt-1 flex min-h-[1.5rem] items-center justify-center text-[11px] leading-tight font-bold text-[#1e3a5f] sm:text-xs">
                  운항불가 일정 · 직원 메모
                </span>
              </div>
            </button>

            {/* 카드 4 (출시 예정): 설정 */}
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="flex h-full cursor-not-allowed flex-col items-center justify-between rounded-3xl border-2 border-slate-300 bg-gradient-to-b from-[#e9eff8] via-[#dfe7f2] to-[#c2cfde] p-2.5 text-center opacity-85 shadow-sm sm:p-3.5"
            >
              <span className="inline-flex h-5 items-center rounded-full bg-[#072a40]/85 px-2.5 text-[10px] leading-none font-black text-sky-100">
                출시 예정
              </span>

              <div className="my-1.5 flex h-14 w-full items-center justify-center sm:h-16">
                <img
                  src={`${base}images/brand/icon_settings_gear_alpha.png`}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-auto object-contain"
                />
              </div>

              <div className="flex flex-col items-center">
                <span className="text-base leading-tight font-black tracking-tight whitespace-nowrap text-[#072a40] sm:text-xl">
                  설정
                </span>
                <span className="mt-1 flex min-h-[1.5rem] items-center justify-center text-[11px] leading-tight font-bold text-slate-700 sm:text-xs">
                  앱 설정 · 이용 안내
                </span>
              </div>
            </button>
          </div>
        </nav>

        {/* 이전 작업 세션이 열려 있을 때 원터치 복귀 배너 (히어로-카드 프레임 연결을 끊지 않도록 카드 프레임 하단에 배치) */}
        {hasActiveWorkspace && onResumeWorkspace && (
          <button
            type="button"
            onClick={onResumeWorkspace}
            className="knps-hud-surface mt-2.5 flex w-full items-center justify-between gap-2.5 rounded-2xl border-2 px-3 py-2 text-left text-white shadow-xl transition active:scale-[0.99]"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <img
                src={`${base}images/brand/bandali_thumbsup.png`}
                alt=""
                aria-hidden="true"
                className="h-10 w-10 shrink-0 rounded-xl bg-white/95 object-contain p-0.5 shadow"
              />
              <div className="min-w-0">
                <span className="block text-[10px] font-black tracking-wider text-emerald-300 uppercase">
                  진행 중인 국립공원 해상 작업공간 보존됨
                </span>
                <span className="block truncate text-xs font-extrabold text-sky-100 sm:text-sm">
                  {activeWorkspaceSummary || '직전 지도 화면으로 이어서 돌아가기'}
                </span>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-[#00854a] to-[#0284c7] px-2.5 py-1.5 text-xs font-black text-white shadow">
              <span>이어서 보기</span>
              <ArrowRight className="h-3.5 w-3.5 stroke-[2.8]" />
            </span>
          </button>
        )}
      </main>

      {/* 하단 해저 산호·물고기·불가사리 파노라마 푸터 (public/dev/intro_design.png 원본 하단 그래픽) */}
      <footer className="relative mt-1 w-full shrink-0 overflow-hidden">
        <img
          src={`${base}images/brand/footer_ocean.png`}
          alt=""
          aria-hidden="true"
          className="block h-18 w-full object-cover object-bottom sm:h-22"
        />
        <div className="absolute inset-x-0 bottom-1.5 px-2 text-center text-[11px] font-extrabold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] sm:text-xs">
          국립공원공단 한려해상 · 통영·거제 {totalDockingCount}개 접안지 · {totalPortsCount}개 항포구/선착장 지원 [v1.8]
        </div>
      </footer>
    </div>
  );
}
