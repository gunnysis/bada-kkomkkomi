import type { MarkerColor } from '../types/docking';
import type { RouteWaypoint } from '../types/route';

export const WORKSPACE_DRAFT_STORAGE_KEY = 'bada_workspace_draft_v1';
export const WORKSPACE_DRAFT_SCHEMA_VERSION = 1;

export type RegionFilterType = 'all' | 'tongyeong' | 'geoje';

export interface WorkspaceDraftState {
  schemaVersion: number;
  savedAt: string;
  routeWaypoints: RouteWaypoint[];
  speedKnots: number;
  selectedColors: MarkerColor[];
  selectedRegion: RegionFilterType;
}

const VALID_MARKER_COLORS: ReadonlyArray<MarkerColor> = [
  'red',
  'amber',
  'green',
  'blue',
  'purple',
];
const VALID_REGIONS: ReadonlyArray<RegionFilterType> = ['all', 'tongyeong', 'geoje'];
const VALID_WAYPOINT_TYPES: ReadonlyArray<RouteWaypoint['type']> = [
  'start',
  'waypoint',
  'end',
];

function isFiniteCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 33.0 &&
    lat <= 39.0 &&
    lng >= 124.0 &&
    lng <= 132.0
  );
}

export function isValidRouteWaypointsDraft(value: unknown): value is RouteWaypoint[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 20) {
    return false;
  }

  for (let i = 0; i < value.length; i++) {
    const item = value[i] as Partial<RouteWaypoint> | null | undefined;
    if (!item || typeof item !== 'object') return false;
    if (typeof item.id !== 'string' || item.id.trim().length === 0) return false;
    if (typeof item.name !== 'string' || item.name.trim().length === 0) return false;
    if (!isFiniteCoord(item.lat, item.lng)) return false;
    if (!VALID_WAYPOINT_TYPES.includes(item.type as RouteWaypoint['type'])) return false;
    if (i === 0 && item.type !== 'start') return false;
    if (i === value.length - 1 && item.type !== 'end') return false;
    if (i > 0 && i < value.length - 1 && item.type !== 'waypoint') return false;
  }

  return true;
}

export function sanitizeWorkspaceDraft(
  raw: unknown,
  fallbackWaypoints: RouteWaypoint[],
  fallbackSpeedKnots = 15,
): WorkspaceDraftState {
  const nowIso = new Date().toISOString();
  const safeDefaults: WorkspaceDraftState = {
    schemaVersion: WORKSPACE_DRAFT_SCHEMA_VERSION,
    savedAt: nowIso,
    routeWaypoints: fallbackWaypoints,
    speedKnots: fallbackSpeedKnots,
    selectedColors: ['red'],
    selectedRegion: 'all',
  };

  if (!raw || typeof raw !== 'object') {
    return safeDefaults;
  }

  const candidate = raw as Partial<WorkspaceDraftState>;
  if (candidate.schemaVersion !== WORKSPACE_DRAFT_SCHEMA_VERSION) {
    return safeDefaults;
  }

  const routeWaypoints = isValidRouteWaypointsDraft(candidate.routeWaypoints)
    ? candidate.routeWaypoints
    : fallbackWaypoints;

  const speedKnots =
    typeof candidate.speedKnots === 'number' &&
    Number.isFinite(candidate.speedKnots) &&
    candidate.speedKnots >= 5 &&
    candidate.speedKnots <= 45
      ? candidate.speedKnots
      : fallbackSpeedKnots;

  const validColors = Array.isArray(candidate.selectedColors)
    ? candidate.selectedColors.filter((c): c is MarkerColor =>
        VALID_MARKER_COLORS.includes(c as MarkerColor),
      )
    : [];
  const selectedColors: MarkerColor[] =
    validColors.length > 0 ? Array.from(new Set(validColors)) : ['red'];

  const selectedRegion: RegionFilterType = VALID_REGIONS.includes(
    candidate.selectedRegion as RegionFilterType,
  )
    ? (candidate.selectedRegion as RegionFilterType)
    : 'all';

  return {
    schemaVersion: WORKSPACE_DRAFT_SCHEMA_VERSION,
    savedAt:
      typeof candidate.savedAt === 'string' && candidate.savedAt.length > 0
        ? candidate.savedAt
        : nowIso,
    routeWaypoints,
    speedKnots,
    selectedColors,
    selectedRegion,
  };
}

export function loadWorkspaceDraft(
  fallbackWaypoints: RouteWaypoint[],
  fallbackSpeedKnots = 15,
): WorkspaceDraftState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return sanitizeWorkspaceDraft(null, fallbackWaypoints, fallbackSpeedKnots);
  }

  try {
    const rawStr = window.localStorage.getItem(WORKSPACE_DRAFT_STORAGE_KEY);
    if (!rawStr) {
      return sanitizeWorkspaceDraft(null, fallbackWaypoints, fallbackSpeedKnots);
    }
    const parsed = JSON.parse(rawStr);
    return sanitizeWorkspaceDraft(parsed, fallbackWaypoints, fallbackSpeedKnots);
  } catch {
    return sanitizeWorkspaceDraft(null, fallbackWaypoints, fallbackSpeedKnots);
  }
}

export function saveWorkspaceDraft(
  draft: Omit<WorkspaceDraftState, 'schemaVersion' | 'savedAt'>,
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload: WorkspaceDraftState = {
      schemaVersion: WORKSPACE_DRAFT_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      ...draft,
    };
    window.localStorage.setItem(WORKSPACE_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }
}

export function clearWorkspaceDraft(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(WORKSPACE_DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * GeolocationPositionError 코드(1: PERMISSION_DENIED, 2: POSITION_UNAVAILABLE, 3: TIMEOUT)를
 * 현장 직원이 즉시 원인을 파악할 수 있는 명확한 한국어 안내 문구로 변환합니다.
 * - 실제 위치 오인 사고(RC-SAFETY-02)를 막기 위해 GPS 실패 시 가상 좌표로 자동 이동하지 않고
 *   우측 지도 독의 [시뮬레이션 위치] 버튼을 안내합니다.
 */
export function classifyGpsError(error: { code?: number; message?: string } | null | undefined): {
  code: 'permission_denied' | 'unavailable' | 'timeout' | 'unknown';
  message: string;
} {
  const errCode = error?.code;
  if (errCode === 1) {
    return {
      code: 'permission_denied',
      message:
        'GPS 위치 권한이 거부되었습니다. 브라우저 위치 권한을 허용하거나 [시뮬레이션 위치] 버튼을 이용해 주세요.',
    };
  }
  if (errCode === 2) {
    return {
      code: 'unavailable',
      message:
        '현재 위성 GPS 신호를 수신할 수 없습니다(실내/음영지역). 야외 갑판에서 다시 시도하거나 [시뮬레이션 위치] 버튼을 이용해 주세요.',
    };
  }
  if (errCode === 3) {
    return {
      code: 'timeout',
      message:
        'GPS 위성 수신 시간이 초과되었습니다. 잠시 후 다시 시도하거나 [시뮬레이션 위치] 버튼을 이용해 주세요.',
    };
  }
  return {
    code: 'unknown',
    message:
      'GPS 위치를 확인할 수 없습니다. 위치 서비스를 켜거나 [시뮬레이션 위치] 버튼을 이용해 주세요.',
  };
}
