import type { KakaoMapsNamespace } from '../types/kakao';

export type KakaoSdkErrorCode =
  | 'MISSING_API_KEY'
  | 'DOMAIN_MISMATCH_OR_BLOCKED'
  | 'LOAD_TIMEOUT'
  | 'OFFLINE_NO_CACHE';

export interface KakaoSdkDiagnostics {
  status: 'idle' | 'loading' | 'ready' | 'error';
  errorCode?: KakaoSdkErrorCode;
  errorMessage?: string;
  currentOrigin: string;
  maskedKey: string;
  lastCheckedAt: string;
}

const KAKAO_SDK_SCRIPT_ID = 'bada-kakao-maps-sdk-script';
const SDK_LOAD_TIMEOUT_MS = 6500;

let activeLoadPromise: Promise<KakaoMapsNamespace> | null = null;

/**
 * .env의 KAKAO_MAP_API_KEY 또는 VITE_KAKAO_MAP_API_KEY 조회
 */
export function getConfiguredKakaoApiKey(): string {
  const raw =
    import.meta.env.KAKAO_MAP_API_KEY ??
    import.meta.env.VITE_KAKAO_MAP_API_KEY ??
    '';
  return raw.trim();
}

/**
 * 화면 진단 배지에 안전하게 노출할 API 키 마스킹 문자열 생성
 */
export function getMaskedApiKey(key: string): string {
  if (!key) return '(미설정)';
  if (key.length <= 10) return `${key.slice(0, 3)}***`;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/**
 * Leaflet 줌 레벨(7 ~ 18, 클수록 확대)을 Kakao Maps 레벨(1 ~ 14, 작을수록 확대)로 변환
 * - 기본 해역: Leaflet zoom 11 -> Kakao level 8
 * - 선착장 이름 라벨 표시 임계값: Leaflet zoom >= 13 -> Kakao level <= 6
 * - 포인트 상세 이동: Leaflet zoom 14 -> Kakao level 5
 */
export function leafletZoomToKakaoLevel(leafletZoom: number): number {
  const level = 19 - Math.round(leafletZoom);
  return Math.max(1, Math.min(13, level));
}

/**
 * Kakao Maps 레벨(1 ~ 14)을 Leaflet 호환 줌 레벨(5 ~ 18)로 역변환
 */
export function kakaoLevelToLeafletZoom(kakaoLevel: number): number {
  return Math.max(5, Math.min(18, 19 - Math.round(kakaoLevel)));
}

/**
 * Kakao Maps JavaScript SDK v3 동적 로더
 * - 성공 시 window.kakao.maps 네임스페이스 반환
 * - 실패 시(키 누락, 카카오 개발자 콘솔 웹 도메인 미등록 401/403, 오프라인, 타임아웃)
 *   정확한 원인이 담긴 구조화된 에러를 reject하여 MapView가 즉시 레거시(Leaflet) 엔진으로
 *   자동 폴백(Auto-Fallback)하고 사용자에게 도메인 등록 가이드를 안내할 수 있도록 지원합니다.
 */
export function loadKakaoMapSdk(forceRetry = false): Promise<KakaoMapsNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('브라우저 환경이 아닙니다.'));
  }

  if (window.kakao?.maps && typeof window.kakao.maps.Map === 'function') {
    return Promise.resolve(window.kakao.maps);
  }

  if (forceRetry) {
    activeLoadPromise = null;
    const oldScript = document.getElementById(KAKAO_SDK_SCRIPT_ID);
    if (oldScript) {
      oldScript.remove();
    }
  }

  if (activeLoadPromise) {
    return activeLoadPromise;
  }

  const apiKey = getConfiguredKakaoApiKey();
  const origin = window.location.origin;

  if (!apiKey || apiKey === 'your_kakao_javascript_api_key_here') {
    return Promise.reject({
      code: 'MISSING_API_KEY' as KakaoSdkErrorCode,
      message:
        '.env 파일에 KAKAO_MAP_API_KEY가 설정되지 않았습니다. 환경변수를 확인해 주세요.',
      origin,
    });
  }

  if (!navigator.onLine) {
    // 오프라인 상태에서도 서비스 워커 캐시에 스크립트가 있을 수 있으므로 시도는 하되, 실패 시 OFFLINE_NO_CACHE로 분류
  }

  activeLoadPromise = new Promise<KakaoMapsNamespace>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      activeLoadPromise = null;
      reject({
        code: 'LOAD_TIMEOUT' as KakaoSdkErrorCode,
        message: `카카오맵 SDK 응답 시간(${SDK_LOAD_TIMEOUT_MS / 1000}초)이 초과되었습니다.`,
        origin,
      });
    }, SDK_LOAD_TIMEOUT_MS);

    const finalizeWithKakao = () => {
      if (!window.kakao?.maps) {
        window.clearTimeout(timeoutId);
        activeLoadPromise = null;
        reject({
          code: 'DOMAIN_MISMATCH_OR_BLOCKED' as KakaoSdkErrorCode,
          message: `카카오맵 SDK 객체를 초기화할 수 없습니다. 카카오 개발자 콘솔 [내 애플리케이션 > 플랫폼 > Web]에 현재 도메인(${origin})이 등록되어 있는지 확인하세요.`,
          origin,
        });
        return;
      }

      window.kakao.maps.load(() => {
        window.clearTimeout(timeoutId);
        if (window.kakao?.maps) {
          resolve(window.kakao.maps);
        } else {
          activeLoadPromise = null;
          reject({
            code: 'DOMAIN_MISMATCH_OR_BLOCKED' as KakaoSdkErrorCode,
            message: 'window.kakao.maps.load 완료 후 생성자를 찾을 수 없습니다.',
            origin,
          });
        }
      });
    };

    const existingScript = document.getElementById(
      KAKAO_SDK_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    if (existingScript && window.kakao?.maps) {
      finalizeWithKakao();
      return;
    }

    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement('script');
    script.id = KAKAO_SDK_SCRIPT_ID;
    script.type = 'text/javascript';
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(apiKey)}&autoload=false`;

    script.onload = () => {
      finalizeWithKakao();
    };

    script.onerror = () => {
      window.clearTimeout(timeoutId);
      activeLoadPromise = null;
      script.remove();

      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      const code: KakaoSdkErrorCode = isOffline
        ? 'OFFLINE_NO_CACHE'
        : 'DOMAIN_MISMATCH_OR_BLOCKED';

      const message = isOffline
        ? '오프라인 상태에서 캐시된 카카오맵 SDK가 없습니다. 레거시 오프라인 지도(OSM)로 전환합니다.'
        : `카카오맵 SDK 로드 거부됨 (HTTP 401/403). 카카오 개발자 콘솔 [내 애플리케이션 > 플랫폼 > Web 사이트 도메인]에 "${origin}" 주소를 등록해야 합니다.`;

      reject({
        code,
        message,
        origin,
      });
    };

    document.head.appendChild(script);
  });

  return activeLoadPromise;
}
