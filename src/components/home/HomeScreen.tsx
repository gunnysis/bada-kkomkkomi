import { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Anchor,
  ArrowRight,
  BookOpen,
  Database,
  Download,
  Layers,
  Navigation,
  SlidersHorizontal,
  Waves,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { NavPanelType } from '../../hooks/useAppRoute';
import { APP_VERSION_DISPLAY, DATA_SOURCE_SHORT_BADGE } from '../../config/appVersion';

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
  isOnline: boolean;
  isStandalone: boolean;
  onInstallClick: () => void;
}

/**
 * 초기 접속 인트로 허브 (HomeScreen v2.1)
 * - 공식 국립공원공단 CI, 망원경 든 해양 레인저 꼬미, 240x180 정규화 4대 기능 카드 일러스트 아이콘, 해저 산호/해초 푸터 및
 *   국립공원공단 공식 대표 캐릭터(반달이 & 꼬미) 이미지를 그대로 사용합니다.
 * - 2x2 그리드 전 카드의 [상단 배지 → 아이콘 슬롯 → 타이틀 → 부제 → 하단 액션] 수직·수평 기준선을 1px 단위로 일치시켰습니다.
 */
export function HomeScreen({
  lastTriggeredCardId,
  onSelectFeatureCard,
  onSelectNotebookPreset,
  onSelectNavigationPanel,
  onOpenSettings,
  isCustomThresholds = false,
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
            <div
              role="status"
              className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-extrabold whitespace-nowrap shadow-sm backdrop-blur-md min-[360px]:px-2.5 min-[360px]:text-[11px] ${
                isOnline
                  ? 'border-emerald-300/85 bg-[#062c28]/92 text-emerald-200'
                  : 'border-amber-300/90 bg-amber-950/92 text-amber-200'
              }`}
            >
              {isOnline ? (
                <Wifi className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
              ) : (
                <WifiOff className="h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
              )}
              <span>{isOnline ? '온라인' : '오프라인'}</span>
            </div>
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

        {/* 4대 주요 기능 카드 컨테이너: 히어로 배너와 직결되는 2x2 그리드 (전 카드 수직·수평 정렬 1px 단위 일치) */}
        <nav
          aria-label="주요 기능"
          className="relative z-10 -mt-3 overflow-hidden rounded-[2rem] border-4 border-white bg-white/96 p-2.5 shadow-2xl backdrop-blur-md min-[380px]:p-3 sm:p-4"
        >
          <div className="grid grid-cols-2 gap-2 min-[380px]:gap-2.5 sm:gap-3.5">
            {/* 카드 1 (활성): 꼬미의 바다수첩 */}
            <article
              aria-label="꼬미의 바다수첩"
              className="[container-type:inline-size] flex h-full flex-col justify-between rounded-3xl border-2 border-[#38bdf8] bg-gradient-to-b from-[#e0f4fe] via-[#ccecfc] to-[#98daf9] p-2 shadow-md transition hover:border-[#0066b3] hover:shadow-lg min-[380px]:p-2.5 sm:p-3.5"
            >
              <button
                ref={notebookBtnRef}
                type="button"
                onClick={() => handleLaunchNotebook('hazard')}
                className="group flex flex-1 flex-col items-center justify-between rounded-2xl px-0.5 pt-0.5 pb-2 text-center transition active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0066b3]"
              >
                <span className="inline-flex h-5.5 items-center gap-1 rounded-full bg-red-600 px-2 text-[9.5px] leading-none font-black whitespace-nowrap text-white shadow-sm min-[360px]:px-2.5 min-[360px]:text-[10px] min-[380px]:text-[10.5px]">
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

                <div className="flex w-full flex-col items-center">
                  <span className="text-[15.5px] leading-tight font-black tracking-tight whitespace-nowrap text-[#072a40] [text-wrap:balance] min-[380px]:text-[17px] sm:text-xl">
                    꼬미의 바다수첩
                  </span>
                  <span className="mt-1 flex min-h-[1.25rem] items-center justify-center text-[10px] leading-tight font-extrabold tracking-tight whitespace-nowrap text-[#0c3c56] min-[360px]:text-[10.5px] min-[380px]:text-[11px] sm:text-xs">
                    해양지도 · 접안 · 현장정보
                  </span>
                </div>
              </button>

              <div
                role="group"
                aria-label="꼬미의 바다수첩 세부 기능 바로가기"
                className="grid grid-cols-3 gap-1 border-t border-[#0066b3]/25 pt-2"
              >
                <button
                  type="button"
                  onClick={() => handleLaunchNotebook('hazard')}
                  title="위험·암초 주의 9개소 집중 표시로 바로 이동"
                  className="flex min-h-10 min-w-0 items-center justify-center gap-0.5 rounded-xl bg-red-600 px-0.5 py-1 text-[9.5px] font-black tracking-tight whitespace-nowrap text-white shadow-sm transition hover:bg-red-700 active:scale-95 min-[360px]:px-1 min-[360px]:text-[11px] sm:min-h-11 sm:gap-1 sm:text-xs"
                >
                  <AlertTriangle className="hidden h-3 w-3 shrink-0 min-[420px]:inline" aria-hidden="true" />
                  <span>위험 {hazardCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchNotebook('all')}
                  title="전체 55개 접안지 모두 보기로 바로 이동"
                  className="flex min-h-10 min-w-0 items-center justify-center rounded-xl border border-[#0066b3]/55 bg-white px-0.5 py-1 text-[9.5px] font-black tracking-tight whitespace-nowrap text-[#00508f] shadow-sm transition hover:bg-sky-50 active:scale-95 min-[360px]:px-1 min-[360px]:text-[11px] sm:min-h-11 sm:text-xs"
                >
                  <span>전체 {totalDockingCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchNotebook('layers')}
                  title="국립공원 공간정보 레이어 관리 창 바로 열기"
                  className="flex min-h-10 min-w-0 items-center justify-center gap-0.5 rounded-xl bg-[#00854a] px-0.5 py-1 text-[9.5px] font-black tracking-tight whitespace-nowrap text-white shadow-sm transition hover:bg-[#047857] active:scale-95 min-[360px]:px-1 min-[360px]:text-[11px] sm:min-h-11 sm:gap-1 sm:text-xs"
                >
                  <Layers className="hidden h-3 w-3 shrink-0 min-[420px]:inline" aria-hidden="true" />
                  <span>레이어</span>
                </button>
              </div>
            </article>

            {/* 카드 2 (활성): 바닷길 콕콕 */}
            <article
              aria-label="바닷길 콕콕"
              className="[container-type:inline-size] flex h-full flex-col justify-between rounded-3xl border-2 border-[#2dd4bf] bg-gradient-to-b from-[#e0fbf6] via-[#cbf6ee] to-[#8ce7d5] p-2 shadow-md transition hover:border-[#00854a] hover:shadow-lg min-[380px]:p-2.5 sm:p-3.5"
            >
              <button
                ref={navigationBtnRef}
                type="button"
                onClick={() => handleLaunchNavigation('route')}
                className="group flex flex-1 flex-col items-center justify-between rounded-2xl px-0.5 pt-0.5 pb-2 text-center transition active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#00854a]"
              >
                <span className="inline-flex h-5.5 items-center gap-1 rounded-full bg-[#0066b3] px-2 text-[9.5px] leading-none font-black whitespace-nowrap text-white shadow-sm min-[360px]:px-2.5 min-[360px]:text-[10px] min-[380px]:text-[10.5px]">
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

                <div className="flex w-full flex-col items-center">
                  <span className="text-[15.5px] leading-tight font-black tracking-tight whitespace-nowrap text-[#072a40] [text-wrap:balance] min-[380px]:text-[17px] sm:text-xl">
                    바닷길 콕콕
                  </span>
                  <span className="mt-1 flex min-h-[1.25rem] items-center justify-center text-[10px] leading-tight font-extrabold tracking-tight whitespace-nowrap text-[#0f403c] min-[360px]:text-[10.5px] min-[380px]:text-[11px] sm:text-xs">
                    시간계산 · 기상상태판정
                  </span>
                </div>
              </button>

              <div
                role="group"
                aria-label="바닷길 콕콕 세부 기능 바로가기"
                className="grid grid-cols-2 gap-1 border-t border-teal-700/25 pt-2"
              >
                <button
                  type="button"
                  onClick={() => handleLaunchNavigation('route')}
                  title="실항로 시간계산기로 바로 이동"
                  className="flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-xl bg-[#0066b3] px-1 py-1 text-[9.5px] font-black tracking-tight whitespace-nowrap text-white shadow-sm transition hover:bg-[#0369a1] active:scale-95 min-[360px]:px-1.5 min-[360px]:text-[11px] sm:min-h-11 sm:text-xs"
                >
                  <Navigation className="hidden h-3 w-3 shrink-0 min-[360px]:inline" aria-hidden="true" />
                  <span>시간계산</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchNavigation('weather')}
                  title="ECMWF 해상기상 판정 화면으로 바로 이동"
                  className="flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-xl border border-[#00854a]/65 bg-white px-1 py-1 text-[9.5px] font-black tracking-tight whitespace-nowrap text-[#042f2e] shadow-sm transition hover:bg-emerald-50 active:scale-95 min-[360px]:px-1.5 min-[360px]:text-[11px] sm:min-h-11 sm:text-xs"
                >
                  <Waves className="hidden h-3 w-3 shrink-0 text-[#00854a] min-[360px]:inline" aria-hidden="true" />
                  <span>기상판정</span>
                </button>
              </div>
            </article>

            {/* 카드 3 (출시 예정): 꼬미의 달력 */}
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="[container-type:inline-size] flex h-full cursor-not-allowed flex-col justify-between rounded-3xl border-2 border-[#93c5fd] bg-gradient-to-b from-[#e8f2fe] via-[#dbeafe] to-[#b9d6fc] p-2 text-center shadow-sm min-[380px]:p-2.5 sm:p-3.5"
            >
              <div className="flex flex-1 flex-col items-center justify-between px-0.5 pt-0.5 pb-2">
                <span className="inline-flex h-5.5 items-center rounded-full bg-[#0f2f4a] px-2.5 text-[9.5px] leading-none font-black whitespace-nowrap text-sky-100 shadow-xs min-[360px]:text-[10px] min-[380px]:text-[10.5px]">
                  출시 예정
                </span>

                <div className="my-1.5 flex h-16 w-full items-center justify-center sm:h-20">
                  <img
                    src={`${base}images/brand/icon_calendar_boat_alpha.png`}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-auto object-contain"
                  />
                </div>

                <div className="flex w-full flex-col items-center">
                  <span className="text-[15.5px] leading-tight font-black tracking-tight whitespace-nowrap text-[#072a40] [text-wrap:balance] min-[380px]:text-[17px] sm:text-xl">
                    꼬미의 달력
                  </span>
                  <span className="mt-1 flex min-h-[1.25rem] items-center justify-center text-[10px] leading-tight font-extrabold tracking-tight whitespace-nowrap text-[#173354] min-[360px]:text-[10.5px] min-[380px]:text-[11px] sm:text-xs">
                    운항불가 일정 · 직원 메모
                  </span>
                </div>
              </div>

              <div className="border-t border-[#0066b3]/25 pt-2">
                <span className="flex min-h-10 w-full items-center justify-center rounded-xl border border-[#0066b3]/35 bg-white/85 px-1 py-1 text-[9.5px] font-black whitespace-nowrap text-[#0f2f4a] shadow-2xs min-[360px]:px-2 min-[360px]:text-[11px] sm:min-h-11 sm:text-xs">
                  차기 업데이트 지원 예정
                </span>
              </div>
            </button>

            {/* 카드 4 (활성): 설정 (3.4 기상 판정 기준 설정 · 이용 안내 · 데이터·기술 출처 확인) */}
            <article
              aria-label="설정"
              className="[container-type:inline-size] flex h-full flex-col justify-between rounded-3xl border-2 border-[#2dd4bf] bg-gradient-to-b from-[#e6fcf8] via-[#d2f7ef] to-[#98ebdc] p-2 shadow-md transition hover:border-[#0d9488] hover:shadow-lg min-[380px]:p-2.5 sm:p-3.5"
            >
              <button
                type="button"
                onClick={() => onOpenSettings?.('thresholds')}
                className="group flex flex-1 flex-col items-center justify-between rounded-2xl px-0.5 pt-0.5 pb-2 text-center transition active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0d9488]"
              >
                <span className="inline-flex h-5.5 items-center gap-1 rounded-full bg-[#0f766e] px-2 text-[9.5px] leading-none font-black whitespace-nowrap text-white shadow-sm min-[360px]:px-2.5 min-[360px]:text-[10px] min-[380px]:text-[10.5px]">
                  <SlidersHorizontal className="h-2.5 w-2.5 shrink-0 stroke-[2.6]" aria-hidden="true" />
                  <span>{isCustomThresholds ? '사용자 기준 적용중' : '기상기준 · 출처안내'}</span>
                </span>

                <div className="my-1.5 flex h-16 w-full items-center justify-center sm:h-20">
                  <img
                    src={`${base}images/brand/icon_settings_gear_alpha.png`}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-auto object-contain transition-transform group-hover:scale-105"
                  />
                </div>

                <div className="flex w-full flex-col items-center">
                  <span className="text-[15.5px] leading-tight font-black tracking-tight whitespace-nowrap text-[#072a40] [text-wrap:balance] min-[380px]:text-[17px] sm:text-xl">
                    설정
                  </span>
                  <span className="mt-1 flex min-h-[1.25rem] items-center justify-center text-[10px] leading-tight font-extrabold tracking-tight whitespace-nowrap text-[#0f403c] min-[360px]:text-[10.5px] min-[380px]:text-[11px] sm:text-xs">
                    기상기준 · 이용안내 · 출처
                  </span>
                </div>
              </button>

              <div
                role="group"
                aria-label="설정 세부 기능 바로가기"
                className="grid grid-cols-3 gap-1 border-t border-teal-700/25 pt-2"
              >
                <button
                  type="button"
                  onClick={() => onOpenSettings?.('thresholds')}
                  title="바닷길 콕콕 풍속·파고 판정 기준 설정 열기"
                  className="flex min-h-10 min-w-0 items-center justify-center gap-0.5 rounded-xl bg-[#0f766e] px-0.5 py-1 text-[9.5px] font-black tracking-tight whitespace-nowrap text-white shadow-sm transition hover:bg-[#0d9488] active:scale-95 min-[360px]:px-1 min-[360px]:text-[11px] sm:min-h-11 sm:gap-1 sm:text-xs"
                >
                  <SlidersHorizontal className="hidden h-3 w-3 shrink-0 min-[420px]:inline" aria-hidden="true" />
                  <span>기상기준</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSettings?.('guide')}
                  title="앱 이용 안내 열기"
                  className="flex min-h-10 min-w-0 items-center justify-center gap-0.5 rounded-xl border border-[#0f766e]/65 bg-white px-0.5 py-1 text-[9.5px] font-black tracking-tight whitespace-nowrap text-[#042f2e] shadow-sm transition hover:bg-teal-50 active:scale-95 min-[360px]:px-1 min-[360px]:text-[11px] sm:min-h-11 sm:gap-1 sm:text-xs"
                >
                  <BookOpen className="hidden h-3 w-3 shrink-0 text-[#0f766e] min-[420px]:inline" aria-hidden="true" />
                  <span>이용안내</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSettings?.('sources')}
                  title="공공데이터·해양기상·지도·알고리즘 출처 확인 열기"
                  className="flex min-h-10 min-w-0 items-center justify-center gap-0.5 rounded-xl border border-[#0066b3]/60 bg-sky-50 px-0.5 py-1 text-[9.5px] font-black tracking-tight whitespace-nowrap text-[#003360] shadow-sm transition hover:bg-sky-100 active:scale-95 min-[360px]:px-1 min-[360px]:text-[11px] sm:min-h-11 sm:gap-1 sm:text-xs"
                >
                  <Database className="hidden h-3 w-3 shrink-0 text-[#0066b3] min-[420px]:inline" aria-hidden="true" />
                  <span>출처안내</span>
                </button>
              </div>
            </article>
          </div>
        </nav>

        {/* 이전 작업 세션이 열려 있을 때 원터치 복귀 배너 (히어로-카드 프레임 연결을 끊지 않도록 카드 프레임 하단에 배치) */}
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

      {/* 하단 해저 산호·물고기·불가사리 파노라마 푸터 */}
      <footer className="relative mt-1 w-full shrink-0 overflow-hidden">
        <img
          src={`${base}images/brand/footer_ocean.png`}
          alt=""
          aria-hidden="true"
          className="block h-20 w-full object-cover object-bottom sm:h-24"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#031d33]/80 via-[#042847]/45 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-1.5 flex flex-col items-center justify-center gap-1 px-2 text-center sm:flex-row sm:flex-wrap sm:gap-2">
          <span className="text-[11px] leading-snug font-extrabold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] [text-wrap:balance] [word-break:keep-all] sm:text-xs">
            국립공원공단 한려해상 · 통영·거제 {totalDockingCount}개 접안지 · {totalPortsCount}개 항포구/선착장 지원 [{APP_VERSION_DISPLAY}]
          </span>
          <button
            type="button"
            onClick={() => onOpenSettings?.('sources')}
            title={DATA_SOURCE_SHORT_BADGE}
            className="inline-flex h-6 items-center gap-1 rounded-full border border-white/85 bg-[#002b52]/95 px-2.5 text-[10.5px] font-black whitespace-nowrap text-sky-100 shadow-sm backdrop-blur-xs transition hover:bg-[#003360] active:scale-95"
          >
            <Database className="h-3 w-3 shrink-0 text-sky-300" aria-hidden="true" />
            <span>데이터·기술 출처 ⓘ</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
