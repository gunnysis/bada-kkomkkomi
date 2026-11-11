import type { MarinePort } from '../types/port.ts';
import type {
  RouteCandidateState,
  RoutePortSelectionSource,
  RouteSelectionMode,
  RouteWaypoint,
} from '../types/route.ts';
import { calculateHaversineKm } from './routeGeoService.ts';

/**
 * 등록된 MarinePort를 RouteWaypoint 객체로 정규화 변환합니다.
 */
export function createWaypointFromRegisteredPort(
  port: MarinePort,
  type: RouteWaypoint['type'],
  existingId?: string,
): RouteWaypoint {
  return {
    id: existingId ?? `wp_${type}_${port.id}_${Date.now()}`,
    name: port.name,
    lat: port.lat,
    lng: port.lng,
    type,
    matchedPortId: port.id,
    isCustomCoord: false,
    subCategory: port.subCategory,
    facilityLabel: port.facilityLabel,
    minDepthMeters: port.minDepthMeters,
    tidalSensitivity: port.tidalSensitivity,
    maxVesselTons: port.maxVesselTons,
    hazards: port.hazards ? [...port.hazards] : undefined,
  };
}

/**
 * 지점 배열의 인덱스 순서에 맞춰 'start' | 'waypoint' | 'end' 타입을 정규화합니다.
 */
export function normalizeWaypointTypes(
  waypoints: readonly RouteWaypoint[],
): RouteWaypoint[] {
  return waypoints.map((wp, idx, arr) => ({
    ...wp,
    type:
      idx === 0
        ? 'start'
        : idx === arr.length - 1 && arr.length >= 2
          ? 'end'
          : 'waypoint',
  }));
}

/**
 * [GAP-01 해소] 선택한 항구 반경 150m 이내에 중첩·인접한 등록 시설 또는 parentPortId 공유 자매 시설을 반환합니다.
 * - 자기 자신을 첫 번째 항목으로 포함하여 후보 확인 카드에서 칩으로 자유롭게 전환할 수 있게 합니다.
 */
export function findSiblingPorts(
  targetPort: MarinePort,
  allPorts: readonly MarinePort[],
  radiusMeters = 150,
): MarinePort[] {
  const radiusKm = radiusMeters / 1000;
  const targetParentId = targetPort.parentPortId ?? targetPort.id;

  const matches = allPorts
    .map((p) => {
      const distKm = calculateHaversineKm(
        targetPort.lat,
        targetPort.lng,
        p.lat,
        p.lng,
      );
      const isSameCluster =
        p.id === targetPort.id ||
        distKm <= radiusKm ||
        (p.parentPortId && p.parentPortId === targetParentId) ||
        (targetPort.parentPortId && p.id === targetPort.parentPortId);
      return { port: p, distKm, isSameCluster };
    })
    .filter((item) => item.isSameCluster)
    .sort((a, b) => {
      if (a.port.id === targetPort.id) return -1;
      if (b.port.id === targetPort.id) return 1;
      return a.distKm - b.distKm;
    })
    .map((item) => item.port);

  return matches.length > 1 ? matches : [];
}

/**
 * 주어진 위경도 좌표에서 가장 가까운 등록 항구(MarinePort)를 반환합니다.
 * - 해상기상 패널 브릿지 등에서 임의 좌표 대신 최근접 등록 항구 후보를 제안할 때 사용합니다.
 */
export function findNearestRegisteredPort(
  lat: number,
  lng: number,
  allPorts: readonly MarinePort[],
  maxRadiusMeters?: number,
): MarinePort | null {
  let nearest: MarinePort | null = null;
  let minDistKm =
    typeof maxRadiusMeters === 'number' && maxRadiusMeters > 0
      ? maxRadiusMeters / 1000
      : Infinity;
  for (const port of allPorts) {
    const dKm = calculateHaversineKm(lat, lng, port.lat, port.lng);
    if (dKm <= minDistKm) {
      minDistKm = dKm;
      nearest = port;
    }
  }
  return nearest;
}

/**
 * 현재 경로 상태(waypoints 길이)와 명시적 모드를 결합하여 실제 후보 지정 역할을 결정합니다.
 */
export function resolveEffectiveSelectionMode(
  explicitMode: RouteSelectionMode,
  waypoints: readonly RouteWaypoint[],
): Exclude<RouteSelectionMode, 'idle'> {
  if (waypoints.length === 0) {
    return 'select_start';
  }
  if (waypoints.length === 1) {
    return explicitMode === 'replace_start' ? 'replace_start' : 'select_end';
  }
  if (explicitMode !== 'idle') {
    return explicitMode;
  }
  return 'add_waypoint';
}

/**
 * 후보 항구를 확정했을 때의 예상 지점 배열을 시뮬레이션합니다.
 */
function simulateNextWaypoints(
  port: MarinePort,
  mode: Exclude<RouteSelectionMode, 'idle'>,
  waypoints: readonly RouteWaypoint[],
  targetWaypointId?: string,
): RouteWaypoint[] {
  if (mode === 'select_start') {
    return [createWaypointFromRegisteredPort(port, 'start', 'wp_start')];
  }
  if (mode === 'replace_start') {
    if (waypoints.length === 0) {
      return [createWaypointFromRegisteredPort(port, 'start', 'wp_start')];
    }
    return normalizeWaypointTypes([
      createWaypointFromRegisteredPort(port, 'start', waypoints[0].id),
      ...waypoints.slice(1),
    ]);
  }
  if (mode === 'select_end') {
    if (waypoints.length === 0) {
      return [createWaypointFromRegisteredPort(port, 'start', 'wp_start')];
    }
    return normalizeWaypointTypes([
      waypoints[0],
      createWaypointFromRegisteredPort(port, 'end', 'wp_end'),
    ]);
  }
  if (mode === 'replace_end') {
    if (waypoints.length < 2) {
      return normalizeWaypointTypes([
        ...waypoints,
        createWaypointFromRegisteredPort(port, 'end', 'wp_end'),
      ]);
    }
    return normalizeWaypointTypes([
      ...waypoints.slice(0, -1),
      createWaypointFromRegisteredPort(
        port,
        'end',
        waypoints[waypoints.length - 1].id,
      ),
    ]);
  }
  if (mode === 'replace_waypoint' && targetWaypointId) {
    const targetIdx = waypoints.findIndex((wp) => wp.id === targetWaypointId);
    if (targetIdx >= 0) {
      const next = [...waypoints];
      next[targetIdx] = createWaypointFromRegisteredPort(
        port,
        next[targetIdx].type,
        next[targetIdx].id,
      );
      return normalizeWaypointTypes(next);
    }
  }
  // mode === 'add_waypoint' (도착지 바로 앞에 삽입)
  if (waypoints.length < 2) {
    return normalizeWaypointTypes([
      ...waypoints,
      createWaypointFromRegisteredPort(port, 'end'),
    ]);
  }
  return normalizeWaypointTypes([
    ...waypoints.slice(0, -1),
    createWaypointFromRegisteredPort(port, 'waypoint'),
    waypoints[waypoints.length - 1],
  ]);
}

/**
 * 후보 항구가 연속 중복 또는 0거리 직항(A → A) 규칙에 위배되는지 검증합니다.
 * - 경유지가 1곳 이상 포함된 왕복 운항(A → B → A)은 허용합니다.
 */
export function validateCandidatePort(
  port: MarinePort,
  mode: Exclude<RouteSelectionMode, 'idle'>,
  waypoints: readonly RouteWaypoint[],
  targetWaypointId?: string,
): string | null {
  const simulated = simulateNextWaypoints(
    port,
    mode,
    waypoints,
    targetWaypointId,
  );

  // 1. 경유지 없는 2지점 직항에서 출발지 === 도착지 차단 (0거리 경로 방지)
  if (simulated.length === 2) {
    const startId = simulated[0].matchedPortId ?? simulated[0].name;
    const endId = simulated[1].matchedPortId ?? simulated[1].name;
    if (startId === endId) {
      return '출발지와 도착지가 같습니다. 왕복 운항은 경유지를 1곳 이상 추가한 뒤 설정하세요.';
    }
  }

  // 2. 인접한 직전·직후 지점과의 연속 중복 차단
  for (let i = 0; i < simulated.length - 1; i += 1) {
    const currId = simulated[i].matchedPortId ?? simulated[i].name;
    const nextId = simulated[i + 1].matchedPortId ?? simulated[i + 1].name;
    if (currId === nextId) {
      return '직전(또는 다음) 지점과 같은 항구는 연속해서 지정할 수 없습니다.';
    }
  }

  return null;
}

/**
 * portId 선택 요청으로부터 RouteCandidateState를 생성합니다.
 */
export function buildRouteCandidateState(
  portId: string,
  source: RoutePortSelectionSource,
  explicitMode: RouteSelectionMode,
  waypoints: readonly RouteWaypoint[],
  allPorts: readonly MarinePort[],
  targetWaypointId?: string,
): RouteCandidateState | null {
  const port = allPorts.find((p) => p.id === portId);
  if (!port) {
    return null;
  }

  const effectiveMode = resolveEffectiveSelectionMode(explicitMode, waypoints);
  const siblingPorts = findSiblingPorts(port, allPorts, 150);
  const validationError = validateCandidatePort(
    port,
    effectiveMode,
    waypoints,
    targetWaypointId,
  );

  return {
    port,
    siblingPorts,
    mode: effectiveMode,
    targetWaypointId:
      effectiveMode === 'replace_waypoint' ? targetWaypointId : undefined,
    source,
    validationError,
  };
}

/**
 * 사용자가 후보 확인 카드에서 [확정]을 눌렀을 때 새로운 지점 목록을 반환합니다.
 */
export function applyConfirmedCandidate(
  candidate: RouteCandidateState,
  waypoints: readonly RouteWaypoint[],
): RouteWaypoint[] {
  if (candidate.validationError) {
    return [...waypoints];
  }
  return simulateNextWaypoints(
    candidate.port,
    candidate.mode,
    waypoints,
    candidate.targetWaypointId,
  );
}

/**
 * [GAP-06 해소] 경유지 삭제·비우기·순서 이동·반전 후 연속 중복 병합 및 왕복 0거리(A → A) 해제 불변식을 보장합니다.
 */
export function sanitizeCommittedRouteWaypoints(
  waypoints: readonly RouteWaypoint[],
): { waypoints: RouteWaypoint[]; notice: string | null } {
  if (waypoints.length <= 1) {
    return { waypoints: normalizeWaypointTypes(waypoints), notice: null };
  }

  let notice: string | null = null;
  const deduped: RouteWaypoint[] = [];

  for (const wp of waypoints) {
    const prev = deduped[deduped.length - 1];
    const prevKey = prev ? (prev.matchedPortId ?? `${prev.lat},${prev.lng}`) : null;
    const currKey = wp.matchedPortId ?? `${wp.lat},${wp.lng}`;
    if (prevKey && prevKey === currKey) {
      notice = '연속된 동일 항구 지점을 하나로 정리했습니다.';
      continue;
    }
    deduped.push(wp);
  }

  // 왕복 경로(A → B → A)에서 중간 경유지 B가 삭제되어 A → A 2지점만 남게 된 경우
  if (deduped.length === 2) {
    const startKey = deduped[0].matchedPortId ?? `${deduped[0].lat},${deduped[0].lng}`;
    const endKey = deduped[1].matchedPortId ?? `${deduped[1].lat},${deduped[1].lng}`;
    if (startKey === endKey) {
      return {
        waypoints: normalizeWaypointTypes([deduped[0]]),
        notice: '왕복 경로의 경유지가 삭제되어 도착지를 다시 선택합니다.',
      };
    }
  }

  return {
    waypoints: normalizeWaypointTypes(deduped),
    notice,
  };
}

/**
 * [White-Box Simplicity & Black-Box Precision]
 * 지도 마커 직접 선택 또는 [항구선택] 모달 선택 시 2단계 확인 카드 없이
 * 등록된 항구(MarinePort)를 즉시 출발지·도착지·경유지로 반영합니다.
 * - 연속 동일 항구 중복 및 경유지 없는 0거리 직항(A → A)을 자동 검증·차단합니다.
 */
export function applyDirectPortSelection(
  port: MarinePort,
  waypoints: readonly RouteWaypoint[],
  targetSlot?: 'start' | 'end' | 'add_waypoint' | 'new_waypoint' | string | null,
): {
  waypoints: RouteWaypoint[];
  error: string | null;
  addedRole: 'start' | 'end' | 'waypoint';
} {
  // 1. 기존 waypointId 지정 교체인 경우 역할 매핑
  if (
    targetSlot &&
    targetSlot !== 'start' &&
    targetSlot !== 'end' &&
    targetSlot !== 'add_waypoint' &&
    targetSlot !== 'new_waypoint'
  ) {
    const existingIdx = waypoints.findIndex((wp) => wp.id === targetSlot);
    if (existingIdx === 0) {
      return applyDirectPortSelection(port, waypoints, 'start');
    }
    if (existingIdx === waypoints.length - 1 && waypoints.length >= 2) {
      return applyDirectPortSelection(port, waypoints, 'end');
    }
    if (existingIdx > 0) {
      const error = validateCandidatePort(
        port,
        'replace_waypoint',
        waypoints,
        targetSlot,
      );
      if (error) {
        return { waypoints: [...waypoints], error, addedRole: 'waypoint' };
      }
      const next = simulateNextWaypoints(
        port,
        'replace_waypoint',
        waypoints,
        targetSlot,
      );
      return { waypoints: next, error: null, addedRole: 'waypoint' };
    }
  }

  // 2. 출발지 지정 또는 교체 (빈 항로에서 지도 마커 첫 선택 포함)
  if (targetSlot === 'start' || (!targetSlot && waypoints.length === 0)) {
    if (waypoints.length === 0) {
      return {
        waypoints: [createWaypointFromRegisteredPort(port, 'start', 'wp_start')],
        error: null,
        addedRole: 'start',
      };
    }
    const error = validateCandidatePort(port, 'replace_start', waypoints);
    if (error) {
      return { waypoints: [...waypoints], error, addedRole: 'start' };
    }
    const next = simulateNextWaypoints(port, 'replace_start', waypoints);
    return { waypoints: next, error: null, addedRole: 'start' };
  }

  // 3. 경유지 추가 (중간 경유지 슬롯)
  if (targetSlot === 'add_waypoint' || targetSlot === 'new_waypoint') {
    if (waypoints.length === 0) {
      return applyDirectPortSelection(port, waypoints, 'start');
    }
    if (waypoints.length === 1) {
      return applyDirectPortSelection(port, waypoints, 'end');
    }
    const error = validateCandidatePort(port, 'add_waypoint', waypoints);
    if (error) {
      return { waypoints: [...waypoints], error, addedRole: 'waypoint' };
    }
    const next = simulateNextWaypoints(port, 'add_waypoint', waypoints);
    return { waypoints: next, error: null, addedRole: 'waypoint' };
  }

  // 4. 도착지 지정 또는 교체 (출발지만 있는 상태에서 지도 마커 두 번째 선택, 또는 완성된 항로에서 새 목적지 선택)
  if (waypoints.length === 0) {
    return {
      waypoints: [createWaypointFromRegisteredPort(port, 'start', 'wp_start')],
      error: null,
      addedRole: 'start',
    };
  }

  if (waypoints.length === 1) {
    if ((waypoints[0].matchedPortId ?? waypoints[0].name) === port.id) {
      return {
        waypoints: [...waypoints],
        error: '출발지와 다른 도착지를 선택해 주세요.',
        addedRole: 'end',
      };
    }
    const error = validateCandidatePort(port, 'select_end', waypoints);
    if (error) {
      return { waypoints: [...waypoints], error, addedRole: 'end' };
    }
    const next = simulateNextWaypoints(port, 'select_end', waypoints);
    return { waypoints: next, error: null, addedRole: 'end' };
  }

  // waypoints.length >= 2: 도착지(end) 교체
  const error = validateCandidatePort(port, 'replace_end', waypoints);
  if (error) {
    return { waypoints: [...waypoints], error, addedRole: 'end' };
  }
  const next = simulateNextWaypoints(port, 'replace_end', waypoints);
  return { waypoints: next, error: null, addedRole: 'end' };
}

