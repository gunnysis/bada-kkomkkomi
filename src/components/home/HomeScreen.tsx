import { useEffect, useRef } from 'react';
import { Download, Wifi, WifiOff } from 'lucide-react';

export interface HomeScreenProps {
  lastTriggeredCardId: 'notebook' | 'navigation' | null;
  onSelectFeatureCard: (target: 'notebook' | 'navigation') => void;
  isOnline: boolean;
  isStandalone: boolean;
  onInstallClick: () => void;
}

/**
 * 초기 접속 인트로 허브 (HomeScreen)
 * - docs/intro_hub_ux_proposal.md 및 public/dev/intro_design.png 시안(2x2 4개 카드) 100% 정합 구현
 * - '꼬미의 바다수첩', '바닷길 콕콕'은 클릭 시 즉시 해당 워크스페이스로 진입하며,
 *   '꼬미의 달력', '설정'은 시안과 동일하게 2x2 그리드에 표시하되 현재는 비활성(disabled, 클릭 무시) 상태로 두고
 *   추후 기능 개발 시 활성화하여 바로 접속할 수 있도록 구조화했습니다.
 */
export function HomeScreen({
  lastTriggeredCardId,
  onSelectFeatureCard,
  isOnline,
  isStandalone,
  onInstallClick,
}: HomeScreenProps) {
  const notebookBtnRef = useRef<HTMLButtonElement | null>(null);
  const navigationBtnRef = useRef<HTMLButtonElement | null>(null);

  // Workspace에서 Home으로 복귀했을 때 마지막 실행 카드로 초점(Focus) 복원 (proposal 2.3 계약)
  useEffect(() => {
    if (lastTriggeredCardId === 'notebook') {
      notebookBtnRef.current?.focus();
    } else if (lastTriggeredCardId === 'navigation') {
      navigationBtnRef.current?.focus();
    }
  }, [lastTriggeredCardId]);

  return (
    <div
      className="fixed inset-0 z-[1200] min-h-dvh w-full overflow-y-auto bg-gradient-to-b from-[#bae6fd] via-[#38bdf8] to-[#0c4a6e] text-slate-900 select-none"
      style={{
        paddingTop: 'calc(var(--safe-top) + 0.75rem)',
        paddingBottom: 'calc(var(--safe-bottom) + 1.5rem)',
      }}
    >
      {/* 배경 장식용 구름·갈매기·바다 산호초 SVG (aria-hidden="true") */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden opacity-90"
      >
        <svg
          className="absolute top-4 left-0 w-full max-w-4xl opacity-75"
          viewBox="0 0 800 220"
          fill="none"
        >
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
          <circle cx="110" cy="80" r="45" fill="#ffffff" fillOpacity="0.45" />
          <circle cx="155" cy="75" r="55" fill="#ffffff" fillOpacity="0.5" />
          <circle cx="680" cy="60" r="60" fill="#ffffff" fillOpacity="0.35" />
        </svg>

        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#082f49] via-[#0c4a6e]/80 to-transparent" />
      </div>

      <main className="relative mx-auto flex w-full max-w-lg flex-col px-4 sm:px-6">
        {/* 상단 기관 배지 & 온라인/설치 상태 바 */}
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur-md">
            <svg
              aria-hidden="true"
              className="h-5 w-6 shrink-0"
              viewBox="0 0 36 28"
              fill="none"
            >
              <path d="M18 2L4 15h28L18 2Z" fill="#10b981" />
              <path d="M10 15L22 5l10 10H10Z" fill="#0284c7" fillOpacity="0.85" />
              <path d="M4 17h28l-14 9-14-9Z" fill="#0369a1" />
            </svg>
            <div className="leading-tight">
              <span className="block text-xs font-black tracking-tight text-slate-900">
                국립공원공단
              </span>
              <span className="block text-[8px] font-bold tracking-wider text-slate-600">
                KOREA NATIONAL PARK SERVICE
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {!isStandalone && (
              <button
                type="button"
                onClick={onInstallClick}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border-2 border-slate-900/15 bg-amber-400 px-3 py-1 text-xs font-black text-slate-950 shadow transition active:scale-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
              >
                <Download className="h-3.5 w-3.5 stroke-[2.6]" aria-hidden="true" />
                <span>앱 설치</span>
              </button>
            )}
            <div
              role="status"
              className={`inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold shadow-sm ${
                isOnline
                  ? 'bg-emerald-950/90 text-emerald-200'
                  : 'bg-amber-950/95 text-amber-200'
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

        {/* 히어로 영역: 타이틀 + 부제 + 꼬미 캐릭터 일러스트 */}
        <section
          aria-labelledby="home-hero-title"
          className="relative mt-4 flex items-end justify-between gap-2 pt-2 pb-4 sm:mt-6"
        >
          <div className="z-10 flex-1">
            <p className="inline-block rounded-full bg-[#0369a1] px-2.5 py-0.5 text-[11px] font-black text-white shadow-sm">
              해양 현장업무 지원 PWA
            </p>
            <h1
              id="home-hero-title"
              className="mt-1.5 text-4xl font-black tracking-tight text-[#073b61] drop-shadow-[0_2px_0_rgba(255,255,255,0.9)] sm:text-5xl"
            >
              바다꼼꼬미
            </h1>
            <div className="mt-2 inline-block rounded-xl bg-white/95 px-3.5 py-1.5 shadow-md">
              <p className="text-xs font-black tracking-tight text-[#0c4a6e] sm:text-sm">
                우리 손안의 해양공원 업무수첩
              </p>
            </div>
          </div>

          {/* 망원경을 든 꼬미 마스코트 벡터 일러스트 (장식용, aria-hidden="true") */}
          <div aria-hidden="true" className="relative z-10 shrink-0">
            <svg
              className="h-32 w-32 drop-shadow-xl sm:h-36 sm:w-36"
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
                stroke="#1e293b"
                strokeWidth="4.5"
              />
              <circle
                cx="132"
                cy="38"
                r="14"
                fill="#475569"
                stroke="#1e293b"
                strokeWidth="4"
              />
              <path
                d="M52 38C58 14 114 14 128 46L52 38Z"
                fill="#fef3c7"
                stroke="#1e293b"
                strokeWidth="4.5"
              />
              <path
                d="M52 38L127 46"
                stroke="#10b981"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <path
                d="M54 52C44 76 46 118 46 148H126C126 118 128 82 118 56C106 42 66 40 54 52Z"
                fill="#64748b"
                stroke="#1e293b"
                strokeWidth="4.5"
              />
              <path
                d="M72 106C78 115 92 115 98 106"
                stroke="#ffffff"
                strokeWidth="7"
                strokeLinecap="round"
              />
              <path
                d="M56 105L50 146M114 106L122 146"
                stroke="#facc15"
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
                  fill="#1e3a8a"
                  stroke="#0f172a"
                  strokeWidth="4"
                />
                <circle
                  cx="24"
                  cy="75"
                  r="7"
                  fill="#38bdf8"
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
                stroke="#facc15"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </section>

        {/* 4대 주요 기능 카드 컨테이너 (시안과 동일한 2x2 배치, 초소형 320px/텍스트 확대 시 자동 재배치) */}
        <nav
          aria-label="주요 기능"
          className="rounded-[2rem] border-4 border-white/95 bg-white/95 p-3.5 shadow-2xl backdrop-blur-md sm:p-5"
        >
          <div className="grid grid-cols-1 gap-3.5 min-[350px]:grid-cols-2 sm:gap-4">
            {/* 카드 1 (활성): 꼬미의 바다수첩 */}
            <button
              ref={notebookBtnRef}
              type="button"
              onClick={() => onSelectFeatureCard('notebook')}
              className="group relative flex min-h-[156px] w-full flex-col items-center justify-center rounded-3xl border-2 border-sky-200 bg-gradient-to-b from-[#e0f2fe] to-[#bae6fd] p-3.5 text-center shadow-md transition hover:-translate-y-0.5 hover:border-sky-500 hover:shadow-lg active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0369a1] sm:p-4"
            >
              <svg
                aria-hidden="true"
                className="mb-2 h-15 w-18 transition-transform group-hover:scale-105 sm:h-16 sm:w-20"
                viewBox="0 0 96 76"
                fill="none"
              >
                <path
                  d="M12 18L36 12L60 18L84 12V62L60 68L36 62L12 68V18Z"
                  fill="#ffffff"
                  stroke="#0c4a6e"
                  strokeWidth="4"
                  strokeLinejoin="round"
                />
                <path d="M16 21L35 16V58L16 63V21Z" fill="#86efac" />
                <path d="M37 16L59 21V63L37 58V16Z" fill="#38bdf8" />
                <path d="M61 21L80 16V58L61 63V21Z" fill="#bbf7d0" />
                <path d="M36 12V62M60 18V68" stroke="#0c4a6e" strokeWidth="3" />
                <path
                  d="M68 6C59.7 6 53 12.7 53 21C53 32 68 46 68 46C68 46 83 32 83 21C83 12.7 76.3 6 68 6Z"
                  fill="#f97316"
                  stroke="#ffffff"
                  strokeWidth="3"
                />
                <circle cx="68" cy="21" r="5.5" fill="#ffffff" />
              </svg>
              <span className="text-base font-black tracking-tight text-[#082f49] sm:text-xl">
                꼬미의 바다수첩
              </span>
              <span className="mt-1 text-[11px] leading-snug font-bold text-slate-700 sm:text-xs">
                해양지도 · 갯바위 접안정보 · 현장정보
              </span>
            </button>

            {/* 카드 2 (활성): 바닷길 콕콕 */}
            <button
              ref={navigationBtnRef}
              type="button"
              onClick={() => onSelectFeatureCard('navigation')}
              className="group relative flex min-h-[156px] w-full flex-col items-center justify-center rounded-3xl border-2 border-teal-200 bg-gradient-to-b from-[#ccfbf1] to-[#99f6e4] p-3.5 text-center shadow-md transition hover:-translate-y-0.5 hover:border-teal-600 hover:shadow-lg active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e] sm:p-4"
            >
              <svg
                aria-hidden="true"
                className="mb-2 h-15 w-18 transition-transform group-hover:scale-105 sm:h-16 sm:w-20"
                viewBox="0 0 96 76"
                fill="none"
              >
                <circle cx="68" cy="20" r="9" fill="#f59e0b" />
                <path
                  d="M54 34H78C83.5 34 88 29.5 88 24C88 18.8 84 14.5 78.9 14.1C76.8 9.3 72 6 66.5 6C59 6 53 12 53 19.5"
                  fill="#ffffff"
                  stroke="#0c4a6e"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <rect
                  x="30"
                  y="8"
                  width="14"
                  height="6"
                  rx="2"
                  fill="#0284c7"
                  stroke="#0c4a6e"
                  strokeWidth="3"
                />
                <circle
                  cx="37"
                  cy="40"
                  r="24"
                  fill="#ffffff"
                  stroke="#0c4a6e"
                  strokeWidth="5"
                />
                <path
                  d="M37 40L48 30"
                  stroke="#0c4a6e"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <circle cx="37" cy="40" r="4" fill="#0c4a6e" />
                <path
                  d="M52 52C58 47 66 47 72 52C78 57 86 57 90 52"
                  stroke="#06b6d4"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <path
                  d="M52 62C58 57 66 57 72 62C78 67 86 67 90 62"
                  stroke="#06b6d4"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-base font-black tracking-tight text-[#082f49] sm:text-xl">
                바닷길 콕콕
              </span>
              <span className="mt-1 text-[11px] leading-snug font-bold text-slate-700 sm:text-xs">
                시간계산 · 기상상태판정
              </span>
            </button>

            {/* 카드 3 (추후 기능 개발 시 연결 예정 - 현재 클릭 무시/disabled): 꼬미의 달력 */}
            <button
              type="button"
              disabled
              className="relative flex min-h-[156px] w-full cursor-not-allowed flex-col items-center justify-center rounded-3xl border-2 border-indigo-200/80 bg-gradient-to-b from-[#e0e7ff] to-[#c7d2fe] p-3.5 text-center opacity-85 shadow-sm sm:p-4"
            >
              <span className="absolute top-2.5 right-2.5 rounded-full bg-slate-700/90 px-2 py-0.5 text-[10px] font-black text-amber-200">
                출시 예정
              </span>
              <svg
                aria-hidden="true"
                className="mb-2 h-15 w-18 sm:h-16 sm:w-20"
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
                  stroke="#1d4ed8"
                  strokeWidth="4"
                />
                <path d="M16 26H68" stroke="#1d4ed8" strokeWidth="4" />
                <rect x="26" y="8" width="6" height="12" rx="3" fill="#1d4ed8" />
                <rect x="52" y="8" width="6" height="12" rx="3" fill="#1d4ed8" />
                <rect x="24" y="33" width="8" height="7" rx="1.5" fill="#93c5fd" />
                <rect x="38" y="33" width="8" height="7" rx="1.5" fill="#93c5fd" />
                <rect x="52" y="33" width="8" height="7" rx="1.5" fill="#93c5fd" />
                <rect x="24" y="45" width="8" height="7" rx="1.5" fill="#93c5fd" />
                <rect x="38" y="45" width="8" height="7" rx="1.5" fill="#93c5fd" />
                <path d="M52 54L84 54L78 66H56L52 54Z" fill="#1e3a8a" />
                <path d="M60 44H74L77 54H57L60 44Z" fill="#0284c7" />
              </svg>
              <span className="text-base font-black tracking-tight text-[#082f49] sm:text-xl">
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
              className="relative flex min-h-[156px] w-full cursor-not-allowed flex-col items-center justify-center rounded-3xl border-2 border-slate-300 bg-gradient-to-b from-[#e2e8f0] to-[#cbd5e1] p-3.5 text-center opacity-85 shadow-sm sm:p-4"
            >
              <span className="absolute top-2.5 right-2.5 rounded-full bg-slate-700/90 px-2 py-0.5 text-[10px] font-black text-amber-200">
                출시 예정
              </span>
              <svg
                aria-hidden="true"
                className="mb-2 h-15 w-18 sm:h-16 sm:w-20"
                viewBox="0 0 96 76"
                fill="none"
              >
                <circle cx="48" cy="38" r="18" stroke="#475569" strokeWidth="10" />
                <path
                  d="M48 8V16M48 60V68M18 38H26M70 38H78M27 17L33 23M63 53L69 59M69 17L63 23M33 53L27 59"
                  stroke="#475569"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <circle cx="48" cy="38" r="8" fill="#f8fafc" />
              </svg>
              <span className="text-base font-black tracking-tight text-[#082f49] sm:text-xl">
                설정
              </span>
              <span className="mt-1 text-[11px] leading-snug font-bold text-slate-700 sm:text-xs">
                앱 설정 · 이용 안내
              </span>
            </button>
          </div>
        </nav>

        {/* 하단 안내 푸터 */}
        <footer className="mt-4 text-center text-xs font-bold text-sky-100 drop-shadow">
          통영·거제 해역 55개 접안지 · 135개 항포구/선착장 오프라인 지원 [v1.1]
        </footer>
      </main>
    </div>
  );
}
