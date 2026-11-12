import type { MarinePort, MarineWaypointNode } from '../types/port';
import type {
  RouteWaypoint,
  RouteLeg,
  RouteCalculationResult,
  RouteDirectionArrowPoint,
  RouteWaypointGuidePoint,
} from '../types/route';
import { REAL_COASTLINE_POLYGONS, type CoastlineBarrierPolygon } from '../data/coastlinePolygons.ts';

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
 * 커스텀 해상 좌표(isCustomCoord === true) 전용 인근 지명 보조 라벨 생성
 * - 주의: 공식 항구/선착장(!isCustomCoord)의 원래 이름을 절대 덮어쓰지 않고,
 *   사용자가 바다 위 임의 좌표를 찍어 생성된 커스텀 경유지에만 인근 도서·항포구 지명을 보조 표기합니다.
 */
export function getNearbyMarinePlaceLabel(
  lat: number,
  lng: number,
  ports: MarinePort[],
  maxRadiusNm = 5,
): string | null {
  if (!ports || ports.length === 0) return null;

  let closestPort: MarinePort | null = null;
  let minKm = Infinity;

  for (const port of ports) {
    const dKm = calculateHaversineKm(lat, lng, port.lat, port.lng);
    if (dKm < minKm) {
      minKm = dKm;
      closestPort = port;
    }
  }

  const minNm = kmToNauticalMiles(minKm);
  if (!closestPort || minNm > maxRadiusNm) {
    return null;
  }

  const placeName = closestPort.islandName
    ? `${closestPort.islandName}·${closestPort.name}`
    : closestPort.name;
  return `${placeName} 인근 해상`;
}

/**
 * 지능형 항구/소규모 선착장/좌표 스냅 판정 (500m 이내 항포구/접안지 자동 매칭, 육지 산악/내륙 클릭 시 최근접 해상/항포구 자동 보정)
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
  wasSnappedFromLand?: boolean;
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
      wasSnappedFromLand: false,
      subCategory: closestPort.subCategory,
      facilityLabel: closestPort.facilityLabel,
      minDepthMeters: closestPort.minDepthMeters,
      tidalSensitivity: closestPort.tidalSensitivity,
      maxVesselTons: closestPort.maxVesselTons,
      hazards: closestPort.hazards,
    };
  }

  // [RC-UX-05 해결]: 지도 클릭 좌표가 실측 해안선 폴리곤 내부(육지/섬 내륙)인 경우 최근접 항포구 또는 해안선 외측 해상으로 자동 스냅 보정
  if (isPointInAnyLandBarrier(lat, lng)) {
    const snapped = snapLandPointToNearestSea(lat, lng, ports);
    if (snapped.snappedPort) {
      const p = snapped.snappedPort;
      return {
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        matchedPortId: p.id,
        isCustomCoord: false,
        wasSnappedFromLand: true,
        subCategory: p.subCategory,
        facilityLabel: p.facilityLabel,
        minDepthMeters: p.minDepthMeters,
        tidalSensitivity: p.tidalSensitivity,
        maxVesselTons: p.maxVesselTons,
        hazards: p.hazards,
      };
    }
    const nearbySnapLabel = getNearbyMarinePlaceLabel(snapped.lat, snapped.lng, ports);
    return {
      name: `${nearbySnapLabel ?? `${fallbackLabel}·해상보정`} (${snapped.lat.toFixed(3)}°N, ${snapped.lng.toFixed(3)}°E)`,
      lat: snapped.lat,
      lng: snapped.lng,
      matchedPortId: undefined,
      isCustomCoord: true,
      wasSnappedFromLand: true,
    };
  }

  const nearbyLabel = getNearbyMarinePlaceLabel(lat, lng, ports);
  return {
    name: `${nearbyLabel ?? fallbackLabel} (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)`,
    lat,
    lng,
    matchedPortId: undefined,
    isCustomCoord: true,
    wasSnappedFromLand: false,
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
 * 한려해상국립공원(통영·거제·고성·남해·진해만) 378개 실측 해안선·도서 폴리곤 (OpenStreetMap natural=coastline 정본, 12,794개 정점)
 * - 레거시 수동 67개 근사 다각형을 완전 폐기하고, 실측 본토 해안선 및 유·무인도(한산면 좌도·송도·유자도·비산도 등 전수 포함) 폴리곤을 사용합니다.
 */
export const LANDMASS_BARRIER_POLYGONS: readonly CoastlineBarrierPolygon[] =
  REAL_COASTLINE_POLYGONS;

/**
 * 378개 실측 해안선 폴리곤의 사전 연산 AABB 바운딩 박스 ($O(1)$ 고속 조기 기각용)
 */
const BARRIER_BBOXES: ReadonlyArray<{
  id: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  polygon: ReadonlyArray<readonly [number, number]>;
}> = LANDMASS_BARRIER_POLYGONS.map((b) => {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [pLat, pLng] of b.polygon) {
    if (pLat < minLat) minLat = pLat;
    if (pLat > maxLat) maxLat = pLat;
    if (pLng < minLng) minLng = pLng;
    if (pLng > maxLng) maxLng = pLng;
  }
  return {
    id: b.id,
    minLat,
    maxLat,
    minLng,
    maxLng,
    polygon: b.polygon,
  };
});

/**
 * 12,794개 실측 해안선 선분(Edge)을:
 * 1) 0.01° × 0.01° (~1km) 격자로 인덱싱한 공간 해시 그리드 (EDGE_SPATIAL_GRID)
 * 2) 0.005° (~550m) 위도 슬랩(Latitude Slab)으로 인덱싱한 Ray-Casting 인덱스 (LAT_SLAB_INDEX)
 * 로 이중 인덱싱하여 점 포함 판정(isPointInAnyLandBarrier)과 선분 교차 판정(doesSegmentCrossLand)을 마이크로초 단위로 가속합니다.
 */
const EDGE_GRID_CELL_DEG = 0.01;
const LAT_SLAB_DEG = 0.005;

const EDGE_SPATIAL_GRID: ReadonlyMap<
  string,
  ReadonlyArray<readonly [number, number, number, number]>
> = (() => {
  const grid = new Map<string, Array<readonly [number, number, number, number]>>();
  for (const b of LANDMASS_BARRIER_POLYGONS) {
    const poly = b.polygon;
    const len = poly.length;
    for (let i = 0; i < len; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % len];
      const minR = Math.floor(Math.min(p1[0], p2[0]) / EDGE_GRID_CELL_DEG);
      const maxR = Math.floor(Math.max(p1[0], p2[0]) / EDGE_GRID_CELL_DEG);
      const minC = Math.floor(Math.min(p1[1], p2[1]) / EDGE_GRID_CELL_DEG);
      const maxC = Math.floor(Math.max(p1[1], p2[1]) / EDGE_GRID_CELL_DEG);
      const edge: readonly [number, number, number, number] = [p1[0], p1[1], p2[0], p2[1]];
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          const key = `${r}:${c}`;
          let bucket = grid.get(key);
          if (!bucket) {
            bucket = [];
            grid.set(key, bucket);
          }
          bucket.push(edge);
        }
      }
    }
  }
  return grid;
})();

// [yi, xi, yj, xj, polyIndex]
const LAT_SLAB_INDEX: ReadonlyMap<
  number,
  ReadonlyArray<readonly [number, number, number, number, number]>
> = (() => {
  const slabs = new Map<number, Array<readonly [number, number, number, number, number]>>();
  for (let pIdx = 0; pIdx < LANDMASS_BARRIER_POLYGONS.length; pIdx++) {
    const poly = LANDMASS_BARRIER_POLYGONS[pIdx].polygon;
    const len = poly.length;
    for (let i = 0, j = len - 1; i < len; j = i++) {
      const yi = poly[i][0];
      const xi = poly[i][1];
      const yj = poly[j][0];
      const xj = poly[j][1];
      if (yi === yj) continue;
      const minSlab = Math.floor(Math.min(yi, yj) / LAT_SLAB_DEG);
      const maxSlab = Math.floor(Math.max(yi, yj) / LAT_SLAB_DEG);
      const entry: readonly [number, number, number, number, number] = [yi, xi, yj, xj, pIdx];
      for (let s = minSlab; s <= maxSlab; s++) {
        let list = slabs.get(s);
        if (!list) {
          list = [];
          slabs.set(s, list);
        }
        list.push(entry);
      }
    }
  }
  return slabs;
})();

const POLY_HIT_PARITY = new Uint8Array(LANDMASS_BARRIER_POLYGONS.length);
const TOUCHED_POLYS: number[] = [];

function ccw(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
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
  if (
    Math.max(aLat, bLat) < Math.min(cLat, dLat) ||
    Math.min(aLat, bLat) > Math.max(cLat, dLat) ||
    Math.max(aLng, bLng) < Math.min(cLng, dLng) ||
    Math.min(aLng, bLng) > Math.max(cLng, dLng)
  ) {
    return false;
  }
  return (
    ccw(aLng, aLat, cLng, cLat, dLng, dLat) !== ccw(bLng, bLat, cLng, cLat, dLng, dLat) &&
    ccw(aLng, aLat, bLng, bLat, cLng, cLat) !== ccw(aLng, aLat, bLng, bLat, dLng, dLat)
  );
}

/**
 * 단일 좌표가 378개 실측 해안선·도서 폴리곤 내부(육지)에 속하는지 $O(1)$ 위도 슬랩 인덱스로 판정
 */
export function isPointInAnyLandBarrier(lat: number, lng: number): boolean {
  const slabKey = Math.floor(lat / LAT_SLAB_DEG);
  const edges = LAT_SLAB_INDEX.get(slabKey);
  if (!edges) return false;

  for (let i = 0; i < edges.length; i++) {
    const e: readonly [number, number, number, number, number] = edges[i];
    const yi = e[0];
    const yj = e[2];
    if (yi > lat !== yj > lat) {
      const xi = e[1];
      const xj = e[3];
      const xIntersect = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (lng < xIntersect) {
        const pIdx = e[4];
        if (POLY_HIT_PARITY[pIdx] === 0) {
          TOUCHED_POLYS.push(pIdx);
        }
        POLY_HIT_PARITY[pIdx] ^= 1;
      }
    }
  }

  let inside = false;
  while (TOUCHED_POLYS.length > 0) {
    const pIdx = TOUCHED_POLYS.pop()!;
    if (POLY_HIT_PARITY[pIdx] === 1) {
      inside = true;
    }
    POLY_HIT_PARITY[pIdx] = 0;
  }
  return inside;
}

/**
 * 육지 내륙/산악 클릭 좌표를 가장 가까운 항포구 또는 실측 해안선 외측 해상으로 자동 보정
 */
export function snapLandPointToNearestSea(
  lat: number,
  lng: number,
  ports: MarinePort[] = [],
): {
  lat: number;
  lng: number;
  snappedPort?: MarinePort;
  wasOnLand: boolean;
} {
  if (!isPointInAnyLandBarrier(lat, lng)) {
    return { lat, lng, wasOnLand: false };
  }

  let closestPort: MarinePort | undefined;
  let minPortKm = Infinity;
  for (const port of ports) {
    const dKm = calculateHaversineKm(lat, lng, port.lat, port.lng);
    if (dKm < minPortKm) {
      minPortKm = dKm;
      closestPort = port;
    }
  }
  if (closestPort && minPortKm <= 2.4) {
    return {
      lat: closestPort.lat,
      lng: closestPort.lng,
      snappedPort: closestPort,
      wasOnLand: true,
    };
  }

  const cosLat = Math.cos((lat * Math.PI) / 180);
  let bestLat = lat;
  let bestLng = lng;
  let bestDistSq = Infinity;

  for (const b of BARRIER_BBOXES) {
    if (
      lat < b.minLat - 0.03 ||
      lat > b.maxLat + 0.03 ||
      lng < b.minLng - 0.03 ||
      lng > b.maxLng + 0.03
    ) {
      continue;
    }
    const poly = b.polygon;
    for (let i = 0; i < poly.length; i++) {
      const [aLat, aLng] = poly[i];
      const [dLat, dLng] = poly[(i + 1) % poly.length];
      const dx = (dLng - aLng) * cosLat;
      const dy = dLat - aLat;
      const lenSq = dx * dx + dy * dy;
      const t =
        lenSq > 1e-12
          ? Math.max(0, Math.min(1, (((lng - aLng) * cosLat) * dx + (lat - aLat) * dy) / lenSq))
          : 0;
      const projLat = aLat + t * (dLat - aLat);
      const projLng = aLng + t * (dLng - aLng);
      const distSq = (lat - projLat) ** 2 + ((lng - projLng) * cosLat) ** 2;
      if (distSq < bestDistSq) {
        const len = Math.sqrt(lenSq) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        for (const sign of [1, -1]) {
          const candLat = Number((projLat + sign * ny * 0.0012).toFixed(5));
          const candLng = Number((projLng + (sign * nx * 0.0012) / cosLat).toFixed(5));
          if (!isPointInAnyLandBarrier(candLat, candLng)) {
            bestDistSq = distSq;
            bestLat = candLat;
            bestLng = candLng;
            break;
          }
        }
      }
    }
  }

  if (isPointInAnyLandBarrier(bestLat, bestLng) && closestPort) {
    return {
      lat: closestPort.seaApproachLat ?? closestPort.lat,
      lng: closestPort.seaApproachLng ?? closestPort.lng,
      snappedPort: closestPort,
      wasOnLand: true,
    };
  }

  return { lat: bestLat, lng: bestLng, wasOnLand: true };
}

/**
 * 두 해상 좌표 간 선분이 378개 실측 해안선·도서 폴리곤(12,794개 해안선 선분)을 관통하는지 판정
 * - 1) 양 끝점 및 중점의 육지 폴리곤 포함 여부 검사
 * - 2) 0.01° × 0.01° 공간 해시 그리드(EDGE_SPATIAL_GRID)를 통한 고속 선분-해안선 교차 판정
 */
export function doesSegmentCrossLand(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): boolean {
  if (
    isPointInAnyLandBarrier(lat1, lng1) ||
    isPointInAnyLandBarrier(lat2, lng2) ||
    isPointInAnyLandBarrier((lat1 + lat2) * 0.5, (lng1 + lng2) * 0.5)
  ) {
    return true;
  }

  const minR = Math.floor(Math.min(lat1, lat2) / EDGE_GRID_CELL_DEG);
  const maxR = Math.floor(Math.max(lat1, lat2) / EDGE_GRID_CELL_DEG);
  const minC = Math.floor(Math.min(lng1, lng2) / EDGE_GRID_CELL_DEG);
  const maxC = Math.floor(Math.max(lng1, lng2) / EDGE_GRID_CELL_DEG);

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const bucket = EDGE_SPATIAL_GRID.get(`${r}:${c}`);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const edge = bucket[i];
        if (doSegmentsProperlyIntersect(lat1, lng1, lat2, lng2, edge[0], edge[1], edge[2], edge[3])) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * 세 지점 A -> B -> C에서 꼭짓점 B의 내부 사잇각(0° ~ 180°) 계산
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
 * [Tier-2 국지 해안 가시성 그래프 자동 우회 엔진 (C-Space Outward Normal Visibility Graph + Theta*)]
 * - 임의 해상 클릭 지점이나 항포구 진출입 구간이 국지 소도서·곶(Cape)과 교차할 때,
 *   주변 실측 해안선 폴리곤의 외곽 법선 이격 정점(Offset Vertices)을 추출해 가시성 그래프 A* 최단 우회선을 산출합니다.
 */
export function solveCoastalVisibilityDetour(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
  marginDeg = 0.04,
  offsetMeters = 115,
): [number, number][] | null {
  if (!doesSegmentCrossLand(aLat, aLng, bLat, bLng)) {
    return [
      [aLat, aLng],
      [bLat, bLng],
    ];
  }

  const minLat = Math.min(aLat, bLat) - marginDeg;
  const maxLat = Math.max(aLat, bLat) + marginDeg;
  const minLng = Math.min(aLng, bLng) - marginDeg;
  const maxLng = Math.max(aLng, bLng) + marginDeg;
  const cosLat = Math.cos(((aLat + bLat) * 0.5 * Math.PI) / 180);

  const nodes: [number, number][] = [
    [aLat, aLng],
    [bLat, bLng],
  ];

  for (const b of BARRIER_BBOXES) {
    if (maxLat < b.minLat || minLat > b.maxLat || maxLng < b.minLng || minLng > b.maxLng) {
      continue;
    }
    const poly = b.polygon;
    const n = poly.length;
    const step = n > 500 ? 2 : 1;
    for (let i = 0; i < n; i += step) {
      const curr = poly[i];
      if (curr[0] < minLat || curr[0] > maxLat || curr[1] < minLng || curr[1] > maxLng) {
        continue;
      }
      const prev = poly[(i - 1 + n) % n];
      const next = poly[(i + 1) % n];

      const e1x = (curr[1] - prev[1]) * cosLat;
      const e1y = curr[0] - prev[0];
      const l1 = Math.hypot(e1x, e1y) || 1;
      const n1x = -e1y / l1;
      const n1y = e1x / l1;

      const e2x = (next[1] - curr[1]) * cosLat;
      const e2y = next[0] - curr[0];
      const l2 = Math.hypot(e2x, e2y) || 1;
      const n2x = -e2y / l2;
      const n2y = e2x / l2;

      let bx = n1x + n2x;
      let by = n1y + n2y;
      const bl = Math.hypot(bx, by);
      if (bl < 1e-6) {
        bx = n1x;
        by = n1y;
      } else {
        bx /= bl;
        by /= bl;
      }

      for (const mult of [1, 1.8]) {
        let added = false;
        for (const sign of [1, -1]) {
          const candLat = Number((curr[0] + (sign * by * offsetMeters * mult) / 111320).toFixed(5));
          const candLng = Number(
            (curr[1] + (sign * bx * offsetMeters * mult) / (111320 * cosLat)).toFixed(5),
          );
          if (!isPointInAnyLandBarrier(candLat, candLng)) {
            nodes.push([candLat, candLng]);
            added = true;
            break;
          }
        }
        if (added) break;
      }
    }
  }

  const N = nodes.length;
  const gScore = new Float64Array(N).fill(Infinity);
  const fScore = new Float64Array(N).fill(Infinity);
  const parent = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);

  gScore[0] = 0;
  fScore[0] = calculateHaversineKm(aLat, aLng, bLat, bLng);
  const open: number[] = [0];

  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestIdx]]) bestIdx = i;
    }
    const u = open[bestIdx];
    open.splice(bestIdx, 1);

    if (u === 1) {
      const rawPath: [number, number][] = [];
      let cur = 1;
      while (cur !== -1) {
        rawPath.unshift(nodes[cur]);
        cur = parent[cur];
      }
      // Theta* Any-Angle Line-of-Sight String-Pulling
      const smoothed: [number, number][] = [rawPath[0]];
      let idx = 0;
      while (idx < rawPath.length - 1) {
        let nextIdx = idx + 1;
        for (let probe = rawPath.length - 1; probe > idx + 1; probe--) {
          if (
            !doesSegmentCrossLand(
              rawPath[idx][0],
              rawPath[idx][1],
              rawPath[probe][0],
              rawPath[probe][1],
            )
          ) {
            nextIdx = probe;
            break;
          }
        }
        smoothed.push(rawPath[nextIdx]);
        idx = nextIdx;
      }
      return smoothed;
    }

    closed[u] = 1;
    const uPt = nodes[u];

    for (let v = 1; v < N; v++) {
      if (closed[v]) continue;
      const vPt = nodes[v];
      const d = calculateHaversineKm(uPt[0], uPt[1], vPt[0], vPt[1]);
      if (v !== 1 && d > 12.0) continue;
      const tentativeG = gScore[u] + d;
      if (tentativeG >= gScore[v]) continue;
      if (doesSegmentCrossLand(uPt[0], uPt[1], vPt[0], vPt[1])) continue;

      parent[v] = u;
      gScore[v] = tentativeG;
      fScore[v] = tentativeG + calculateHaversineKm(vPt[0], vPt[1], bLat, bLng);
      if (!open.includes(v)) open.push(v);
    }
  }

  return null;
}

/**
 * 항포구 전면 해상(seaLat, seaLng)에서 정적 연결 변침점 + 가시선(Line-of-Sight)이 확보된 근접 변침점 결합
 */
function resolveVisibleWaypointIds(
  seaLat: number,
  seaLng: number,
  baseWpIds: string[],
  waypoints: MarineWaypointNode[],
  maxRadiusKm = 18.0,
  maxExtraCount = 5,
): string[] {
  const result = new Set<string>();
  for (const id of baseWpIds) {
    result.add(id);
  }
  const visibleExtras: Array<{ id: string; dist: number }> = [];
  for (const wp of waypoints) {
    if (result.has(wp.id)) continue;
    const dist = calculateHaversineKm(seaLat, seaLng, wp.lat, wp.lng);
    if (dist <= maxRadiusKm && !doesSegmentCrossLand(seaLat, seaLng, wp.lat, wp.lng)) {
      visibleExtras.push({ id: wp.id, dist });
    }
  }
  visibleExtras.sort((a, b) => a.dist - b.dist);
  for (let i = 0; i < Math.min(maxExtraCount, visibleExtras.length); i++) {
    result.add(visibleExtras[i].id);
  }
  return [...result];
}

const VALIDATED_WP_EDGE_CACHE = new Map<string, boolean>();

function isWaypointEdgeClear(u: MarineWaypointNode, v: MarineWaypointNode): boolean {
  const key = u.id < v.id ? `${u.id}:${v.id}` : `${v.id}:${u.id}`;
  const cached = VALIDATED_WP_EDGE_CACHE.get(key);
  if (cached !== undefined) return cached;
  const clear = !doesSegmentCrossLand(u.lat, u.lng, v.lat, v.lng);
  VALIDATED_WP_EDGE_CACHE.set(key, clear);
  return clear;
}

/**
 * 해상 변침점(Waypoint Graph) 기반 Hard-Block True End-to-End A* 최단 해상 항로 탐색
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
    if (doesSegmentCrossLand(startLat, startLng, node.lat, node.lng)) {
      continue;
    }
    const initialG = calculateHaversineKm(startLat, startLng, node.lat, node.lng);
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

    if (
      validEnds.has(currentId) &&
      !doesSegmentCrossLand(currentNode.lat, currentNode.lng, endLat, endLng)
    ) {
      const exitDistKm = calculateHaversineKm(currentNode.lat, currentNode.lng, endLat, endLng);
      const totalGoalCost = currentG + exitDistKm;
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
      if (!isWaypointEdgeClear(currentNode, neighbor)) {
        continue;
      }
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
 * 선분 [A -> B]가 해안선과 교차하지 않을 뿐 아니라 좌·우현 양측으로 최소 안전 수로 여유폭(clearanceDeg, 기본 약 95m)을 확보하는지 판정
 */
function hasSafeChannelClearance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  clearanceDeg = 0.00085,
): boolean {
  if (doesSegmentCrossLand(lat1, lng1, lat2, lng2)) return false;
  const cosLat = Math.cos(((lat1 + lat2) * 0.5 * Math.PI) / 180);
  const dx = (lng2 - lng1) * cosLat;
  const dy = lat2 - lat1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return true;
  const nLat = (dx / len) * clearanceDeg;
  const nLng = ((-dy / len) * clearanceDeg) / cosLat;

  // 시작·끝점 자체가 연안 접안점(해안 95m 이내)일 수 있으므로 선분의 내부 15% ~ 85% 구간에 대해 좌·우현 여유폭 검증
  const sLat = lat1 + (lat2 - lat1) * 0.15;
  const sLng = lng1 + (lng2 - lng1) * 0.15;
  const eLat = lat1 + (lat2 - lat1) * 0.85;
  const eLng = lng1 + (lng2 - lng1) * 0.85;

  if (doesSegmentCrossLand(sLat + nLat, sLng + nLng, eLat + nLat, eLng + nLng)) return false;
  if (doesSegmentCrossLand(sLat - nLat, sLng - nLng, eLat - nLat, eLng - nLng)) return false;
  return true;
}

/**
 * [Any-Angle Theta* String-Pulling & 양단 오버슈트 프루닝]
 * - 378개 실측 OSM 해안선 폴리곤으로부터 최소 약 95m 좌·우현 수로 안전 여유폭을 확보하는 범위 내에서만,
 *   불필요한 역방향 오버슈트와 미세 우회 지그재그 정점(WP-AUTO-*)을 직선 가시선(Line-of-Sight)으로 당겨 최적화합니다.
 */
function pruneTerminalOvershoot(
  fromSeaLat: number,
  fromSeaLng: number,
  toSeaLat: number,
  toSeaLng: number,
  wpPath: MarineWaypointNode[],
): MarineWaypointNode[] {
  if (wpPath.length === 0) return [];

  // Theta* Any-Angle Line-of-Sight String-Pulling over [fromSea, ...wpPath, toSea]
  interface AnchorPoint {
    lat: number;
    lng: number;
    wp?: MarineWaypointNode;
  }
  const chain: AnchorPoint[] = [
    { lat: fromSeaLat, lng: fromSeaLng },
    ...wpPath.map((wp) => ({ lat: wp.lat, lng: wp.lng, wp })),
    { lat: toSeaLat, lng: toSeaLng },
  ];

  // Calculate cumulative distances along the raw chain
  const cumDist = new Float64Array(chain.length);
  for (let i = 1; i < chain.length; i++) {
    cumDist[i] =
      cumDist[i - 1] +
      calculateHaversineKm(chain[i - 1].lat, chain[i - 1].lng, chain[i].lat, chain[i].lng);
  }

  const keptWaypoints: MarineWaypointNode[] = [];
  let currIdx = 0;

  while (currIdx < chain.length - 1) {
    let bestNextIdx = currIdx + 1;
    const currPt = chain[currIdx];

    for (let probeIdx = chain.length - 1; probeIdx > currIdx + 1; probeIdx--) {
      // Do not collapse the entire route to 0 waypoints unless direct distance <= 1.1km
      if (currIdx === 0 && probeIdx === chain.length - 1) {
        const totalDirect = calculateHaversineKm(fromSeaLat, fromSeaLng, toSeaLat, toSeaLng);
        if (totalDirect > 1.1) continue;
      }

      const probePt = chain[probeIdx];
      const directKm = calculateHaversineKm(currPt.lat, currPt.lng, probePt.lat, probePt.lng);
      const chainKm = cumDist[probeIdx] - cumDist[currIdx];

      // Allow string-pulling when direct line across open water is unobstructed with >=95m lateral channel clearance
      if (
        directKm <= 14.0 &&
        directKm + 0.04 < chainKm &&
        hasSafeChannelClearance(currPt.lat, currPt.lng, probePt.lat, probePt.lng, 0.00085)
      ) {
        bestNextIdx = probeIdx;
        break;
      }
    }

    if (bestNextIdx < chain.length - 1 && chain[bestNextIdx].wp) {
      keptWaypoints.push(chain[bestNextIdx].wp!);
    }
    currIdx = bestNextIdx;
  }

  return keptWaypoints;
}

/**
 * 폴리라인 전체 누적 호장(Arc-Length)의 정확한 50% 진중점 좌표 산출
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
 * 구간 폴리라인을 따라 등간격 진행 방향 화살표(➤) 위치 및 회전 방위각 샘플링
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
    targetDistancesKm.push(totalKm * 0.28);
    if (totalKm >= 0.9) {
      targetDistancesKm.push(totalKm * 0.74);
    }
  } else {
    const desiredCount = Math.max(2, Math.min(8, Math.floor(totalKm / 1.35)));
    const stepKm = totalKm / (desiredCount + 1);
    for (let k = 1; k <= desiredCount; k++) {
      const dKm = stepKm * k;
      if (dKm < 0.22 || totalKm - dKm < 0.22) continue;
      if (Math.abs(dKm - halfKm) < 0.24) {
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
 * 가장 가까운 해상 변침점 ID 조회 (커스텀 해상 좌표용)
 */
function findNearestWaypointIds(
  lat: number,
  lng: number,
  waypoints: MarineWaypointNode[],
  count = 4,
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
 * 두 지점 간 2계층 하이브리드 해상 항로(Tier-1 Fairway A* + Tier-2 C-Space Visibility Graph Detour + Theta* String-Pulling) 계산
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
  // 출발/도착지가 만약 육지 폴리곤 내부라면 해수면으로 안전 투영
  const safeFrom = isPointInAnyLandBarrier(from.lat, from.lng)
    ? snapLandPointToNearestSea(from.lat, from.lng)
    : { lat: from.lat, lng: from.lng };
  const safeTo = isPointInAnyLandBarrier(to.lat, to.lng)
    ? snapLandPointToNearestSea(to.lat, to.lng)
    : { lat: to.lat, lng: to.lng };

  const directDistanceKm = calculateHaversineKm(safeFrom.lat, safeFrom.lng, safeTo.lat, safeTo.lng);
  const directPositions: [number, number][] = [
    [safeFrom.lat, safeFrom.lng],
    [safeTo.lat, safeTo.lng],
  ];

  if (
    waypoints.length === 0 ||
    (directDistanceKm < 0.35 &&
      !doesSegmentCrossLand(safeFrom.lat, safeFrom.lng, safeTo.lat, safeTo.lng))
  ) {
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

  const fromSeaLat = fromPort?.seaApproachLat ?? safeFrom.lat;
  const fromSeaLng = fromPort?.seaApproachLng ?? safeFrom.lng;
  const toSeaLat = toPort?.seaApproachLat ?? safeTo.lat;
  const toSeaLng = toPort?.seaApproachLng ?? safeTo.lng;

  const fromWpIds =
    fromPort?.connectedWaypointIds && fromPort.connectedWaypointIds.length > 0
      ? fromPort.connectedWaypointIds
      : resolveVisibleWaypointIds(
          fromSeaLat,
          fromSeaLng,
          findNearestWaypointIds(fromSeaLat, fromSeaLng, waypoints, 4),
          waypoints,
        );
  const toWpIds =
    toPort?.connectedWaypointIds && toPort.connectedWaypointIds.length > 0
      ? toPort.connectedWaypointIds
      : resolveVisibleWaypointIds(
          toSeaLat,
          toSeaLng,
          findNearestWaypointIds(toSeaLat, toSeaLng, waypoints, 4),
          waypoints,
        );

  const sharedWpIds = fromWpIds.filter((id) => toWpIds.includes(id));
  const sharesWaypoint = sharedWpIds.length > 0;

  const directSeaCrossesLand =
    doesSegmentCrossLand(fromSeaLat, fromSeaLng, toSeaLat, toSeaLng) ||
    doesSegmentCrossLand(safeFrom.lat, safeFrom.lng, fromSeaLat, fromSeaLng) ||
    doesSegmentCrossLand(toSeaLat, toSeaLng, safeTo.lat, safeTo.lng);

  if (!directSeaCrossesLand && sharesWaypoint && directDistanceKm <= 1.1) {
    const pts: [number, number][] = [[safeFrom.lat, safeFrom.lng]];
    if (fromPort?.seaApproachLat && fromPort?.seaApproachLng) {
      pts.push([fromPort.seaApproachLat, fromPort.seaApproachLng]);
    }
    if (toPort?.seaApproachLat && toPort?.seaApproachLng) {
      pts.push([toPort.seaApproachLat, toPort.seaApproachLng]);
    }
    pts.push([safeTo.lat, safeTo.lng]);

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

  let rawWpPath = findShortestWaypointPath(
    fromWpIds,
    toWpIds,
    fromSeaLat,
    fromSeaLng,
    toSeaLat,
    toSeaLng,
    waypointMap,
  );

  if (rawWpPath.length === 0) {
    const wideFromWpIds = resolveVisibleWaypointIds(
      fromSeaLat,
      fromSeaLng,
      fromWpIds,
      waypoints,
      35.0,
      16,
    );
    const wideToWpIds = resolveVisibleWaypointIds(
      toSeaLat,
      toSeaLng,
      toWpIds,
      waypoints,
      35.0,
      16,
    );
    rawWpPath = findShortestWaypointPath(
      wideFromWpIds,
      wideToWpIds,
      fromSeaLat,
      fromSeaLng,
      toSeaLat,
      toSeaLng,
      waypointMap,
    );
  }

  // Tier-1 경로를 찾지 못한 경우(예: 좁은 만 내부 임의 클릭): Tier-2 국지 C-Space 가시성 그래프 탐색기 직접 호출
  if (rawWpPath.length === 0) {
    const localDetour = solveCoastalVisibilityDetour(
      fromSeaLat,
      fromSeaLng,
      toSeaLat,
      toSeaLng,
      0.06,
      110,
    );
    const fallbackCoords: [number, number][] = [[safeFrom.lat, safeFrom.lng]];
    if (localDetour && localDetour.length >= 2) {
      for (const pt of localDetour) {
        fallbackCoords.push(pt);
      }
    } else {
      fallbackCoords.push([fromSeaLat, fromSeaLng], [toSeaLat, toSeaLng]);
    }
    fallbackCoords.push([safeTo.lat, safeTo.lng]);

    let fallbackKm = 0;
    for (let i = 0; i < fallbackCoords.length - 1; i++) {
      fallbackKm += calculateHaversineKm(
        fallbackCoords[i][0],
        fallbackCoords[i][1],
        fallbackCoords[i + 1][0],
        fallbackCoords[i + 1][1],
      );
    }
    const mid = getPolylineArcMidpoint(fallbackCoords);
    return {
      distanceKm: Math.max(fallbackKm, directDistanceKm),
      directDistanceKm,
      detourFactor: directDistanceKm > 0 ? Math.max(1.0, fallbackKm / directDistanceKm) : 1.0,
      pathPositions: fallbackCoords,
      waypointNames: ['해안 가시성 우회 수로'],
      activeWaypoints: [],
      directionArrows: samplePolylineDirectionArrows(fallbackCoords, legIndex),
      midLat: mid.midLat,
      midLng: mid.midLng,
    };
  }

  // Theta* Line-of-Sight String-Pulling 수행
  const wpPath = pruneTerminalOvershoot(fromSeaLat, fromSeaLng, toSeaLat, toSeaLng, rawWpPath);

  const rawCoords: [number, number][] = [[safeFrom.lat, safeFrom.lng]];
  if (fromPort?.seaApproachLat && fromPort?.seaApproachLng) {
    rawCoords.push([fromPort.seaApproachLat, fromPort.seaApproachLng]);
  }
  for (const node of wpPath) {
    rawCoords.push([node.lat, node.lng]);
  }
  if (toPort?.seaApproachLat && toPort?.seaApproachLng) {
    rawCoords.push([toPort.seaApproachLat, toPort.seaApproachLng]);
  }
  rawCoords.push([safeTo.lat, safeTo.lng]);

  // 최종 안전망(Tier-2 Guard): 만약 양단 진입/이탈 선분 중 해안선과 교차하는 구간이 있으면 C-Space 가시성 우회선으로 자동 보정
  const coords: [number, number][] = [rawCoords[0]];
  for (let i = 0; i < rawCoords.length - 1; i++) {
    const [aLat, aLng] = rawCoords[i];
    const [bLat, bLng] = rawCoords[i + 1];
    if (doesSegmentCrossLand(aLat, aLng, bLat, bLng)) {
      const subDetour = solveCoastalVisibilityDetour(aLat, aLng, bLat, bLng, 0.035, 95);
      if (subDetour && subDetour.length > 2) {
        for (let k = 1; k < subDetour.length - 1; k++) {
          coords.push(subDetour[k]);
        }
      }
    }
    coords.push([bLat, bLng]);
  }

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
  // 지도상 주요 변침점 배지는 가독성을 위해 주항로 변침점(WP-AUTO-*가 아닌 주요 수로 또는 최대 6개 핵심 변침점) 위주로 표시
  const majorWpPath = wpPath.filter((w) => !w.id.startsWith('WP-AUTO-'));
  const displayWps = majorWpPath.length > 0 ? majorWpPath : wpPath.slice(0, 4);
  const activeWaypoints: RouteWaypointGuidePoint[] = displayWps.map((w) => ({
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
    waypointNames: displayWps.length > 0 ? displayWps.map((w) => w.name) : ['해안 우회 수로'],
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

    // [GAP-09 안전 가드] 만일 우회 탐색 실패로 폴리라인에 육지 교차 선분이 남아 있으면 절대 'safe'로 반환하지 않고 즉시 'danger' 경고 표시
    for (let pIdx = 0; pIdx < seg.pathPositions.length - 1; pIdx++) {
      const [pA0, pA1] = seg.pathPositions[pIdx];
      const [pB0, pB1] = seg.pathPositions[pIdx + 1];
      if (doesSegmentCrossLand(pA0, pA1, pB0, pB1)) {
        safetyLevel = 'danger';
        safetyNote = '해안선 우회 경로 탐색 제한 구간 — 현장 수로 확인 필수';
        break;
      }
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
