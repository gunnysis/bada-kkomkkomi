import { useCallback, useEffect, useRef, useState } from 'react';

export type ScreenType = 'home' | 'notebook' | 'navigation';
export type NavPanelType = 'route' | 'weather';

export interface AppRouteState {
  screen: ScreenType;
  panel: NavPanelType;
}

/**
 * 현재 window.location.search에서 허용 목록(Allowlist) 기반으로 AppRouteState를 파싱합니다.
 * 잘못되거나 알 수 없는 쿼리 파라미터는 안전하게 'home'으로 정규화합니다.
 */
export function parseRouteFromUrl(search: string): AppRouteState {
  const params = new URLSearchParams(search);
  const screenParam = params.get('screen');
  const panelParam = params.get('panel');

  if (screenParam === 'notebook') {
    return { screen: 'notebook', panel: 'route' };
  }

  if (screenParam === 'navigation') {
    const panel: NavPanelType = panelParam === 'weather' ? 'weather' : 'route';
    return { screen: 'navigation', panel };
  }

  return { screen: 'home', panel: 'route' };
}

/**
 * AppRouteState를 GitHub Pages 서브경로(BASE_URL)에서도 안전하게 동작하는 상대 URL로 직렬화합니다.
 */
export function buildUrlForRoute(route: AppRouteState): string {
  const basePath = window.location.pathname;
  if (route.screen === 'home') {
    return basePath;
  }
  if (route.screen === 'notebook') {
    return `${basePath}?screen=notebook`;
  }
  return `${basePath}?screen=navigation&panel=${route.panel}`;
}

export function useAppRoute() {
  const [route, setRoute] = useState<AppRouteState>(() => {
    if (typeof window === 'undefined') {
      return { screen: 'home', panel: 'route' };
    }
    return parseRouteFromUrl(window.location.search);
  });

  /**
   * 인앱 드릴다운 깊이(Depth) 추적 (stack-drill-down 표준 정합):
   * - 인트로 홈('/')에서 카드를 눌러 진입한 경우 depth = 1이 되며, [< 홈] 버튼 클릭 시 history.back()으로 히스토리 루프 없이 복귀합니다.
   * - 외부 딥링크(?screen=notebook 등)로 직접 진입한 경우 depth = 0이므로, [< 홈] 클릭 시 replaceState('/')로 안전하게 루트로 전환합니다.
   */
  const inAppDepthRef = useRef<number>(0);

  // 초기 부팅 시 잘못된 쿼리가 있으면 정규화(replaceState) 및 popstate 리스너 등록
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initialParsed = parseRouteFromUrl(window.location.search);
    const canonicalUrl = buildUrlForRoute(initialParsed);
    const initialDepth =
      typeof window.history.state?.depth === 'number' ? window.history.state.depth : 0;
    inAppDepthRef.current = initialDepth;

    if (`${window.location.pathname}${window.location.search}` !== canonicalUrl) {
      window.history.replaceState({ ...initialParsed, depth: initialDepth }, '', canonicalUrl);
    }

    const handlePopState = (event: PopStateEvent) => {
      inAppDepthRef.current =
        typeof event.state?.depth === 'number' ? event.state.depth : 0;
      setRoute(parseRouteFromUrl(window.location.search));
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  /**
   * Home에서 주요 기능 카드를 선택해 진입할 때 (pushState)
   */
  const navigateToScreen = useCallback(
    (screen: ScreenType, panel: NavPanelType = 'route') => {
      const next: AppRouteState = { screen, panel };
      setRoute(next);
      if (typeof window !== 'undefined') {
        const nextUrl = buildUrlForRoute(next);
        if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
          const nextDepth = screen === 'home' ? 0 : inAppDepthRef.current + 1;
          inAppDepthRef.current = nextDepth;
          window.history.pushState({ ...next, depth: nextDepth }, '', nextUrl);
        }
      }
    },
    [],
  );

  /**
   * 작업공간 내부에서 '꼬미의 바다수첩' <-> '바닷길 콕콕' 페이지 간 교차 전환 시
   * 불필요한 History 누적을 막기 위해 replaceState 적용
   */
  const switchWorkspaceScreen = useCallback(
    (screen: 'notebook' | 'navigation', panel: NavPanelType = 'route') => {
      const next: AppRouteState = { screen, panel };
      setRoute(next);
      if (typeof window !== 'undefined') {
        const nextUrl = buildUrlForRoute(next);
        if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
          window.history.replaceState(
            { ...next, depth: inAppDepthRef.current },
            '',
            nextUrl,
          );
        }
      }
    },
    [],
  );

  /**
   * 상단 [< 홈] 버튼 클릭 시:
   * - 인앱에서 진입한 이력이 있으면 history.back()을 호출해 히스토리 스택을 깔끔하게 되돌림
   * - 딥링크로 직행 진입한 경우에는 replaceState로 루트('/') 복원
   */
  const navigateHome = useCallback((fallbackPanel: NavPanelType = 'route') => {
    if (typeof window !== 'undefined' && inAppDepthRef.current > 0) {
      inAppDepthRef.current = Math.max(0, inAppDepthRef.current - 1);
      window.history.back();
      return;
    }
    const next: AppRouteState = { screen: 'home', panel: fallbackPanel };
    setRoute(next);
    if (typeof window !== 'undefined') {
      const nextUrl = buildUrlForRoute(next);
      window.history.replaceState({ ...next, depth: 0 }, '', nextUrl);
    }
  }, []);

  /**
   * 바닷길 콕콕 내부 서브탭(route <-> weather) 전환 시 불필요한 History 누적을 막기 위해 replaceState 적용
   */
  const replaceNavPanel = useCallback((panel: NavPanelType) => {
    setRoute((prev) => {
      const next: AppRouteState = {
        screen: prev.screen === 'home' ? 'navigation' : prev.screen,
        panel,
      };
      if (typeof window !== 'undefined') {
        const nextUrl = buildUrlForRoute(next);
        window.history.replaceState(
          { ...next, depth: inAppDepthRef.current },
          '',
          nextUrl,
        );
      }
      return next;
    });
  }, []);

  return {
    route,
    navigateToScreen,
    switchWorkspaceScreen,
    navigateHome,
    replaceNavPanel,
  };
}
