import type { MarinePort, MarineWaypointNode } from '../types/port';
import type { RouteWaypoint, RouteLeg, RouteCalculationResult } from '../types/route';

const CHOSUNG_LIST = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
];

/**
 * 한글 문자열에서 초성(Chosung) 문자열 추출 (예: "삼덕항" -> "ㅅㄷㅎ")
 */
export function extractChosung(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 0xac00;
    if (code >= 0 && code <= 11171) {
      const chosungIndex = Math.floor(code / 588);
      result += CHOSUNG_LIST[chosungIndex] ?? text[i];
    } else {
      result += text[i];
    }
  }
  return result;
}

/**
 * 검색어가 한글 초성으로만 이루어져 있는지 확인
 */
export function isChosungOnlyQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  return /^[ㄱ-ㅎ\s]+$/.test(trimmed);
}

/**
 * 다중 필드(이름, 초성, 별칭, 섬 이름, 읍면동, 시설유형, 설명) 기반 지능형 항구/소규모 선착장 검색
 */
export function searchMarinePorts(
  ports: MarinePort[],
  query: string,
  filterKey: 'all' | '통영' | '거제' | 'small_berth' | 'port' | 'island' = 'all',
): MarinePort[] {
  const filtered = ports.filter((p) => {
    if (filterKey === '통영' || filterKey === '거제') {
      return p.region === filterKey;
    }
    if (filterKey === 'small_berth') {
      return p.subCategory === 'small_berth' || p.category === 'docking';
    }
    if (filterKey === 'port') {
      return p.subCategory === 'port' || p.category === 'port';
    }
    if (filterKey === 'island') {
      return Boolean(p.islandName);
    }
    return true;
  });

  const qRaw = query.trim();
  if (!qRaw) return filtered;

  const q = qRaw.toLowerCase().replace(/\s+/g, '');
  const isChosung = isChosungOnlyQuery(qRaw);

  const scored: { port: MarinePort; score: number }[] = [];

  for (const port of filtered) {
    let score = 0;
    const nameClean = port.name.toLowerCase().replace(/\s+/g, '');
    const nameChosung = extractChosung(port.name).replace(/\s+/g, '');
    const aliases = port.aliases ?? [];
    const islandClean = (port.islandName ?? '').toLowerCase().replace(/\s+/g, '');
    const eupClean = (port.eupmyeondong ?? '').toLowerCase().replace(/\s+/g, '');
    const facilityClean = (port.facilityLabel ?? '').toLowerCase().replace(/\s+/g, '');
    const descClean = port.description.toLowerCase().replace(/\s+/g, '');

    if (isChosung) {
      if (nameChosung.startsWith(q)) {
        score = 100;
      } else if (nameChosung.includes(q)) {
        score = 80;
      } else if (aliases.some((a) => extractChosung(a).replace(/\s+/g, '').includes(q))) {
        score = 75;
      } else if (islandClean && extractChosung(islandClean).includes(q)) {
        score = 65;
      }
    } else {
      if (nameClean === q) {
        score = 120;
      } else if (nameClean.startsWith(q)) {
        score = 100;
      } else if (nameClean.includes(q)) {
        score = 85;
      } else if (aliases.some((a) => a.toLowerCase().replace(/\s+/g, '').includes(q))) {
        score = 80;
      } else if (islandClean && islandClean.includes(q)) {
        score = 72;
      } else if (eupClean && eupClean.includes(q)) {
        score = 65;
      } else if (facilityClean && facilityClean.includes(q)) {
        score = 55;
      } else if (port.id.toLowerCase().includes(q)) {
        score = 50;
      } else if (descClean.includes(q)) {
        score = 40;
      }
    }

    if (score > 0) {
      scored.push({ port, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.port.name.localeCompare(b.port.name, 'ko'));
  return scored.map((s) => s.port);
}

/**
 * WGS84 좌표간 대권거리(Haversine Formula) 계산
 * @returns 킬로미터(km) 거리
 */
export function calculateHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // 지구 반경 (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 킬로미터를 해리(Nautical Miles)로 변환 (1 NM = 1.852 km)
 */
export function kmToNauticalMiles(km: number): number {
  return km / 1.852;
}

/**
 * 초기 선수 방위각(Initial Bearing / Forward Azimuth, 0° ~ 359°) 계산
 */
export function calculateBearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return Math.round(((theta * 180) / Math.PI + 360) % 360);
}

/**
 * 방위각(0~359°)을 8방위 문자열(N, NE, E, SE, S, SW, W, NW)로 변환
 */
export function bearingToCardinal8(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return dirs[idx];
}

/**
 * 예상 소요시간(분) 계산 공식
 * 예상 소요시간(분) = 거리(해리) ÷ 속력(노트) × 60
 */
export function calculateDurationMinutes(distanceNm: number, speedKnots: number): number {
  if (speedKnots <= 0) return 0;
  return (distanceNm / speedKnots) * 60;
}

/**
 * 지능형 항구/소규모 선착장/좌표 스냅 판정 (500m 이내 항포구/접안지 자동 매칭, 그 외 해상 좌표 표기)
 */
export function resolveSmartWaypoint(
  lat: number,
  lng: number,
  ports: MarinePort[],
  fallbackLabel: string,
  snapRadiusMeters = 500,
): {
  name: string;
  lat: number;
  lng: number;
  matchedPortId?: string;
  isCustomCoord: boolean;
  subCategory?: 'official_docking' | 'small_berth' | 'port';
  facilityLabel?: string;
  minDepthMeters?: number;
  tidalSensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';
  maxVesselTons?: number;
  hazards?: string[];
} {
  let closestPort: MarinePort | null = null;
  let minDistanceMeters = Infinity;

  for (const port of ports) {
    const distMeters = calculateHaversineKm(lat, lng, port.lat, port.lng) * 1000;
    if (distMeters < minDistanceMeters) {
      minDistanceMeters = distMeters;
      closestPort = port;
    }
  }

  if (closestPort && minDistanceMeters <= snapRadiusMeters) {
    return {
      name: closestPort.name,
      lat: closestPort.lat,
      lng: closestPort.lng,
      matchedPortId: closestPort.id,
      isCustomCoord: false,
      subCategory: closestPort.subCategory,
      facilityLabel: closestPort.facilityLabel,
      minDepthMeters: closestPort.minDepthMeters,
      tidalSensitivity: closestPort.tidalSensitivity,
      maxVesselTons: closestPort.maxVesselTons,
      hazards: closestPort.hazards,
    };
  }

  return {
    name: `${fallbackLabel} (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)`,
    lat,
    lng,
    matchedPortId: undefined,
    isCustomCoord: true,
  };
}

/**
 * 해상 변침점(Waypoint Graph) 기반 A* 최단 해상 항로 탐색
 */
function findShortestWaypointPath(
  startWpIds: string[],
  endWpIds: string[],
  endLat: number,
  endLng: number,
  waypointMap: Map<string, MarineWaypointNode>,
): MarineWaypointNode[] {
  const validStarts = startWpIds.filter((id) => waypointMap.has(id));
  const validEnds = new Set(endWpIds.filter((id) => waypointMap.has(id)));
  if (validStarts.length === 0 || validEnds.size === 0) return [];

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const openSet = new Set<string>();

  for (const sId of validStarts) {
    const node = waypointMap.get(sId)!;
    gScore.set(sId, 0);
    fScore.set(sId, calculateHaversineKm(node.lat, node.lng, endLat, endLng));
    openSet.add(sId);
  }

  while (openSet.size > 0) {
    let currentId: string | null = null;
    let bestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        currentId = id;
      }
    }

    if (!currentId) break;

    if (validEnds.has(currentId)) {
      const path: MarineWaypointNode[] = [];
      let curr: string | undefined = currentId;
      while (curr) {
        const node = waypointMap.get(curr);
        if (node) path.unshift(node);
        curr = cameFrom.get(curr);
      }
      return path;
    }

    openSet.delete(currentId);
    const currentNode = waypointMap.get(currentId);
    if (!currentNode) continue;

    const currentG = gScore.get(currentId) ?? Infinity;
    for (const neighborId of currentNode.neighbors) {
      const neighbor = waypointMap.get(neighborId);
      if (!neighbor) continue;
      const tentativeG =
        currentG +
        calculateHaversineKm(currentNode.lat, currentNode.lng, neighbor.lat, neighbor.lng);

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, currentId);
        gScore.set(neighborId, tentativeG);
        fScore.set(
          neighborId,
          tentativeG + calculateHaversineKm(neighbor.lat, neighbor.lng, endLat, endLng),
        );
        openSet.add(neighborId);
      }
    }
  }

  return [];
}

/**
 * 가장 가까운 해상 변침점 ID 2개 조회 (커스텀 해상 좌표용)
 */
function findNearestWaypointIds(
  lat: number,
  lng: number,
  waypoints: MarineWaypointNode[],
  count = 2,
): string[] {
  if (waypoints.length === 0) return [];
  const sorted = [...waypoints]
    .map((wp) => ({
      id: wp.id,
      dist: calculateHaversineKm(lat, lng, wp.lat, wp.lng),
    }))
    .sort((a, b) => a.dist - b.dist);
  return sorted.slice(0, count).map((s) => s.id);
}

/**
 * 두 지점 간 해상 우회 항로(A* Waypoint Graph + Sea Approach) 계산
 */
function computeSeaRouteSegment(
  from: RouteWaypoint,
  to: RouteWaypoint,
  portMap: Map<string, MarinePort>,
  waypoints: MarineWaypointNode[],
  waypointMap: Map<string, MarineWaypointNode>,
): {
  distanceKm: number;
  directDistanceKm: number;
  detourFactor: number;
  pathPositions: [number, number][];
  waypointNames: string[];
  midLat: number;
  midLng: number;
} {
  const directDistanceKm = calculateHaversineKm(from.lat, from.lng, to.lat, to.lng);
  const directPositions: [number, number][] = [
    [from.lat, from.lng],
    [to.lat, to.lng],
  ];

  if (waypoints.length === 0 || directDistanceKm < 0.35) {
    return {
      distanceKm: directDistanceKm,
      directDistanceKm,
      detourFactor: 1.0,
      pathPositions: directPositions,
      waypointNames: [],
      midLat: (from.lat + to.lat) / 2,
      midLng: (from.lng + to.lng) / 2,
    };
  }

  const fromPort = from.matchedPortId ? portMap.get(from.matchedPortId) : undefined;
  const toPort = to.matchedPortId ? portMap.get(to.matchedPortId) : undefined;

  // 같은 섬 또는 인접 동일 내만(6km 이내 & 공유 변침점 존재)인 경우 불필요한 우회 방지
  const fromWpIds =
    fromPort?.connectedWaypointIds && fromPort.connectedWaypointIds.length > 0
      ? fromPort.connectedWaypointIds
      : findNearestWaypointIds(from.lat, from.lng, waypoints, 2);
  const toWpIds =
    toPort?.connectedWaypointIds && toPort.connectedWaypointIds.length > 0
      ? toPort.connectedWaypointIds
      : findNearestWaypointIds(to.lat, to.lng, waypoints, 2);

  const sharesWaypoint = fromWpIds.some((id) => toWpIds.includes(id));
  const sameLocalArea =
    fromPort &&
    toPort &&
    ((fromPort.islandName && fromPort.islandName === toPort.islandName) ||
      (fromPort.eupmyeondong && fromPort.eupmyeondong === toPort.eupmyeondong));

  if (sharesWaypoint && (directDistanceKm <= 4.5 || (sameLocalArea && directDistanceKm <= 6.0))) {
    const pts: [number, number][] = [[from.lat, from.lng]];
    if (fromPort?.seaApproachLat && fromPort?.seaApproachLng) {
      pts.push([fromPort.seaApproachLat, fromPort.seaApproachLng]);
    }
    if (toPort?.seaApproachLat && toPort?.seaApproachLng) {
      pts.push([toPort.seaApproachLat, toPort.seaApproachLng]);
    }
    pts.push([to.lat, to.lng]);

    let distKm = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      distKm += calculateHaversineKm(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    }
    const midIdx = Math.floor(pts.length / 2);
    return {
      distanceKm: Math.max(distKm, directDistanceKm),
      directDistanceKm,
      detourFactor: directDistanceKm > 0 ? Math.max(1.0, distKm / directDistanceKm) : 1.0,
      pathPositions: pts,
      waypointNames: ['연안 직접 진입'],
      midLat: pts[midIdx][0],
      midLng: pts[midIdx][1],
    };
  }

  const wpPath = findShortestWaypointPath(fromWpIds, toWpIds, to.lat, to.lng, waypointMap);
  if (wpPath.length === 0) {
    return {
      distanceKm: directDistanceKm,
      directDistanceKm,
      detourFactor: 1.0,
      pathPositions: directPositions,
      waypointNames: [],
      midLat: (from.lat + to.lat) / 2,
      midLng: (from.lng + to.lng) / 2,
    };
  }

  const coords: [number, number][] = [[from.lat, from.lng]];
  if (fromPort?.seaApproachLat && fromPort?.seaApproachLng) {
    coords.push([fromPort.seaApproachLat, fromPort.seaApproachLng]);
  }
  for (const node of wpPath) {
    coords.push([node.lat, node.lng]);
  }
  if (toPort?.seaApproachLat && toPort?.seaApproachLng) {
    coords.push([toPort.seaApproachLat, toPort.seaApproachLng]);
  }
  coords.push([to.lat, to.lng]);

  let totalKm = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    totalKm += calculateHaversineKm(
      coords[i][0],
      coords[i][1],
      coords[i + 1][0],
      coords[i + 1][1],
    );
  }

  const midCoordIdx = Math.floor(coords.length / 2);
  return {
    distanceKm: totalKm,
    directDistanceKm,
    detourFactor: directDistanceKm > 0 ? Math.max(1.0, totalKm / directDistanceKm) : 1.0,
    pathPositions: coords,
    waypointNames: wpPath.map((w) => w.name),
    midLat: coords[midCoordIdx]?.[0] ?? (from.lat + to.lat) / 2,
    midLng: coords[midCoordIdx]?.[1] ?? (from.lng + to.lng) / 2,
  };
}

/**
 * 경로 포인트 목록과 선박 속력, 항포구/해상 변침점 그래프를 이용해 전체 및 구간별 항해 연산 수행
 */
export function calculateRouteSummary(
  waypoints: RouteWaypoint[],
  speedKnots: number,
  ports: MarinePort[] = [],
  marineWaypoints: MarineWaypointNode[] = [],
): RouteCalculationResult {
  if (waypoints.length < 2) {
    return {
      legs: [],
      totalDistanceKm: 0,
      totalDistanceNm: 0,
      totalDirectDistanceNm: 0,
      totalDurationMinutes: 0,
      speedKnots,
    };
  }

  const portMap = new Map<string, MarinePort>();
  for (const p of ports) {
    portMap.set(p.id, p);
  }
  const waypointMap = new Map<string, MarineWaypointNode>();
  for (const w of marineWaypoints) {
    waypointMap.set(w.id, w);
  }

  const legs: RouteLeg[] = [];
  let totalDistanceKm = 0;
  let totalDirectKm = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];

    const seg = computeSeaRouteSegment(from, to, portMap, marineWaypoints, waypointMap);
    const distanceKm = seg.distanceKm;
    const distanceNm = kmToNauticalMiles(distanceKm);
    const directDistanceNm = kmToNauticalMiles(seg.directDistanceKm);
    const durationMinutes = calculateDurationMinutes(distanceNm, speedKnots);
    const bearingDeg = calculateBearingDegrees(from.lat, from.lng, to.lat, to.lng);
    const cardinal = bearingToCardinal8(bearingDeg);

    const toPort = to.matchedPortId ? portMap.get(to.matchedPortId) : undefined;
    let safetyLevel: 'safe' | 'caution' | 'danger' = 'safe';
    let safetyNote: string | undefined;

    const minDepth = to.minDepthMeters ?? toPort?.minDepthMeters;
    const tidal = to.tidalSensitivity ?? toPort?.tidalSensitivity;
    const hazards = to.hazards ?? toPort?.hazards ?? [];

    if ((minDepth !== undefined && minDepth < 1.5) || tidal === 'HIGH') {
      safetyLevel = 'danger';
      safetyNote = `간조 수심 주의 (${minDepth ?? 1.2}m) · ${hazards[0] ?? '스크류/헐 접촉 주의'}`;
    } else if ((minDepth !== undefined && minDepth < 2.2) || tidal === 'MEDIUM' || hazards.length > 0) {
      safetyLevel = 'caution';
      safetyNote = hazards[0] ?? `최저수심 ${minDepth ?? 2.0}m 확인 권장`;
    }

    legs.push({
      id: `${from.id}-${to.id}`,
      index: i + 1,
      from,
      to,
      midLat: seg.midLat,
      midLng: seg.midLng,
      distanceKm,
      distanceNm,
      directDistanceNm,
      detourFactor: seg.detourFactor,
      durationMinutes,
      bearingDeg,
      cardinal,
      pathPositions: seg.pathPositions,
      waypointNames: seg.waypointNames,
      safetyLevel,
      safetyNote,
    });
    totalDistanceKm += distanceKm;
    totalDirectKm += seg.directDistanceKm;
  }

  const totalDistanceNm = kmToNauticalMiles(totalDistanceKm);
  const totalDirectDistanceNm = kmToNauticalMiles(totalDirectKm);
  const totalDurationMinutes = calculateDurationMinutes(totalDistanceNm, speedKnots);

  return {
    legs,
    totalDistanceKm,
    totalDistanceNm,
    totalDirectDistanceNm,
    totalDurationMinutes,
    speedKnots,
  };
}
