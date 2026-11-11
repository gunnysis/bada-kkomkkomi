import { useEffect, useRef } from 'react';
import {
  ArrowRight,
  Download,
} from 'lucide-react';
import type { NavPanelType } from '../../hooks/useAppRoute';

export type NotebookLaunchPreset = 'hazard' | 'all' | 'layers';

export interface HomeScreenProps {
  lastTriggeredCardId: 'notebook' | 'navigation' | null;
  onSelectFeatureCard: (target: 'notebook' | 'navigation') => void;
  onSelectNotebookPreset?: (preset: NotebookLaunchPreset) => void;
  onSelectNavigationPanel?: (panel: NavPanelType) => void;
  onOpenSettings?: (section?: 'thresholds' | 'guide' | 'sources') => void;
  isCustomThresholds?: boolean;
  hasActiveWorkspace?: boolean;
  activeWorkspaceSummary?: string;
  onResumeWorkspace?: () => void;
  hazardCount?: number;
  totalDockingCount?: number;
  totalPortsCount?: number;
  isOnline?: boolean;
  isStandalone: boolean;
  onInstallClick: () => void;
}

/**
 * 초기 접속 인트로 허브 (HomeScreen v2.4 — 미니멀 포스터 카드)
 * - 공식 국립공원공단 CI, 망원경 든 해양 레인저 꼬미, 240x180 정규화 4대 기능 카드 일러스트 아이콘을 유지합니다.
 * - 직원 사용성 극대화를 위해 각 카드 내부의 상단 배지 및 하단 다중 액션 버튼 바를 제거하고,
 *   원터치로 바로 주요 기능에 진입할 수 있는 깔끔한 포스터 카드 형태로 구성했습니다.
 */
export function HomeScreen({
  lastTriggeredCardId,
  onSelectFeatureCard,
  onSelectNotebookPreset,
  onSelectNavigationPanel,
  onOpenSettings,
  hasActiveWorkspace = false,
  activeWorkspaceSummary,
  onResumeWorkspace,
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
      className="fixed inset-0 z-[1200] flex min-h-dvh w-full flex-col justify-center overflow-y-auto bg-gradient-to-b from-[#bae6fd] via-[#7dd3fc] to-[#24a9e1] text-slate-900 select-none"
      style={{
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-3 py-2 sm:px-5 sm:py-3">
        {/* 상단 상태 유틸리티 바: 히어로 일러스트(꼬미 레인저 모자·로고)를 가리지 않도록 상단 우측에 독립 정렬 */}
        <div className="mb-1.5 flex items-center justify-between gap-1 px-0.5 sm:gap-2 sm:px-1">
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-white/85 bg-white/95 px-2 text-[10px] font-black whitespace-nowrap text-[#072a40] shadow-sm backdrop-blur-md min-[360px]:gap-1.5 min-[360px]:px-2.5 min-[360px]:text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#00854a]" />
            <span className="min-[360px]:hidden">한려해상 현장업무 PWA</span>
            <span className="hidden min-[360px]:inline">한려해상국립공원 현장업무 PWA</span>
          </span>

          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            {!isStandalone && (
              <button
                type="button"
                onClick={onInstallClick}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-white/85 bg-[#00854a] px-2 text-[10px] font-black whitespace-nowrap text-white shadow-sm transition hover:bg-[#047857] active:scale-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-slate-950 min-[360px]:px-2.5 min-[360px]:text-[11px]"
              >
                <Download className="h-3 w-3 shrink-0 stroke-[2.6]" aria-hidden="true" />
                <span>앱 설치</span>
              </button>
            )}
          </div>
        </div>

        {/* 상단 히어로 배너: 국립공원공단 공식 CI + 바다꼼꼬미 + 해양 레인저 꼬미 */}
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

        {/* 4대 주요 기능 카드 컨테이너: 히어로 배너와 직결되는 2x2 그리드 (미니멀 포스터 카드) */}
        <nav
          aria-label="주요 기능"
          className="relative z-10 -mt-3 overflow-hidden rounded-[2rem] border-4 border-white bg-white/96 p-2.5 shadow-2xl backdrop-blur-md min-[380px]:p-3 sm:p-4"
        >
          <div className="grid grid-cols-2 gap-2.5 min-[380px]:gap-3 sm:gap-3.5">
            {/* 카드 1 (활성): 꼬미의 바다수첩 */}
            <article
              aria-label="꼬미의 바다수첩"
              className="[container-type:inline-size] flex h-full flex-col rounded-3xl border-2 border-[#38bdf8] bg-gradient-to-b from-[#e0f4fe] via-[#ccecfc] to-[#98daf9] shadow-md transition hover:border-[#0066b3] hover:shadow-lg"
            >
              <button
                ref={notebookBtnRef}
                type="button"
                onClick={() => handleLaunchNotebook('hazard')}
                className="group flex min-h-36 w-full flex-1 flex-col items-center justify-center rounded-3xl px-2 py-4 text-center transition active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0066b3] sm:min-h-44 sm:py-5"
              >
                <div className="mb-2.5 flex h-20 w-full items-center justify-center sm:h-24">
                  <img
                    src={`${base}images/brand/icon_notebook_map_alpha.png`}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-auto object-contain transition-transform group-hover:scale-105"
                  />
                </div>

                <div className="flex w-full flex-col items-center">
                  <span className="text-[16px] leading-tight font-black tracking-tight whitespace-nowrap text-[#072a40] [text-wrap:balance] min-[380px]:text-[18px] sm:text-xl">
                    꼬미의 바다수첩
                  </span>
                  <span className="mt-1 flex min-h-[1.25rem] items-center justify-center text-[10.5px] leading-tight font-extrabold tracking-tight whitespace-nowrap text-[#0c3c56] min-[380px]:text-[11.5px] sm:text-xs">
                    해양정보 · 현장기록
                  </span>
                </div>
              </button>
            </article>

            {/* 카드 2 (활성): 바닷길 콕콕 */}
            <article
              aria-label="바닷길 콕콕"
              className="[container-type:inline-size] flex h-full flex-col rounded-3xl border-2 border-[#2dd4bf] bg-gradient-to-b from-[#e0fbf6] via-[#cbf6ee] to-[#8ce7d5] shadow-md transition hover:border-[#00854a] hover:shadow-lg"
            >
              <button
                ref={navigationBtnRef}
                type="button"
                onClick={() => handleLaunchNavigation('route')}
                className="group flex min-h-36 w-full flex-1 flex-col items-center justify-center rounded-3xl px-2 py-4 text-center transition active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#00854a] sm:min-h-44 sm:py-5"
              >
                <div className="mb-2.5 flex h-20 w-full items-center justify-center sm:h-24">
                  <img
                    src={`${base}images/brand/icon_navigation_clock_alpha.png`}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-auto object-contain transition-transform group-hover:scale-105"
                  />
                </div>

                <div className="flex w-full flex-col items-center">
                  <span className="text-[16px] leading-tight font-black tracking-tight whitespace-nowrap text-[#072a40] [text-wrap:balance] min-[380px]:text-[18px] sm:text-xl">
                    바닷길 콕콕
                  </span>
                  <span className="mt-1 flex min-h-[1.25rem] items-center justify-center text-[10.5px] leading-tight font-extrabold tracking-tight whitespace-nowrap text-[#0f403c] min-[380px]:text-[11.5px] sm:text-xs">
                    시간계산 · 날씨콕콕
                  </span>
                </div>
              </button>
            </article>

            {/* 카드 3 (출시 예정): 꼬미의 달력 */}
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="[container-type:inline-size] flex min-h-36 h-full cursor-not-allowed flex-col items-center justify-center rounded-3xl border-2 border-[#93c5fd] bg-gradient-to-b from-[#e8f2fe] via-[#dbeafe] to-[#b9d6fc] px-2 py-4 text-center shadow-sm sm:min-h-44 sm:py-5"
            >
              <div className="mb-2.5 flex h-20 w-full items-center justify-center sm:h-24">
                <img
                  src={`${base}images/brand/icon_calendar_boat_alpha.png`}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-auto object-contain"
                />
              </div>

              <div className="flex w-full flex-col items-center">
                <span className="text-[16px] leading-tight font-black tracking-tight whitespace-nowrap text-[#072a40] [text-wrap:balance] min-[380px]:text-[18px] sm:text-xl">
                  꼬미의 달력
                </span>
                <span className="mt-1 flex min-h-[1.25rem] items-center justify-center text-[10.5px] leading-tight font-extrabold tracking-tight whitespace-nowrap text-[#173354] min-[380px]:text-[11.5px] sm:text-xs">
                  운항일정 · 직원메모
                </span>
              </div>
            </button>

            {/* 카드 4 (활성): 설정 (3.4 기상 판정 기준 설정 · 이용 안내 · 데이터·기술 출처 확인) */}
            <article
              aria-label="설정"
              className="[container-type:inline-size] flex h-full flex-col rounded-3xl border-2 border-[#2dd4bf] bg-gradient-to-b from-[#e6fcf8] via-[#d2f7ef] to-[#98ebdc] shadow-md transition hover:border-[#0d9488] hover:shadow-lg"
            >
              <button
                type="button"
                onClick={() => onOpenSettings?.('thresholds')}
                className="group flex min-h-36 w-full flex-1 flex-col items-center justify-center rounded-3xl px-2 py-4 text-center transition active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0d9488] sm:min-h-44 sm:py-5"
              >
                <div className="mb-2.5 flex h-20 w-full items-center justify-center sm:h-24">
                  <img
                    src={`${base}images/brand/icon_settings_gear_alpha.png`}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-auto object-contain transition-transform group-hover:scale-105"
                  />
                </div>

                <div className="flex w-full flex-col items-center">
                  <span className="text-[16px] leading-tight font-black tracking-tight whitespace-nowrap text-[#072a40] [text-wrap:balance] min-[380px]:text-[18px] sm:text-xl">
                    설정
                  </span>
                  <span className="mt-1 flex min-h-[1.25rem] items-center justify-center text-[10.5px] leading-tight font-extrabold tracking-tight whitespace-nowrap text-[#0f403c] min-[380px]:text-[11.5px] sm:text-xs">
                    환경설정 · 이용안내
                  </span>
                </div>
              </button>
            </article>
          </div>
        </nav>

        {/* 이전 작업 세션이 열려 있을 때 원터치 복귀 배너 */}
        {hasActiveWorkspace && onResumeWorkspace && (
          <button
            type="button"
            onClick={onResumeWorkspace}
            className="knps-hud-surface mt-2.5 flex w-full items-center justify-between gap-2 rounded-2xl border-2 px-2.5 py-2 text-left text-[#003360] shadow-xl transition active:scale-[0.99] sm:gap-2.5 sm:px-3"
          >
            <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
              <img
                src={`${base}images/brand/bandali_thumbsup.png`}
                alt=""
                aria-hidden="true"
                className="h-9 w-9 shrink-0 rounded-xl bg-white/95 object-contain p-0.5 shadow sm:h-10 sm:w-10"
              />
              <div className="min-w-0">
                <span className="block text-[10px] font-black tracking-wider text-[#00846c] uppercase">
                  진행 중인 국립공원 해상 작업공간 보존됨
                </span>
                <span className="block text-xs leading-snug font-extrabold text-[#003360] [word-break:keep-all] sm:text-sm">
                  {activeWorkspaceSummary || '직전 지도 화면으로 이어서 돌아가기'}
                </span>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-[#00854a] to-[#0284c7] px-2.5 py-1.5 text-xs font-black whitespace-nowrap text-white shadow">
              <span>이어서 보기</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 stroke-[2.8]" />
            </span>
          </button>
        )}
      </main>
    </div>
  );
}
