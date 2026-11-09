import { useCallback, useEffect, useState } from 'react';

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

  // 초기 부팅 시 잘못된 쿼리가 있으면 정규화(replaceState) 및 popstate 리스너 등록
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initialParsed = parseRouteFromUrl(window.location.search);
    const canonicalUrl = buildUrlForRoute(initialParsed);
    if (`${window.location.pathname}${window.location.search}` !== canonicalUrl) {
      window.history.replaceState(initialParsed, '', canonicalUrl);
    }

    const handlePopState = () => {
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
          window.history.pushState(next, '', nextUrl);
        }
      }
    },
    [],
  );

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
        window.history.replaceState(next, '', nextUrl);
      }
      return next;
    });
  }, []);

  return {
    route,
    navigateToScreen,
    replaceNavPanel,
  };
}
