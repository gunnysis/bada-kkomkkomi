import type { MarinePort } from '../types/port.ts';
import type {
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
 * [WP-GAP-04 해소] 기존 경로(waypoints.length >= 2)의 각 인접 구간 (w_i, w_{i+1}) 중
 * 신규 경유지(port)를 삽입했을 때 추가되는 우회 거리 Δd(i) = d(w_i, P) + d(P, w_{i+1}) - d(w_i, w_{i+1})가
 * 최소가 되는 최적 삽입 인덱스(insertIndex = i* + 1)와 최소 우회 거리(detourKm)를 반환합니다.
 * - 다중 경유지를 어떤 순서로 클릭하더라도 배가 역주행하지 않고 가는 길 순서대로 자연스럽게 연결됩니다.
 */
export function findOptimalWaypointInsertIndex(
  port: Pick<MarinePort, 'lat' | 'lng'>,
  waypoints: readonly RouteWaypoint[],
): { insertIndex: number; detourKm: number } {
  if (waypoints.length < 2) {
    return { insertIndex: waypoints.length, detourKm: 0 };
  }

  let bestInsertIndex = waypoints.length - 1;
  let minDetourKm = Infinity;

  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const fromWp = waypoints[i];
    const toWp = waypoints[i + 1];
    const baseLegKm = calculateHaversineKm(
      fromWp.lat,
      fromWp.lng,
      toWp.lat,
      toWp.lng,
    );
    const viaPortKm =
      calculateHaversineKm(fromWp.lat, fromWp.lng, port.lat, port.lng) +
      calculateHaversineKm(port.lat, port.lng, toWp.lat, toWp.lng);
    const detourKm = Math.max(0, viaPortKm - baseLegKm);

    if (detourKm < minDetourKm) {
      minDetourKm = detourKm;
      bestInsertIndex = i + 1;
    }
  }

  return {
    insertIndex: bestInsertIndex,
    detourKm: Number.isFinite(minDetourKm) ? minDetourKm : 0,
  };
}

/**
 * 현재 경로(waypoints) 기준 특정 항구를 경유지로 넣었을 때 증가하는 최소 우회 거리(km)를 계산합니다.
 */
export function calculatePortDetourKm(
  port: Pick<MarinePort, 'lat' | 'lng'>,
  waypoints: readonly RouteWaypoint[],
): number {
  return findOptimalWaypointInsertIndex(port, waypoints).detourKm;
}

/**
 * 항구를 지정 역할(mode)로 반영했을 때의 예상 지점 배열을 시뮬레이션합니다.
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
  // mode === 'add_waypoint': 가는 길 최적 구간 위치(findOptimalWaypointInsertIndex)에 삽입
  if (waypoints.length < 2) {
    return normalizeWaypointTypes([
      ...waypoints,
      createWaypointFromRegisteredPort(port, 'end'),
    ]);
  }
  const { insertIndex } = findOptimalWaypointInsertIndex(port, waypoints);
  const next = [...waypoints];
  next.splice(insertIndex, 0, createWaypointFromRegisteredPort(port, 'waypoint'));
  return normalizeWaypointTypes(next);
}

/**
 * 항구가 연속 중복 또는 0거리 직항(A → A) 규칙에 위배되는지 검증합니다.
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
 * [White-Box Simplicity & Black-Box Precision — Smart Waypoint UX]
 * 지도 마커 직접 선택 또는 [항구선택] 모달 선택 시 등록된 항구(MarinePort)를
 * 즉시 출발지·도착지·경유지로 반영하거나 기존 경유지를 원터치 토글 해제합니다.
 * - 지도 직접 클릭(targetSlot == null):
 *   1번째 클릭 = 출발지('start')
 *   2번째 클릭 = 도착지('end')
 *   3번째+ 클릭 = 가는 길 최적 위치에 경유지 자동 추가('waypoint'), 이미 선택된 경유지 재클릭 시 즉시 해제('removed_waypoint')
 */
export function applyDirectPortSelection(
  port: MarinePort,
  waypoints: readonly RouteWaypoint[],
  targetSlot?: 'start' | 'end' | 'add_waypoint' | 'new_waypoint' | string | null,
): {
  waypoints: RouteWaypoint[];
  error: string | null;
  addedRole: 'start' | 'end' | 'waypoint' | 'removed_waypoint';
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

  // 3. 도착지 명시적 지정 또는 교체 (targetSlot === 'end' 또는 출발지만 있는 상태에서 지도 두 번째 선택)
  if (targetSlot === 'end' || (!targetSlot && waypoints.length === 1)) {
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
    const error = validateCandidatePort(port, 'replace_end', waypoints);
    if (error) {
      return { waypoints: [...waypoints], error, addedRole: 'end' };
    }
    const next = simulateNextWaypoints(port, 'replace_end', waypoints);
    return { waypoints: next, error: null, addedRole: 'end' };
  }

  // 4. 경유지 추가 또는 지도 3번째+ 클릭 (waypoints.length >= 2)
  if (waypoints.length === 0) {
    return applyDirectPortSelection(port, waypoints, 'start');
  }
  if (waypoints.length === 1) {
    return applyDirectPortSelection(port, waypoints, 'end');
  }

  // 4-A. 지도 클릭(targetSlot == null) 시 이미 중간 경유지(wp.type === 'waypoint')로 등록된 항구를 다시 누르면 즉시 토글 해제
  if (!targetSlot) {
    const existingWaypointIdx = waypoints.findIndex(
      (wp, idx) =>
        idx > 0 &&
        idx < waypoints.length - 1 &&
        (wp.matchedPortId ?? wp.name) === port.id,
    );
    if (existingWaypointIdx !== -1) {
      const filtered = waypoints.filter((_, idx) => idx !== existingWaypointIdx);
      const sanitized = sanitizeCommittedRouteWaypoints(filtered).waypoints;
      return {
        waypoints: sanitized,
        error: null,
        addedRole: 'removed_waypoint',
      };
    }

    // 4-B. 지도 클릭 시 출발지(start) 마커를 다시 누른 경우: 중간에 다른 지점이 있으면 왕복 도착지(A → ... → A)로 설정
    const startKey = waypoints[0].matchedPortId ?? waypoints[0].name;
    const endKey =
      waypoints[waypoints.length - 1].matchedPortId ??
      waypoints[waypoints.length - 1].name;
    if (port.id === startKey && endKey !== startKey) {
      const roundTripWaypoints = normalizeWaypointTypes([
        ...waypoints,
        createWaypointFromRegisteredPort(port, 'end', 'wp_end_return'),
      ]);
      return {
        waypoints: roundTripWaypoints,
        error: null,
        addedRole: 'end',
      };
    }
  }

  // 4-C. 가는 길 최적 구간(findOptimalWaypointInsertIndex)에 신규 경유지로 삽입
  const error = validateCandidatePort(port, 'add_waypoint', waypoints);
  if (error) {
    return { waypoints: [...waypoints], error, addedRole: 'waypoint' };
  }
  const next = simulateNextWaypoints(port, 'add_waypoint', waypoints);
  return { waypoints: next, error: null, addedRole: 'waypoint' };
}

export interface ResolvedWaypointCandidate {
  name: string;
  lat: number;
  lng: number;
  matchedPortId?: string;
  isCustomCoord?: boolean;
  subCategory?: RouteWaypoint['subCategory'];
  facilityLabel?: string;
  minDepthMeters?: number;
  tidalSensitivity?: RouteWaypoint['tidalSensitivity'];
  maxVesselTons?: number;
  hazards?: string[];
}

function areWaypointsEffectivelySame(
  a: Pick<RouteWaypoint, 'lat' | 'lng' | 'matchedPortId'>,
  b: Pick<RouteWaypoint, 'lat' | 'lng' | 'matchedPortId'>,
): boolean {
  if (a.matchedPortId && b.matchedPortId) {
    return a.matchedPortId === b.matchedPortId;
  }
  if (a.matchedPortId || b.matchedPortId) {
    return false;
  }
  return calculateHaversineKm(a.lat, a.lng, b.lat, b.lng) * 1000 < 25;
}

function createWaypointFromResolvedCandidate(
  resolved: ResolvedWaypointCandidate,
  type: RouteWaypoint['type'],
  existingId?: string,
): RouteWaypoint {
  return {
    id:
      existingId ??
      `wp_${type}_${resolved.matchedPortId ?? 'custom'}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
    name: resolved.name,
    lat: resolved.lat,
    lng: resolved.lng,
    type,
    matchedPortId: resolved.matchedPortId,
    isCustomCoord: resolved.isCustomCoord ?? !resolved.matchedPortId,
    subCategory: resolved.subCategory,
    facilityLabel:
      resolved.facilityLabel ??
      (resolved.isCustomCoord || !resolved.matchedPortId
        ? '해상·해안 정박지'
        : undefined),
    minDepthMeters: resolved.minDepthMeters,
    tidalSensitivity: resolved.tidalSensitivity,
    maxVesselTons: resolved.maxVesselTons,
    hazards: resolved.hazards ? [...resolved.hazards] : undefined,
  };
}

function validateSimulatedCustomWaypoints(
  simulated: readonly RouteWaypoint[],
): string | null {
  if (simulated.length === 2 && areWaypointsEffectivelySame(simulated[0], simulated[1])) {
    return '출발지와 도착지가 같습니다. 왕복 운항은 경유지를 1곳 이상 추가한 뒤 설정하세요.';
  }
  for (let i = 0; i < simulated.length - 1; i += 1) {
    if (areWaypointsEffectivelySame(simulated[i], simulated[i + 1])) {
      return '직전(또는 다음) 지점과 동일한 위치는 연속해서 지정할 수 없습니다.';
    }
  }
  return null;
}

/**
 * [RC-BERTH-01 & RC-BERTH-04 해결]
 * 비교 프로젝트(바다꼼꼬미_수정본)의 직관적 순차 연결 UX와 378개 해안선 안전 스냅을 결합한 순차 추가 함수:
 * - 1번째 탭: 출발지('start')
 * - 2번째 탭: 도착지('end')
 * - 3번째+ 탭: 직전 도착지를 경유지('waypoint')로 자동 승격하고 새 지점을 도착지('end')로 순차 연장 (1 ➔ 2 ➔ 3)
 * - 이미 중간 경유지(1 .. length-2)로 등록된 지점을 다시 탭하면 즉시 토글 해제('removed_waypoint')
 */
export function appendSequentialRouteWaypoint(
  resolved: ResolvedWaypointCandidate,
  waypoints: readonly RouteWaypoint[],
): {
  waypoints: RouteWaypoint[];
  error: string | null;
  addedRole: 'start' | 'end' | 'waypoint' | 'removed_waypoint';
} {
  // 1. 이미 중간 경유지(wp.type === 'waypoint')로 등록된 지점을 재클릭한 경우 즉시 토글 해제
  if (waypoints.length >= 3) {
    const existingIntermediateIdx = waypoints.findIndex((wp, idx) => {
      if (idx === 0 || idx === waypoints.length - 1) return false;
      if (resolved.matchedPortId && wp.matchedPortId) {
        return resolved.matchedPortId === wp.matchedPortId;
      }
      return calculateHaversineKm(resolved.lat, resolved.lng, wp.lat, wp.lng) * 1000 < 60;
    });
    if (existingIntermediateIdx !== -1) {
      const filtered = waypoints.filter((_, idx) => idx !== existingIntermediateIdx);
      const sanitized = sanitizeCommittedRouteWaypoints(filtered).waypoints;
      return {
        waypoints: sanitized,
        error: null,
        addedRole: 'removed_waypoint',
      };
    }
  }

  // 2. 직전 마지막 지점과 연속 중복 차단
  const prev = waypoints[waypoints.length - 1];
  if (prev && areWaypointsEffectivelySame(prev, resolved)) {
    return {
      waypoints: [...waypoints],
      error:
        waypoints.length === 1
          ? '출발지와 다른 도착지를 선택해 주세요.'
          : '직전 지점과 동일한 위치입니다. 다른 지점을 선택해 주세요.',
      addedRole: waypoints.length === 1 ? 'end' : 'waypoint',
    };
  }

  const nextRole: RouteWaypoint['type'] = waypoints.length === 0 ? 'start' : 'end';
  const newWp = createWaypointFromResolvedCandidate(
    resolved,
    nextRole,
    waypoints.length === 0 ? 'wp_start' : undefined,
  );

  const next = sanitizeCommittedRouteWaypoints([...waypoints, newWp]).waypoints;
  return {
    waypoints: next,
    error: null,
    addedRole:
      next.length === 1 ? 'start' : waypoints.length === 1 ? 'end' : 'waypoint',
  };
}

/**
 * [RC-BERTH-02 / RC-BERTH-03 / RC-BERTH-07 해결]
 * 비항구 해상·해안 좌표, 선박 실시간 GPS 좌표, 또는 등록 항포구(ResolvedWaypointCandidate)를
 * 특정 슬롯('start' | 'end' | 'add_waypoint' | 'new_waypoint' | 'append_sequential' | waypoint.id)에 반영합니다.
 */
export function applyResolvedWaypointSelection(
  resolved: ResolvedWaypointCandidate,
  waypoints: readonly RouteWaypoint[],
  targetSlot?:
    | 'start'
    | 'end'
    | 'add_waypoint'
    | 'new_waypoint'
    | 'append_sequential'
    | string
    | null,
): {
  waypoints: RouteWaypoint[];
  error: string | null;
  addedRole: 'start' | 'end' | 'waypoint' | 'removed_waypoint';
} {
  if (!targetSlot || targetSlot === 'append_sequential') {
    return appendSequentialRouteWaypoint(resolved, waypoints);
  }

  // 1. 특정 waypointId 지정 교체 (마커 드래그 드롭 또는 슬롯별 변경)
  if (
    targetSlot !== 'start' &&
    targetSlot !== 'end' &&
    targetSlot !== 'add_waypoint' &&
    targetSlot !== 'new_waypoint'
  ) {
    const existingIdx = waypoints.findIndex((wp) => wp.id === targetSlot);
    if (existingIdx === 0) {
      return applyResolvedWaypointSelection(resolved, waypoints, 'start');
    }
    if (existingIdx === waypoints.length - 1 && waypoints.length >= 2) {
      return applyResolvedWaypointSelection(resolved, waypoints, 'end');
    }
    if (existingIdx > 0) {
      const next = [...waypoints];
      next[existingIdx] = createWaypointFromResolvedCandidate(
        resolved,
        next[existingIdx].type,
        next[existingIdx].id,
      );
      const normalized = normalizeWaypointTypes(next);
      const error = validateSimulatedCustomWaypoints(normalized);
      if (error) {
        return { waypoints: [...waypoints], error, addedRole: 'waypoint' };
      }
      return { waypoints: normalized, error: null, addedRole: 'waypoint' };
    }
  }

  // 2. 출발지 지정 또는 교체
  if (targetSlot === 'start') {
    if (waypoints.length === 0) {
      return {
        waypoints: [createWaypointFromResolvedCandidate(resolved, 'start', 'wp_start')],
        error: null,
        addedRole: 'start',
      };
    }
    const next = normalizeWaypointTypes([
      createWaypointFromResolvedCandidate(resolved, 'start', waypoints[0].id),
      ...waypoints.slice(1),
    ]);
    const error = validateSimulatedCustomWaypoints(next);
    if (error) {
      return { waypoints: [...waypoints], error, addedRole: 'start' };
    }
    return { waypoints: next, error: null, addedRole: 'start' };
  }

  // 3. 도착지 지정 또는 교체
  if (targetSlot === 'end') {
    if (waypoints.length === 0) {
      return {
        waypoints: [createWaypointFromResolvedCandidate(resolved, 'start', 'wp_start')],
        error: null,
        addedRole: 'start',
      };
    }
    if (waypoints.length === 1) {
      const next = normalizeWaypointTypes([
        waypoints[0],
        createWaypointFromResolvedCandidate(resolved, 'end', 'wp_end'),
      ]);
      const error = validateSimulatedCustomWaypoints(next);
      if (error) {
        return { waypoints: [...waypoints], error, addedRole: 'end' };
      }
      return { waypoints: next, error: null, addedRole: 'end' };
    }
    const next = normalizeWaypointTypes([
      ...waypoints.slice(0, -1),
      createWaypointFromResolvedCandidate(
        resolved,
        'end',
        waypoints[waypoints.length - 1].id,
      ),
    ]);
    const error = validateSimulatedCustomWaypoints(next);
    if (error) {
      return { waypoints: [...waypoints], error, addedRole: 'end' };
    }
    return { waypoints: next, error: null, addedRole: 'end' };
  }

  // 4. 경유지 추가 ('add_waypoint' | 'new_waypoint')
  if (waypoints.length < 2) {
    return appendSequentialRouteWaypoint(resolved, waypoints);
  }
  const { insertIndex } = findOptimalWaypointInsertIndex(
    { lat: resolved.lat, lng: resolved.lng },
    waypoints,
  );
  const next = [...waypoints];
  next.splice(
    insertIndex,
    0,
    createWaypointFromResolvedCandidate(resolved, 'waypoint'),
  );
  const normalized = normalizeWaypointTypes(next);
  const error = validateSimulatedCustomWaypoints(normalized);
  if (error) {
    return { waypoints: [...waypoints], error, addedRole: 'waypoint' };
  }
  return { waypoints: normalized, error: null, addedRole: 'waypoint' };
}
