import type { MarinePort, MarineWaypointNode } from '../types/port';
import type {
  RouteWaypoint,
  RouteLeg,
  RouteCalculationResult,
  RouteDirectionArrowPoint,
  RouteWaypointGuidePoint,
} from '../types/route';

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
      } else if (eupClean && extractChosung(eupClean).includes(q)) {
        score = 60;
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
  return Math.round(((theta * 180) / Math.PI + 360) % 360) % 360;
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
 * 해상기상 조회 좌표(lat, lng) 기준으로 가장 가까운 항포구·선착장 또는 해역 설명 문자열 생성
 */
export function describeNearestPortArea(
  lat: number,
  lng: number,
  ports: MarinePort[],
): string {
  if (!ports || ports.length === 0) {
    return `통영·거제 해역 (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)`;
  }

  let closestPort: MarinePort | null = null;
  let minKm = Infinity;

  for (const port of ports) {
    const dKm = calculateHaversineKm(lat, lng, port.lat, port.lng);
    if (dKm < minKm) {
      minKm = dKm;
      closestPort = port;
    }
  }

  if (!closestPort) {
    return `통영·거제 해역 (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)`;
  }

  if (minKm <= 0.6) {
    return `${closestPort.name} 전면 해역`;
  }
  if (minKm <= 5.0) {
    const bearingFromPort = calculateBearingDegrees(
      closestPort.lat,
      closestPort.lng,
      lat,
      lng,
    );
    const dir = bearingToCardinal8(bearingFromPort);
    return `${closestPort.name} ${dir} ${minKm.toFixed(1)}km 해역`;
  }
  return `통영·거제 외해 (${closestPort.name} 인근 ${minKm.toFixed(1)}km)`;
}

/**
 * 한려해상국립공원(통영·거제) 20대 주요 도서·반도 육지 배리어 코어 폴리곤 (WGS84 [lat, lng][])
 * - 단거리 직선 분기(sharesWaypoint/sameLocalArea) 및 양단 오버슈트 프루닝(pruneTerminalOvershoot) 시
 *   해상 선분이 섬이나 반도 산악 지형을 가로지르는 것을 원천 차단(Zero Land Crossing)합니다.
 */
export const LANDMASS_BARRIER_POLYGONS: ReadonlyArray<{
  id: string;
  name: string;
  polygon: ReadonlyArray<readonly [number, number]>;
}> = [
  {
    id: 'BARRIER-HANSAN',
    name: '한산도 본섬(망산)',
    polygon: [
      [34.784, 128.474],
      [34.78, 128.488],
      [34.768, 128.494],
      [34.764, 128.484],
      [34.769, 128.47],
    ],
  },
  {
    id: 'BARRIER-CHUBONG',
    name: '추봉도',
    polygon: [
      [34.756, 128.498],
      [34.756, 128.503],
      [34.751, 128.503],
      [34.751, 128.498],
    ],
  },
  {
    id: 'BARRIER-MIREUK',
    name: '미륵도 본섬(미륵산)',
    polygon: [
      [34.82, 128.397],
      [34.82, 128.424],
      [34.798, 128.426],
      [34.776, 128.404],
      [34.778, 128.39],
      [34.796, 128.387],
    ],
  },
  {
    id: 'BARRIER-TY-PENINSULA',
    name: '통영 본토 반도(정량·용남)',
    polygon: [
      [34.864, 128.416],
      [34.864, 128.45],
      [34.842, 128.448],
      [34.842, 128.42],
    ],
  },
  {
    id: 'BARRIER-TY-DOSAN-GWANGDO',
    name: '통영 도산·광도 본토',
    polygon: [
      [34.91, 128.34],
      [34.91, 128.41],
      [34.868, 128.408],
      [34.868, 128.355],
    ],
  },
  {
    id: 'BARRIER-SARYANG-UPPER',
    name: '사량도 상도',
    polygon: [
      [34.842, 128.24],
      [34.842, 128.254],
      [34.832, 128.254],
      [34.832, 128.234],
    ],
  },
  {
    id: 'BARRIER-SARYANG-LOWER',
    name: '사량도 하도',
    polygon: [
      [34.824, 128.232],
      [34.824, 128.252],
      [34.815, 128.25],
      [34.815, 128.232],
    ],
  },
  {
    id: 'BARRIER-YOKJI',
    name: '욕지도 본섬',
    polygon: [
      [34.648, 128.25],
      [34.648, 128.278],
      [34.628, 128.275],
      [34.628, 128.255],
    ],
  },
  {
    id: 'BARRIER-YEONHWA',
    name: '연화도',
    polygon: [
      [34.638, 128.362],
      [34.638, 128.378],
      [34.632, 128.378],
      [34.632, 128.362],
    ],
  },
  {
    id: 'BARRIER-BIJIN',
    name: '비진도',
    polygon: [
      [34.727, 128.456],
      [34.727, 128.462],
      [34.721, 128.462],
      [34.721, 128.456],
    ],
  },
  {
    id: 'BARRIER-MAEMUL',
    name: '대매물도',
    polygon: [
      [34.639, 128.564],
      [34.639, 128.571],
      [34.634, 128.571],
      [34.634, 128.564],
    ],
  },
  {
    id: 'BARRIER-GAJO',
    name: '가조도',
    polygon: [
      [34.932, 128.466],
      [34.932, 128.476],
      [34.916, 128.468],
      [34.916, 128.456],
    ],
  },
  {
    id: 'BARRIER-SANDAL',
    name: '산달도',
    polygon: [
      [34.82, 128.533],
      [34.82, 128.546],
      [34.806, 128.546],
      [34.806, 128.533],
    ],
  },
  {
    id: 'BARRIER-CHILCHEON',
    name: '칠천도',
    polygon: [
      [34.99, 128.612],
      [34.99, 128.628],
      [34.968, 128.628],
      [34.968, 128.602],
    ],
  },
  {
    id: 'BARRIER-GEOJE-DUNDEOK-SADEUNG',
    name: '거제 둔덕·사등 본토',
    polygon: [
      [34.906, 128.496],
      [34.906, 128.56],
      [34.846, 128.56],
      [34.846, 128.496],
    ],
  },
  {
    id: 'BARRIER-GEOJE-CORE',
    name: '거제도 중앙·동부 본토',
    polygon: [
      [34.93, 128.6],
      [34.93, 128.695],
      [34.812, 128.68],
      [34.812, 128.596],
    ],
  },
  {
    id: 'BARRIER-GEOJE-NAMBU-PENINSULA',
    name: '거제 남부면 망산·여차 반도',
    polygon: [
      [34.792, 128.592],
      [34.792, 128.66],
      [34.732, 128.662],
      [34.732, 128.598],
      [34.765, 128.582],
    ],
  },
  {
    id: 'BARRIER-GEOJE-GABAE-PENINSULA',
    name: '거제 동부면 가배·구영 반도',
    polygon: [
      [34.782, 128.573],
      [34.782, 128.584],
      [34.766, 128.584],
      [34.766, 128.573],
    ],
  },
  {
    id: 'BARRIER-GEOJE-JISEPO-JANGSEUNGPO',
    name: '거제 일운·장승포 서이말 반도',
    polygon: [
      [34.858, 128.708],
      [34.858, 128.73],
      [34.832, 128.732],
      [34.832, 128.708],
    ],
  },
  {
    id: 'BARRIER-GEOJE-JANGMOK',
    name: '거제 장목 반도',
    polygon: [
      [34.992, 128.655],
      [34.992, 128.685],
      [34.948, 128.698],
      [34.948, 128.655],
    ],
  },
];

function ccw(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function doSegmentsProperlyIntersect(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
  cLat: number,
  cLng: number,
  dLat: number,
  dLng: number,
): boolean {
  const d1 = ccw(aLng, aLat, bLng, bLat, cLng, cLat);
  const d2 = ccw(aLng, aLat, bLng, bLat, dLng, dLat);
  const d3 = ccw(cLng, cLat, dLng, dLat, aLng, aLat);
  const d4 = ccw(cLng, cLat, dLng, dLat, bLng, bLat);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function isPointInsidePolygon(
  lat: number,
  lng: number,
  polygon: ReadonlyArray<readonly [number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0];
    const xi = polygon[i][1];
    const yj = polygon[j][0];
    const xj = polygon[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 두 해상 좌표 간 선분이 주요 도서·반도 육지 배리어 폴리곤을 관통하는지 판정
 */
export function doesSegmentCrossLand(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): boolean {
  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;
  const segMinLat = Math.min(lat1, lat2);
  const segMaxLat = Math.max(lat1, lat2);
  const segMinLng = Math.min(lng1, lng2);
  const segMaxLng = Math.max(lng1, lng2);

  for (const barrier of LANDMASS_BARRIER_POLYGONS) {
    const poly = barrier.polygon;
    let pMinLat = Infinity;
    let pMaxLat = -Infinity;
    let pMinLng = Infinity;
    let pMaxLng = -Infinity;
    for (const [pLat, pLng] of poly) {
      if (pLat < pMinLat) pMinLat = pLat;
      if (pLat > pMaxLat) pMaxLat = pLat;
      if (pLng < pMinLng) pMinLng = pLng;
      if (pLng > pMaxLng) pMaxLng = pLng;
    }
    if (
      segMaxLat < pMinLat ||
      segMinLat > pMaxLat ||
      segMaxLng < pMinLng ||
      segMinLng > pMaxLng
    ) {
      continue;
    }

    if (isPointInsidePolygon(midLat, midLng, poly)) {
      return true;
    }

    for (let i = 0; i < poly.length; i++) {
      const [cLat, cLng] = poly[i];
      const [dLat, dLng] = poly[(i + 1) % poly.length];
      if (doSegmentsProperlyIntersect(lat1, lng1, lat2, lng2, cLat, cLng, dLat, dLng)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 세 지점 A -> B -> C에서 꼭짓점 B의 내부 사잇각(0° ~ 180°) 계산
 * - 180°: 완전 일직선 통과
 * - 0°에 가까울수록: B를 찍고 거의 정반대(U턴)로 되돌아오는 예각 스파이크
 */
export function calculateInteriorTurnAngleDeg(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
  cLat: number,
  cLng: number,
): number {
  const cosLat = Math.cos((bLat * Math.PI) / 180);
  const v1x = (aLng - bLng) * cosLat;
  const v1y = aLat - bLat;
  const v2x = (cLng - bLng) * cosLat;
  const v2y = cLat - bLat;
  const norm1 = Math.hypot(v1x, v1y);
  const norm2 = Math.hypot(v2x, v2y);
  if (norm1 < 1e-9 || norm2 < 1e-9) return 180;
  const cosTheta = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (norm1 * norm2)));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

/**
 * 해상 변침점(Waypoint Graph) 기반 True End-to-End A* 최단 해상 항로 탐색
 * - [RC-ROUTE-01 해결]: 시작 지점(startLat, startLng)에서 후보 시작 변침점(sId)까지의 진입 거리 및
 *   후보 종료 변침점(eId)에서 도착 지점(endLat, endLng)까지의 이탈 거리를 정확히 합산하여
 *   전역 최단 실항로를 선택합니다.
 */
function findShortestWaypointPath(
  startWpIds: string[],
  endWpIds: string[],
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  waypointMap: Map<string, MarineWaypointNode>,
): MarineWaypointNode[] {
  const validStarts = startWpIds.filter((id) => waypointMap.has(id));
  const validEnds = new Set(endWpIds.filter((id) => waypointMap.has(id)));
  if (validStarts.length === 0 || validEnds.size === 0) return [];

  const GOAL_ID = '__ROUTE_GOAL__';
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const openSet = new Set<string>();

  for (const sId of validStarts) {
    const node = waypointMap.get(sId)!;
    const entryDistKm = calculateHaversineKm(startLat, startLng, node.lat, node.lng);
    const landPenaltyKm = doesSegmentCrossLand(startLat, startLng, node.lat, node.lng) ? 35 : 0;
    const initialG = entryDistKm + landPenaltyKm;
    if (initialG < (gScore.get(sId) ?? Infinity)) {
      gScore.set(sId, initialG);
      fScore.set(sId, initialG + calculateHaversineKm(node.lat, node.lng, endLat, endLng));
      openSet.add(sId);
    }
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

    if (currentId === GOAL_ID) {
      const path: MarineWaypointNode[] = [];
      let curr: string | undefined = cameFrom.get(GOAL_ID);
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

    // 현재 변침점이 도착 후보군에 속하면 도착 진입점(endLat, endLng)까지의 이탈 비용을 합산해 GOAL_ID 후보 갱신
    if (validEnds.has(currentId)) {
      const exitDistKm = calculateHaversineKm(currentNode.lat, currentNode.lng, endLat, endLng);
      const exitPenaltyKm = doesSegmentCrossLand(
        currentNode.lat,
        currentNode.lng,
        endLat,
        endLng,
      )
        ? 35
        : 0;
      const totalGoalCost = currentG + exitDistKm + exitPenaltyKm;
      if (totalGoalCost < (gScore.get(GOAL_ID) ?? Infinity)) {
        cameFrom.set(GOAL_ID, currentId);
        gScore.set(GOAL_ID, totalGoalCost);
        fScore.set(GOAL_ID, totalGoalCost);
        openSet.add(GOAL_ID);
      }
    }

    for (const neighborId of currentNode.neighbors) {
      const neighbor = waypointMap.get(neighborId);
      if (!neighbor) continue;
      const edgeDistKm = calculateHaversineKm(
        currentNode.lat,
        currentNode.lng,
        neighbor.lat,
        neighbor.lng,
      );
      const tentativeG = currentG + edgeDistKm;

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
 * [RC-ROUTE-02 해결]: 수로 중간에 위치한 항포구가 양단 변침점까지 초과 직진한 뒤
 * 예각(내각 < 75°, 즉 105° 이상 급반전 U턴)으로 되돌아오는 오버슈트 스파이크를 제거합니다.
 * - 단, 변침점을 생략했을 때 육지 배리어(doesSegmentCrossLand)를 관통하면 절대 생략하지 않습니다.
 */
function pruneTerminalOvershoot(
  fromSeaLat: number,
  fromSeaLng: number,
  toSeaLat: number,
  toSeaLng: number,
  wpPath: MarineWaypointNode[],
): MarineWaypointNode[] {
  const pruned = [...wpPath];

  // 1) 출발단(Start) 오버슈트 프루닝
  while (pruned.length >= 1) {
    const firstWp = pruned[0];
    const nextLat = pruned.length >= 2 ? pruned[1].lat : toSeaLat;
    const nextLng = pruned.length >= 2 ? pruned[1].lng : toSeaLng;

    const turnAngle = calculateInteriorTurnAngleDeg(
      fromSeaLat,
      fromSeaLng,
      firstWp.lat,
      firstWp.lng,
      nextLat,
      nextLng,
    );
    const viaDist =
      calculateHaversineKm(fromSeaLat, fromSeaLng, firstWp.lat, firstWp.lng) +
      calculateHaversineKm(firstWp.lat, firstWp.lng, nextLat, nextLng);
    const shortcutDist = calculateHaversineKm(fromSeaLat, fromSeaLng, nextLat, nextLng);

    if (
      turnAngle < 75 &&
      shortcutDist + 0.15 < viaDist &&
      shortcutDist <= 14.0 &&
      !doesSegmentCrossLand(fromSeaLat, fromSeaLng, nextLat, nextLng)
    ) {
      pruned.shift();
    } else {
      break;
    }
  }

  // 2) 도착단(End) 오버슈트 프루닝
  while (pruned.length >= 1) {
    const lastWp = pruned[pruned.length - 1];
    const prevLat = pruned.length >= 2 ? pruned[pruned.length - 2].lat : fromSeaLat;
    const prevLng = pruned.length >= 2 ? pruned[pruned.length - 2].lng : fromSeaLng;

    const turnAngle = calculateInteriorTurnAngleDeg(
      prevLat,
      prevLng,
      lastWp.lat,
      lastWp.lng,
      toSeaLat,
      toSeaLng,
    );
    const viaDist =
      calculateHaversineKm(prevLat, prevLng, lastWp.lat, lastWp.lng) +
      calculateHaversineKm(lastWp.lat, lastWp.lng, toSeaLat, toSeaLng);
    const shortcutDist = calculateHaversineKm(prevLat, prevLng, toSeaLat, toSeaLng);

    if (
      turnAngle < 75 &&
      shortcutDist + 0.15 < viaDist &&
      shortcutDist <= 14.0 &&
      !doesSegmentCrossLand(prevLat, prevLng, toSeaLat, toSeaLng)
    ) {
      pruned.pop();
    } else {
      break;
    }
  }

  return pruned;
}

/**
 * [RC-ROUTE-05 해결]: 폴리라인 전체 누적 호장(Arc-Length)의 정확한 50% 진중점 좌표 산출
 */
export function getPolylineArcMidpoint(coords: [number, number][]): {
  midLat: number;
  midLng: number;
  midBearingDeg: number;
} {
  if (coords.length === 0) {
    return { midLat: 34.82, midLng: 128.45, midBearingDeg: 0 };
  }
  if (coords.length === 1) {
    return { midLat: coords[0][0], midLng: coords[0][1], midBearingDeg: 0 };
  }

  const segLengths: number[] = [];
  let totalKm = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const len = calculateHaversineKm(
      coords[i][0],
      coords[i][1],
      coords[i + 1][0],
      coords[i + 1][1],
    );
    segLengths.push(len);
    totalKm += len;
  }

  if (totalKm <= 1e-6) {
    return {
      midLat: (coords[0][0] + coords[coords.length - 1][0]) / 2,
      midLng: (coords[0][1] + coords[coords.length - 1][1]) / 2,
      midBearingDeg: calculateBearingDegrees(
        coords[0][0],
        coords[0][1],
        coords[coords.length - 1][0],
        coords[coords.length - 1][1],
      ),
    };
  }

  const halfKm = totalKm * 0.5;
  let accumKm = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (accumKm + segLen >= halfKm || i === segLengths.length - 1) {
      const ratio = segLen > 1e-6 ? Math.max(0, Math.min(1, (halfKm - accumKm) / segLen)) : 0.5;
      const [lat1, lng1] = coords[i];
      const [lat2, lng2] = coords[i + 1];
      return {
        midLat: lat1 + (lat2 - lat1) * ratio,
        midLng: lng1 + (lng2 - lng1) * ratio,
        midBearingDeg: calculateBearingDegrees(lat1, lng1, lat2, lng2),
      };
    }
    accumKm += segLen;
  }

  const lastIdx = coords.length - 1;
  return {
    midLat: (coords[0][0] + coords[lastIdx][0]) / 2,
    midLng: (coords[0][1] + coords[lastIdx][1]) / 2,
    midBearingDeg: calculateBearingDegrees(
      coords[0][0],
      coords[0][1],
      coords[lastIdx][0],
      coords[lastIdx][1],
    ),
  };
}

/**
 * [RC-VIS-01 해결]: 구간 폴리라인을 따라 등간격 진행 방향 화살표(➤) 위치 및 회전 방위각 샘플링
 * - 출항/입항 마커 반경(220m) 및 구간 중앙 배지 반경(220m)과의 겹침을 자동 회피합니다.
 */
export function samplePolylineDirectionArrows(
  coords: [number, number][],
  legIndex: number,
): RouteDirectionArrowPoint[] {
  if (coords.length < 2) return [];

  const segLengths: number[] = [];
  let totalKm = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const len = calculateHaversineKm(
      coords[i][0],
      coords[i][1],
      coords[i + 1][0],
      coords[i + 1][1],
    );
    segLengths.push(len);
    totalKm += len;
  }

  if (totalKm < 0.35) return [];

  const halfKm = totalKm * 0.5;
  const targetDistancesKm: number[] = [];

  if (totalKm < 1.6) {
    // 단거리 구간(0.35 ~ 1.6km): 중앙 배지와 겹치지 않는 30% 및 72% 지점에 최대 2개 배치
    targetDistancesKm.push(totalKm * 0.28);
    if (totalKm >= 0.9) {
      targetDistancesKm.push(totalKm * 0.74);
    }
  } else {
    // 중·장거리 구간: 약 1.35km 간격(최소 2개 ~ 최대 8개)으로 등간격 샘플링하되 중앙 배지(±0.24km) 회피
    const desiredCount = Math.max(2, Math.min(8, Math.floor(totalKm / 1.35)));
    const stepKm = totalKm / (desiredCount + 1);
    for (let k = 1; k <= desiredCount; k++) {
      const dKm = stepKm * k;
      if (dKm < 0.22 || totalKm - dKm < 0.22) continue;
      if (Math.abs(dKm - halfKm) < 0.24) {
        // 중앙 배지와 너무 가까우면 살짝 앞뒤로 오프셋
        const shifted = dKm < halfKm ? halfKm - 0.32 : halfKm + 0.32;
        if (shifted > 0.24 && totalKm - shifted > 0.24) {
          targetDistancesKm.push(shifted);
        }
      } else {
        targetDistancesKm.push(dKm);
      }
    }
  }

  const arrows: RouteDirectionArrowPoint[] = [];
  for (const targetKm of targetDistancesKm) {
    let accumKm = 0;
    for (let i = 0; i < segLengths.length; i++) {
      const segLen = segLengths[i];
      if (accumKm + segLen >= targetKm || i === segLengths.length - 1) {
        if (segLen < 0.02) break;
        const ratio = Math.max(0, Math.min(1, (targetKm - accumKm) / segLen));
        const [lat1, lng1] = coords[i];
        const [lat2, lng2] = coords[i + 1];
        const lat = lat1 + (lat2 - lat1) * ratio;
        const lng = lng1 + (lng2 - lng1) * ratio;
        const bearingDeg = calculateBearingDegrees(lat1, lng1, lat2, lng2);
        arrows.push({
          lat,
          lng,
          bearingDeg,
          legIndex,
          distanceFromLegStartKm: Number(targetKm.toFixed(2)),
        });
        break;
      }
      accumKm += segLen;
    }
  }

  return arrows;
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
 * 두 지점 간 해상 우회 항로(True End-to-End A* Waypoint Graph + Land Barrier Guard + Overshoot Pruning) 계산
 */
function computeSeaRouteSegment(
  from: RouteWaypoint,
  to: RouteWaypoint,
  legIndex: number,
  portMap: Map<string, MarinePort>,
  waypoints: MarineWaypointNode[],
  waypointMap: Map<string, MarineWaypointNode>,
): {
  distanceKm: number;
  directDistanceKm: number;
  detourFactor: number;
  pathPositions: [number, number][];
  waypointNames: string[];
  activeWaypoints: RouteWaypointGuidePoint[];
  directionArrows: RouteDirectionArrowPoint[];
  midLat: number;
  midLng: number;
} {
  const directDistanceKm = calculateHaversineKm(from.lat, from.lng, to.lat, to.lng);
  const directPositions: [number, number][] = [
    [from.lat, from.lng],
    [to.lat, to.lng],
  ];

  if (waypoints.length === 0 || directDistanceKm < 0.35) {
    const mid = getPolylineArcMidpoint(directPositions);
    return {
      distanceKm: directDistanceKm,
      directDistanceKm,
      detourFactor: 1.0,
      pathPositions: directPositions,
      waypointNames: [],
      activeWaypoints: [],
      directionArrows: samplePolylineDirectionArrows(directPositions, legIndex),
      midLat: mid.midLat,
      midLng: mid.midLng,
    };
  }

  const fromPort = from.matchedPortId ? portMap.get(from.matchedPortId) : undefined;
  const toPort = to.matchedPortId ? portMap.get(to.matchedPortId) : undefined;

  const fromSeaLat = fromPort?.seaApproachLat ?? from.lat;
  const fromSeaLng = fromPort?.seaApproachLng ?? from.lng;
  const toSeaLat = toPort?.seaApproachLat ?? to.lat;
  const toSeaLng = toPort?.seaApproachLng ?? to.lng;

  const fromWpIds =
    fromPort?.connectedWaypointIds && fromPort.connectedWaypointIds.length > 0
      ? fromPort.connectedWaypointIds
      : findNearestWaypointIds(fromSeaLat, fromSeaLng, waypoints, 2);
  const toWpIds =
    toPort?.connectedWaypointIds && toPort.connectedWaypointIds.length > 0
      ? toPort.connectedWaypointIds
      : findNearestWaypointIds(toSeaLat, toSeaLng, waypoints, 2);

  const sharedWpIds = fromWpIds.filter((id) => toWpIds.includes(id));
  const sharesWaypoint = sharedWpIds.length > 0;
  const sameLocalArea =
    fromPort &&
    toPort &&
    ((fromPort.islandName && fromPort.islandName === toPort.islandName) ||
      (fromPort.eupmyeondong && fromPort.eupmyeondong === toPort.eupmyeondong));

  // [RC-ROUTE-03 해결]: 단거리 연안 직접 진입은 반드시 육지 배리어를 관통하지 않을 때만 허용!
  const directSeaCrossesLand =
    doesSegmentCrossLand(fromSeaLat, fromSeaLng, toSeaLat, toSeaLng) ||
    doesSegmentCrossLand(from.lat, from.lng, fromSeaLat, fromSeaLng) ||
    doesSegmentCrossLand(toSeaLat, toSeaLng, to.lat, to.lng);

  if (
    !directSeaCrossesLand &&
    sharesWaypoint &&
    (directDistanceKm <= 4.2 || (sameLocalArea && directDistanceKm <= 5.5))
  ) {
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
    const mid = getPolylineArcMidpoint(pts);
    return {
      distanceKm: Math.max(distKm, directDistanceKm),
      directDistanceKm,
      detourFactor: directDistanceKm > 0 ? Math.max(1.0, distKm / directDistanceKm) : 1.0,
      pathPositions: pts,
      waypointNames: ['연안 직접 진입'],
      activeWaypoints: [],
      directionArrows: samplePolylineDirectionArrows(pts, legIndex),
      midLat: mid.midLat,
      midLng: mid.midLng,
    };
  }

  const rawWpPath = findShortestWaypointPath(
    fromWpIds,
    toWpIds,
    fromSeaLat,
    fromSeaLng,
    toSeaLat,
    toSeaLng,
    waypointMap,
  );

  if (rawWpPath.length === 0) {
    const mid = getPolylineArcMidpoint(directPositions);
    return {
      distanceKm: directDistanceKm,
      directDistanceKm,
      detourFactor: 1.0,
      pathPositions: directPositions,
      waypointNames: [],
      activeWaypoints: [],
      directionArrows: samplePolylineDirectionArrows(directPositions, legIndex),
      midLat: mid.midLat,
      midLng: mid.midLng,
    };
  }

  // 양단 변침점 오버슈트(U턴 역주행) 프루닝 수행
  const wpPath = pruneTerminalOvershoot(fromSeaLat, fromSeaLng, toSeaLat, toSeaLng, rawWpPath);

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

  const mid = getPolylineArcMidpoint(coords);
  const activeWaypoints: RouteWaypointGuidePoint[] = wpPath.map((w) => ({
    id: w.id,
    name: w.name,
    lat: w.lat,
    lng: w.lng,
    legIndex,
  }));

  return {
    distanceKm: totalKm,
    directDistanceKm,
    detourFactor: directDistanceKm > 0 ? Math.max(1.0, totalKm / directDistanceKm) : 1.0,
    pathPositions: coords,
    waypointNames: wpPath.length > 0 ? wpPath.map((w) => w.name) : ['연안 직접 진입'],
    activeWaypoints,
    directionArrows: samplePolylineDirectionArrows(coords, legIndex),
    midLat: mid.midLat,
    midLng: mid.midLng,
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
  let cumulativeMinutes = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];

    const seg = computeSeaRouteSegment(from, to, i, portMap, marineWaypoints, waypointMap);
    const distanceKm = seg.distanceKm;
    const distanceNm = kmToNauticalMiles(distanceKm);
    const directDistanceNm = kmToNauticalMiles(seg.directDistanceKm);
    const durationMinutes = calculateDurationMinutes(distanceNm, speedKnots);
    const startCumulativeMinutes = cumulativeMinutes;
    const endCumulativeMinutes = cumulativeMinutes + durationMinutes;
    cumulativeMinutes = endCumulativeMinutes;

    const directBearingDeg = calculateBearingDegrees(from.lat, from.lng, to.lat, to.lng);
    const directCardinal = bearingToCardinal8(directBearingDeg);

    // A* 우회 수로가 있는 경우 출발지에서 첫 유효 해상 변침점(50m 이상 이격)으로 향하는 실제 출항 침로 산출
    let bearingDeg = directBearingDeg;
    if (seg.pathPositions.length >= 2) {
      for (let pIdx = 1; pIdx < seg.pathPositions.length; pIdx++) {
        const [targetLat, targetLng] = seg.pathPositions[pIdx];
        const stepKm = calculateHaversineKm(from.lat, from.lng, targetLat, targetLng);
        if (stepKm >= 0.05 || pIdx === seg.pathPositions.length - 1) {
          bearingDeg = calculateBearingDegrees(from.lat, from.lng, targetLat, targetLng);
          break;
        }
      }
    }
    const cardinal = bearingToCardinal8(bearingDeg);

    // 최종 도착지 진입 직전 유효 구간(50m 이상)의 입항 침로 산출
    let arrivalBearingDeg = bearingDeg;
    if (seg.pathPositions.length >= 2) {
      for (let pIdx = seg.pathPositions.length - 2; pIdx >= 0; pIdx--) {
        const [prevLat, prevLng] = seg.pathPositions[pIdx];
        const stepKm = calculateHaversineKm(prevLat, prevLng, to.lat, to.lng);
        if (stepKm >= 0.05 || pIdx === 0) {
          arrivalBearingDeg = calculateBearingDegrees(prevLat, prevLng, to.lat, to.lng);
          break;
        }
      }
    }
    const arrivalCardinal = bearingToCardinal8(arrivalBearingDeg);

    const toPort = to.matchedPortId ? portMap.get(to.matchedPortId) : undefined;
    let safetyLevel: 'safe' | 'caution' | 'danger' = 'safe';
    let safetyNote: string | undefined;

    const minDepth = to.minDepthMeters ?? toPort?.minDepthMeters;
    const tidal = to.tidalSensitivity ?? toPort?.tidalSensitivity;
    const hazards = to.hazards ?? toPort?.hazards ?? [];

    if ((minDepth !== undefined && minDepth < 1.5) || tidal === 'HIGH') {
      safetyLevel = 'danger';
      safetyNote = `간조 수심 주의 (${minDepth ?? 1.2}m) · ${hazards[0] ?? '스크류/헐 접촉 주의'}`;
    } else if (
      (minDepth !== undefined && minDepth < 2.2) ||
      tidal === 'MEDIUM' ||
      hazards.length > 0
    ) {
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
      startCumulativeMinutes,
      endCumulativeMinutes,
      bearingDeg,
      cardinal,
      arrivalBearingDeg,
      arrivalCardinal,
      directBearingDeg,
      directCardinal,
      pathPositions: seg.pathPositions,
      waypointNames: seg.waypointNames,
      activeWaypoints: seg.activeWaypoints,
      directionArrows: seg.directionArrows,
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
