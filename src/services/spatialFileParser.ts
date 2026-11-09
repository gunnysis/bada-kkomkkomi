import proj4 from 'proj4';
import { unzipSync, zipSync } from 'fflate';
import type { SpatialGeometryType } from '../types/config';
import type {
  MultiFormatParseResult,
  ParsedLayerCandidate,
  SpatialFeature,
  SpatialFeatureCollection,
  SpatialGeometry,
  SupportedCrsCode,
  SupportedTextEncoding,
} from '../types/spatialLayer';

/**
 * 국립공원공단 및 대한민국 공공측량 표준 좌표계(CRS) 정의 등록
 */
export const KOREAN_CRS_DEFINITIONS: Record<
  Exclude<SupportedCrsCode, 'AUTO'>,
  { label: string; proj4Def: string }
> = {
  'EPSG:4326': {
    label: 'EPSG:4326 (WGS 84 위경도 · 표준 GPS)',
    proj4Def: '+proj=longlat +datum=WGS84 +no_defs',
  },
  'EPSG:5179': {
    label: 'EPSG:5179 (Korea 2000 / 통합좌표계 UTM-K · 국립공원/국가공간정보 표준)',
    proj4Def:
      '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  },
  'EPSG:5186': {
    label: 'EPSG:5186 (Korea 2000 / 중부원점 2010 · 수치지도 표준)',
    proj4Def:
      '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  },
  'EPSG:5187': {
    label: 'EPSG:5187 (Korea 2000 / 동부원점 2010 · 경상/동해 권역)',
    proj4Def:
      '+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  },
  'EPSG:5185': {
    label: 'EPSG:5185 (Korea 2000 / 서부원점 2010 · 서해 권역)',
    proj4Def:
      '+proj=tmerc +lat_0=38 +lon_0=125 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  },
  'EPSG:5181': {
    label: 'EPSG:5181 (Korea 2000 / 구 중부원점 Y=500,000)',
    proj4Def:
      '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  },
  'EPSG:5174': {
    label: 'EPSG:5174 (Korean 1985 / 보정 베셀 중부원점 · 구 지적도)',
    proj4Def:
      '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs',
  },
  'EPSG:3857': {
    label: 'EPSG:3857 (Web Mercator · 웹 배경지도 투영)',
    proj4Def:
      '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
  },
};

// proj4 전역 레지스트리에 한국 표준 EPSG 등록
for (const [code, meta] of Object.entries(KOREAN_CRS_DEFINITIONS)) {
  proj4.defs(code, meta.proj4Def);
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeProperties(raw: any, fallbackIndex: number): Record<string, any> {
  const clean: Record<string, any> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (DANGEROUS_KEYS.has(k)) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
        clean[k] = v;
      } else if (v !== undefined) {
        try {
          clean[k] = JSON.stringify(v);
        } catch {
          clean[k] = String(v);
        }
      }
    }
  }
  if (clean.id === undefined || clean.id === null || String(clean.id).trim() === '') {
    clean.id = `FEAT-${String(fallbackIndex + 1).padStart(3, '0')}`;
  } else {
    clean.id = String(clean.id);
  }
  if (clean.name === undefined || clean.name === null || String(clean.name).trim() === '') {
    const candidateName =
      clean.NAME ??
      clean.Name ??
      clean.명칭 ??
      clean.이름 ??
      clean.공원명 ??
      clean.구역명 ??
      clean.보호구역명 ??
      clean.KOR_NM ??
      clean.EMD_KOR_NM ??
      clean.SIG_KOR_NM ??
      clean.label ??
      clean.title;
    if (candidateName) {
      clean.name = String(candidateName);
    }
  }
  return clean;
}

/**
 * 바이트 배열에서 UTF-8 vs EUC-KR(CP949) 인코딩 자동 판별 및 디코딩
 */
export function decodeBytesWithEncoding(
  bytes: Uint8Array,
  preferred: SupportedTextEncoding = 'AUTO',
): { text: string; detectedEncoding: 'UTF-8' | 'EUC-KR' } {
  if (preferred === 'UTF-8') {
    return {
      text: new TextDecoder('utf-8').decode(bytes),
      detectedEncoding: 'UTF-8',
    };
  }
  if (preferred === 'EUC-KR') {
    return {
      text: new TextDecoder('euc-kr').decode(bytes),
      detectedEncoding: 'EUC-KR',
    };
  }

  try {
    const strictUtf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!strictUtf8.includes('\uFFFD')) {
      return { text: strictUtf8, detectedEncoding: 'UTF-8' };
    }
  } catch {
    // UTF-8 디코딩 실패 시 즉시 EUC-KR(CP949)로 전환
  }

  try {
    const eucKr = new TextDecoder('euc-kr').decode(bytes);
    return { text: eucKr, detectedEncoding: 'EUC-KR' };
  } catch {
    return {
      text: new TextDecoder('utf-8').decode(bytes),
      detectedEncoding: 'UTF-8',
    };
  }
}

/**
 * WKT(.prj), SRS ID, 또는 GeoJSON crs 문자열에서 한국 표준 EPSG 코드 판별
 */
export function detectCrsFromMetadata(
  prjOrWkt?: string | null,
  srsId?: number | null,
): Exclude<SupportedCrsCode, 'AUTO'> | null {
  if (typeof srsId === 'number') {
    if (srsId === 4326 || srsId === 84 || srsId === 4737) return 'EPSG:4326';
    if (srsId === 5179) return 'EPSG:5179';
    if (srsId === 5186) return 'EPSG:5186';
    if (srsId === 5187) return 'EPSG:5187';
    if (srsId === 5185) return 'EPSG:5185';
    if (srsId === 5181) return 'EPSG:5181';
    if (srsId === 5174 || srsId === 2097) return 'EPSG:5174';
    if (srsId === 3857 || srsId === 900913) return 'EPSG:3857';
  }

  if (!prjOrWkt) return null;
  const upper = prjOrWkt.toUpperCase();

  if (upper.includes('5179') || upper.includes('UNIFIED') || upper.includes('UTM-K') || upper.includes('UTMK')) {
    return 'EPSG:5179';
  }
  if (upper.includes('5186') || upper.includes('CENTRAL_BELT_2010') || upper.includes('CENTRAL BELT 2010')) {
    return 'EPSG:5186';
  }
  if (upper.includes('5187') || upper.includes('EAST_BELT_2010') || upper.includes('EAST BELT 2010')) {
    return 'EPSG:5187';
  }
  if (upper.includes('5185') || upper.includes('WEST_BELT_2010') || upper.includes('WEST BELT 2010')) {
    return 'EPSG:5185';
  }
  if (upper.includes('5181')) {
    return 'EPSG:5181';
  }
  if (upper.includes('5174') || upper.includes('BESSEL') || upper.includes('KOREAN_1985') || upper.includes('KOREAN 1985')) {
    return 'EPSG:5174';
  }
  if (upper.includes('3857') || upper.includes('900913') || upper.includes('WEB_MERCATOR') || upper.includes('PSEUDO-MERCATOR')) {
    return 'EPSG:3857';
  }
  if (upper.includes('4326') || upper.includes('CRS84') || upper.includes('WGS_1984') || upper.includes('WGS 84')) {
    return 'EPSG:4326';
  }

  // WKT 파라미터 기반 휴리스틱 판별
  if (upper.includes('CENTRAL_MERIDIAN",127.5') || upper.includes('1000000')) {
    return 'EPSG:5179';
  }
  if (upper.includes('CENTRAL_MERIDIAN",127') && upper.includes('600000')) {
    return 'EPSG:5186';
  }
  if (upper.includes('CENTRAL_MERIDIAN",129') && upper.includes('600000')) {
    return 'EPSG:5187';
  }
  if (upper.includes('CENTRAL_MERIDIAN",127') && upper.includes('500000')) {
    return 'EPSG:5181';
  }

  return null;
}

/**
 * 첫 유효 좌표 샘플 추출
 */
function findSampleCoordinate(features: SpatialFeature[]): [number, number] | null {
  const visit = (coords: any): [number, number] | null => {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      if (Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
        return [coords[0], coords[1]];
      }
      return null;
    }
    for (const item of coords) {
      const found = visit(item);
      if (found) return found;
    }
    return null;
  };

  for (const f of features) {
    if (f?.geometry?.coordinates) {
      const found = visit(f.geometry.coordinates);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 좌표 수치 범위를 기반으로 좌표계(CRS) 및 위경도 반전 여부 자동 감지
 */
export function inferCrsFromCoordinates(features: SpatialFeature[]): {
  crs: Exclude<SupportedCrsCode, 'AUTO'>;
  axisSwapped: boolean;
} {
  const sample = findSampleCoordinate(features);
  if (!sample) {
    return { crs: 'EPSG:4326', axisSwapped: false };
  }
  const [x, y] = sample;

  // 1. 정상 WGS84 경도/위도 (대한민국 및 인근 해역: 경도 120~136, 위도 30~43)
  if (x >= 120 && x <= 136 && y >= 30 && y <= 43) {
    return { crs: 'EPSG:4326', axisSwapped: false };
  }
  // 2. 위도/경도 축이 반전된 WGS84 ([lat, lng] 순서로 잘못 저장된 파일)
  if (x >= 30 && x <= 43 && y >= 120 && y <= 136) {
    return { crs: 'EPSG:4326', axisSwapped: true };
  }
  // 3. 전 세계 일반 경위도 범위
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return { crs: 'EPSG:4326', axisSwapped: false };
  }
  // 4. EPSG:5179 (UTM-K: X 700,000 ~ 1,400,000 / Y 1,300,000 ~ 2,300,000)
  if (x >= 700000 && x <= 1400000 && y >= 1300000 && y <= 2300000) {
    return { crs: 'EPSG:5179', axisSwapped: false };
  }
  // 5. EPSG:5186 (중부원점 2010: X 50,000 ~ 450,000 / Y 100,000 ~ 700,000)
  if (x >= 50000 && x <= 450000 && y >= 100000 && y <= 700000) {
    return { crs: 'EPSG:5186', axisSwapped: false };
  }
  // 6. EPSG:3857 (Web Mercator: X 13,000,000 ~ 15,500,000 / Y 3,500,000 ~ 5,200,000)
  if (x >= 13000000 && x <= 15500000 && y >= 3500000 && y <= 5200000) {
    return { crs: 'EPSG:3857', axisSwapped: false };
  }

  return { crs: 'EPSG:5179', axisSwapped: false };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * 좌표 배열 재귀 변환 및 정규화 (투영 변환 + 소수점 6자리 반올림 + Polygon 링 닫기)
 */
function transformPosition(
  pos: number[],
  sourceCrs: Exclude<SupportedCrsCode, 'AUTO'>,
  axisSwapped: boolean,
): [number, number] {
  let x = Number(pos[0]);
  let y = Number(pos[1]);
  if (axisSwapped) {
    const tmp = x;
    x = y;
    y = tmp;
  }
  if (sourceCrs !== 'EPSG:4326') {
    const [lng, lat] = proj4(sourceCrs, 'EPSG:4326', [x, y]);
    return [round6(lng), round6(lat)];
  }
  return [round6(x), round6(y)];
}

function ensureClosedLinearRing(ring: [number, number][]): {
  ring: [number, number][];
  closedFixed: boolean;
} {
  if (ring.length < 3) return { ring, closedFixed: false };
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return {
      ring: [...ring, [first[0], first[1]]],
      closedFixed: true,
    };
  }
  return { ring, closedFixed: false };
}

/**
 * 원본 피처 컬렉션을 지정된 CRS로 재투영하고 RFC 7946 규격으로 정규화
 */
export function reprojectAndNormalizeFeatureCollection(
  rawFc: SpatialFeatureCollection,
  sourceCrs: Exclude<SupportedCrsCode, 'AUTO'>,
  axisSwapped = false,
): {
  featureCollection: SpatialFeatureCollection;
  geometryTypes: SpatialGeometryType[];
  vertexCount: number;
  bbox: [number, number, number, number];
  autoHealedNotes: string[];
} {
  const geomTypeSet = new Set<SpatialGeometryType>();
  let vertexCount = 0;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let closedRingsCount = 0;
  const autoHealedNotes: string[] = [];

  if (sourceCrs !== 'EPSG:4326') {
    autoHealedNotes.push(`${sourceCrs} 좌표를 표준 WGS 84 (EPSG:4326) 경위도로 자동 재투영했습니다.`);
  }
  if (axisSwapped) {
    autoHealedNotes.push('위도/경도 축 순서 반전([lat, lng])을 감지하여 [lng, lat]으로 자동 교정했습니다.');
  }

  const recordPoint = (pt: [number, number]) => {
    vertexCount += 1;
    const [lng, lat] = pt;
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  };

  const normalizedFeatures: SpatialFeature[] = [];

  rawFc.features.forEach((feat, idx) => {
    const geom = feat?.geometry;
    if (!geom || !geom.type || !geom.coordinates) return;

    const props = sanitizeProperties(feat.properties, idx);
    const gType = geom.type as SpatialGeometryType;

    if (gType === 'Point') {
      const pt = transformPosition(geom.coordinates, sourceCrs, axisSwapped);
      recordPoint(pt);
      geomTypeSet.add('Point');
      normalizedFeatures.push({
        type: 'Feature',
        id: props.id,
        properties: props,
        geometry: { type: 'Point', coordinates: pt },
      });
    } else if (gType === 'MultiPoint') {
      const pts = (geom.coordinates as number[][])
        .filter((p) => Array.isArray(p) && p.length >= 2)
        .map((p) => {
          const t = transformPosition(p, sourceCrs, axisSwapped);
          recordPoint(t);
          return t;
        });
      if (pts.length > 0) {
        geomTypeSet.add('MultiPoint');
        normalizedFeatures.push({
          type: 'Feature',
          id: props.id,
          properties: props,
          geometry: { type: 'MultiPoint', coordinates: pts },
        });
      }
    } else if (gType === 'LineString') {
      const pts = (geom.coordinates as number[][])
        .filter((p) => Array.isArray(p) && p.length >= 2)
        .map((p) => {
          const t = transformPosition(p, sourceCrs, axisSwapped);
          recordPoint(t);
          return t;
        });
      if (pts.length >= 2) {
        geomTypeSet.add('LineString');
        normalizedFeatures.push({
          type: 'Feature',
          id: props.id,
          properties: props,
          geometry: { type: 'LineString', coordinates: pts },
        });
      }
    } else if (gType === 'MultiLineString') {
      const lines = (geom.coordinates as number[][][])
        .map((line) =>
          (line ?? [])
            .filter((p) => Array.isArray(p) && p.length >= 2)
            .map((p) => {
              const t = transformPosition(p, sourceCrs, axisSwapped);
              recordPoint(t);
              return t;
            }),
        )
        .filter((l) => l.length >= 2);
      if (lines.length > 0) {
        geomTypeSet.add('MultiLineString');
        normalizedFeatures.push({
          type: 'Feature',
          id: props.id,
          properties: props,
          geometry: { type: 'MultiLineString', coordinates: lines },
        });
      }
    } else if (gType === 'Polygon') {
      const rings = (geom.coordinates as number[][][])
        .map((ring) => {
          const pts = (ring ?? [])
            .filter((p) => Array.isArray(p) && p.length >= 2)
            .map((p) => {
              const t = transformPosition(p, sourceCrs, axisSwapped);
              recordPoint(t);
              return t;
            });
          const closed = ensureClosedLinearRing(pts);
          if (closed.closedFixed) closedRingsCount += 1;
          return closed.ring;
        })
        .filter((r) => r.length >= 4);
      if (rings.length > 0) {
        geomTypeSet.add('Polygon');
        normalizedFeatures.push({
          type: 'Feature',
          id: props.id,
          properties: props,
          geometry: { type: 'Polygon', coordinates: rings },
        });
      }
    } else if (gType === 'MultiPolygon') {
      const polys = (geom.coordinates as number[][][][])
        .map((poly) =>
          (poly ?? [])
            .map((ring) => {
              const pts = (ring ?? [])
                .filter((p) => Array.isArray(p) && p.length >= 2)
                .map((p) => {
                  const t = transformPosition(p, sourceCrs, axisSwapped);
                  recordPoint(t);
                  return t;
                });
              const closed = ensureClosedLinearRing(pts);
              if (closed.closedFixed) closedRingsCount += 1;
              return closed.ring;
            })
            .filter((r) => r.length >= 4),
        )
        .filter((p) => p.length > 0);
      if (polys.length > 0) {
        geomTypeSet.add('MultiPolygon');
        normalizedFeatures.push({
          type: 'Feature',
          id: props.id,
          properties: props,
          geometry: { type: 'MultiPolygon', coordinates: polys },
        });
      }
    }
  });

  if (closedRingsCount > 0) {
    autoHealedNotes.push(`열려 있던 폴리곤 외곽/내부 링 ${closedRingsCount}건을 자동으로 폐합(Close)했습니다.`);
  }

  const bbox: [number, number, number, number] =
    minLng !== Infinity
      ? [round6(minLng), round6(minLat), round6(maxLng), round6(maxLat)]
      : [128.35, 34.68, 128.75, 34.92];

  return {
    featureCollection: {
      type: 'FeatureCollection',
      name: rawFc.name,
      features: normalizedFeatures,
    },
    geometryTypes: Array.from(geomTypeSet),
    vertexCount,
    bbox,
    autoHealedNotes,
  };
}

/**
 * Douglas-Peucker 도형 단순화 (초고밀도 해안선/경계선 경량화 옵션)
 */
function simplifyPointsDP(pts: [number, number][], toleranceDeg: number): [number, number][] {
  if (pts.length <= 3 || toleranceDeg <= 0) return pts;

  const sqTol = toleranceDeg * toleranceDeg;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;

  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxSqDist = 0;
    let index = 0;

    const x1 = pts[first][0];
    const y1 = pts[first][1];
    const x2 = pts[last][0];
    const y2 = pts[last][1];
    const dx = x2 - x1;
    const dy = y2 - y1;

    for (let i = first + 1; i < last; i++) {
      let px = x1;
      let py = y1;
      if (dx !== 0 || dy !== 0) {
        const t = ((pts[i][0] - x1) * dx + (pts[i][1] - y1) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
          px = x2;
          py = y2;
        } else if (t > 0) {
          px += dx * t;
          py += dy * t;
        }
      }
      const ddx = pts[i][0] - px;
      const ddy = pts[i][1] - py;
      const sqDist = ddx * ddx + ddy * ddy;
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }

    if (maxSqDist > sqTol) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return pts.filter((_, i) => keep[i] === 1);
}

export function simplifyFeatureCollection(
  fc: SpatialFeatureCollection,
  toleranceMeters: number,
): SpatialFeatureCollection {
  if (toleranceMeters <= 0) return fc;
  // 위도 35도 부근 1m ≈ 0.0000095도
  const tolDeg = toleranceMeters * 0.0000095;

  const simplifyRing = (ring: [number, number][]): [number, number][] => {
    const simplified = simplifyPointsDP(ring, tolDeg);
    if (simplified.length < 4) return ring;
    return ensureClosedLinearRing(simplified).ring;
  };

  return {
    ...fc,
    features: fc.features.map((f) => {
      const g = f.geometry;
      if (g.type === 'LineString') {
        const next = simplifyPointsDP(g.coordinates, tolDeg);
        return {
          ...f,
          geometry: { ...g, coordinates: next.length >= 2 ? next : g.coordinates },
        };
      }
      if (g.type === 'MultiLineString') {
        return {
          ...f,
          geometry: {
            ...g,
            coordinates: g.coordinates.map((line: [number, number][]) => {
              const next = simplifyPointsDP(line, tolDeg);
              return next.length >= 2 ? next : line;
            }),
          },
        };
      }
      if (g.type === 'Polygon') {
        return {
          ...f,
          geometry: {
            ...g,
            coordinates: g.coordinates.map(simplifyRing),
          },
        };
      }
      if (g.type === 'MultiPolygon') {
        return {
          ...f,
          geometry: {
            ...g,
            coordinates: g.coordinates.map((poly: [number, number][][]) =>
              poly.map(simplifyRing),
            ),
          },
        };
      }
      return f;
    }),
  };
}

/**
 * SHA-256 해시 계산 (Web Crypto API + 동기/폴백 지원)
 */
export async function computeSha256Hex(text: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = new TextEncoder().encode(text);
      const hashBuf = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // fallback below
  }
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

// ============================================================================
// 1. ESRI Shapefile (.shp + .dbf + .prj + .cpg) 바이너리 파서
// ============================================================================

interface DbfFieldDesc {
  name: string;
  type: string;
  length: number;
}

function parseDbfBuffer(
  dbfBytes: Uint8Array,
  cpgText?: string,
  preferredEncoding: SupportedTextEncoding = 'AUTO',
): { records: Record<string, any>[]; detectedEncoding: 'UTF-8' | 'EUC-KR' } {
  const view = new DataView(dbfBytes.buffer, dbfBytes.byteOffset, dbfBytes.byteLength);
  const numRecords = view.getUint32(4, true);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);
  const ldid = dbfBytes[29];

  let encodingHint: SupportedTextEncoding = preferredEncoding;
  if (encodingHint === 'AUTO' && cpgText) {
    const upper = cpgText.trim().toUpperCase();
    if (upper.includes('949') || upper.includes('EUC') || upper.includes('5601') || upper.includes('ANSI')) {
      encodingHint = 'EUC-KR';
    } else if (upper.includes('UTF')) {
      encodingHint = 'UTF-8';
    }
  }
  if (encodingHint === 'AUTO') {
    if (ldid === 0x4d || ldid === 0x13) {
      encodingHint = 'EUC-KR';
    }
  }

  let detectedEncoding: 'UTF-8' | 'EUC-KR' = encodingHint === 'EUC-KR' ? 'EUC-KR' : 'UTF-8';
  const fields: DbfFieldDesc[] = [];
  let offset = 32;
  while (offset + 32 <= headerLength && dbfBytes[offset] !== 0x0d) {
    const nameBytes = dbfBytes.subarray(offset, offset + 11);
    const zeroIdx = nameBytes.indexOf(0);
    const cleanNameBytes = zeroIdx >= 0 ? nameBytes.subarray(0, zeroIdx) : nameBytes;
    const decodedName = decodeBytesWithEncoding(cleanNameBytes, encodingHint);
    if (decodedName.detectedEncoding === 'EUC-KR') detectedEncoding = 'EUC-KR';

    const fieldType = String.fromCharCode(dbfBytes[offset + 11]);
    const fieldLen = dbfBytes[offset + 16];
    fields.push({
      name: decodedName.text.trim() || `COL_${fields.length + 1}`,
      type: fieldType,
      length: fieldLen,
    });
    offset += 32;
  }

  const records: Record<string, any>[] = [];
  let recOffset = headerLength;
  for (let r = 0; r < numRecords; r++) {
    if (recOffset + recordLength > dbfBytes.byteLength) break;
    const delFlag = dbfBytes[recOffset];
    if (delFlag === 0x2a) {
      recOffset += recordLength;
      continue;
    }

    let fldPos = recOffset + 1;
    const row: Record<string, any> = {};
    for (const fld of fields) {
      const slice = dbfBytes.subarray(fldPos, fldPos + fld.length);
      fldPos += fld.length;
      const decoded = decodeBytesWithEncoding(slice, encodingHint);
      if (decoded.detectedEncoding === 'EUC-KR') detectedEncoding = 'EUC-KR';
      const valStr = decoded.text.trim();

      if (fld.type === 'N' || fld.type === 'F') {
        const num = Number(valStr);
        row[fld.name] = valStr === '' || Number.isNaN(num) ? valStr : num;
      } else if (fld.type === 'L') {
        row[fld.name] = /^[YyTt1]$/.test(valStr);
      } else {
        row[fld.name] = valStr;
      }
    }
    records.push(row);
    recOffset += recordLength;
  }

  return { records, detectedEncoding };
}

function signedRingArea(ring: [number, number][]): number {
  let area = 0;
  for (let i = 0, len = ring.length; i < len - 1; i++) {
    area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  }
  return area / 2;
}

function parseShpBuffer(shpBytes: Uint8Array): SpatialGeometry[] {
  const view = new DataView(shpBytes.buffer, shpBytes.byteOffset, shpBytes.byteLength);
  if (shpBytes.byteLength < 100 || view.getInt32(0, false) !== 9994) {
    throw new Error('유효한 ESRI Shapefile (.shp) 헤더가 아닙니다.');
  }

  const geometries: SpatialGeometry[] = [];
  let offset = 100;

  while (offset + 8 <= shpBytes.byteLength) {
    const contentLenWords = view.getInt32(offset + 4, false);
    const contentByteLen = contentLenWords * 2;
    offset += 8;
    if (contentByteLen <= 0 || offset + contentByteLen > shpBytes.byteLength) break;

    const shapeType = view.getInt32(offset, true);
    const recEnd = offset + contentByteLen;

    if (shapeType === 0) {
      // Null shape
    } else if (shapeType === 1 || shapeType === 11 || shapeType === 21) {
      // Point / PointZ / PointM
      const x = view.getFloat64(offset + 4, true);
      const y = view.getFloat64(offset + 12, true);
      geometries.push({ type: 'Point', coordinates: [x, y] });
    } else if (shapeType === 8 || shapeType === 18 || shapeType === 28) {
      // MultiPoint
      const numPoints = view.getInt32(offset + 36, true);
      const pts: [number, number][] = [];
      let pOff = offset + 40;
      for (let i = 0; i < numPoints && pOff + 16 <= recEnd; i++) {
        pts.push([view.getFloat64(pOff, true), view.getFloat64(pOff + 8, true)]);
        pOff += 16;
      }
      geometries.push({ type: 'MultiPoint', coordinates: pts });
    } else if (
      shapeType === 3 ||
      shapeType === 13 ||
      shapeType === 23 ||
      shapeType === 5 ||
      shapeType === 15 ||
      shapeType === 25
    ) {
      // PolyLine (3, 13, 23) or Polygon (5, 15, 25)
      const isPolygon = shapeType === 5 || shapeType === 15 || shapeType === 25;
      const numParts = view.getInt32(offset + 36, true);
      const numPoints = view.getInt32(offset + 40, true);
      const parts: number[] = [];
      let partOff = offset + 44;
      for (let i = 0; i < numParts; i++) {
        parts.push(view.getInt32(partOff, true));
        partOff += 4;
      }
      let ptOff = partOff;
      const rings: [number, number][][] = [];
      for (let p = 0; p < numParts; p++) {
        const startIdx = parts[p];
        const endIdx = p + 1 < numParts ? parts[p + 1] : numPoints;
        const ring: [number, number][] = [];
        for (let idx = startIdx; idx < endIdx && ptOff + 16 <= recEnd; idx++) {
          ring.push([view.getFloat64(ptOff, true), view.getFloat64(ptOff + 8, true)]);
          ptOff += 16;
        }
        if (ring.length > 0) rings.push(ring);
      }

      if (!isPolygon) {
        if (rings.length === 1) {
          geometries.push({ type: 'LineString', coordinates: rings[0] });
        } else if (rings.length > 1) {
          geometries.push({ type: 'MultiLineString', coordinates: rings });
        }
      } else {
        if (rings.length === 1) {
          geometries.push({ type: 'Polygon', coordinates: rings });
        } else if (rings.length > 1) {
          // Shapefile 외곽 링은 시계방향(signedRingArea > 0), 내부 홀은 반시계방향
          const polygons: [number, number][][][] = [];
          for (const r of rings) {
            if (signedRingArea(r) >= 0 || polygons.length === 0) {
              polygons.push([r]);
            } else {
              polygons[polygons.length - 1].push(r);
            }
          }
          if (polygons.length === 1) {
            geometries.push({ type: 'Polygon', coordinates: polygons[0] });
          } else {
            geometries.push({ type: 'MultiPolygon', coordinates: polygons });
          }
        }
      }
    }

    offset = recEnd;
  }

  return geometries;
}

// ============================================================================
// 2. OGC GeoPackage (.gpkg) SQLite3 B-Tree & GPB/WKB 네이티브 바이너리 파서
// ============================================================================

function readSqliteVarint(bytes: Uint8Array, offset: number): { value: number; byteLength: number } {
  let value = 0;
  for (let i = 0; i < 8; i++) {
    const b = bytes[offset + i];
    value = value * 128 + (b & 0x7f);
    if ((b & 0x80) === 0) {
      return { value, byteLength: i + 1 };
    }
  }
  const b8 = bytes[offset + 8];
  value = value * 256 + b8;
  return { value, byteLength: 9 };
}

function readSqliteSerialValue(
  bytes: Uint8Array,
  offset: number,
  serialType: number,
): { value: any; length: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (serialType === 0) return { value: null, length: 0 };
  if (serialType === 1) return { value: view.getInt8(offset), length: 1 };
  if (serialType === 2) return { value: view.getInt16(offset, false), length: 2 };
  if (serialType === 3) {
    const b0 = bytes[offset];
    const b1 = bytes[offset + 1];
    const b2 = bytes[offset + 2];
    const v = (b0 << 16) | (b1 << 8) | b2;
    return { value: v & 0x800000 ? v - 0x1000000 : v, length: 3 };
  }
  if (serialType === 4) return { value: view.getInt32(offset, false), length: 4 };
  if (serialType === 5) {
    const hi = view.getInt32(offset, false);
    const lo = view.getUint16(offset + 4, false);
    return { value: hi * 65536 + lo, length: 6 };
  }
  if (serialType === 6) {
    const hi = view.getInt32(offset, false);
    const lo = view.getUint32(offset + 4, false);
    return { value: hi * 4294967296 + lo, length: 8 };
  }
  if (serialType === 7) return { value: view.getFloat64(offset, false), length: 8 };
  if (serialType === 8) return { value: 0, length: 0 };
  if (serialType === 9) return { value: 1, length: 0 };
  if (serialType >= 12 && serialType % 2 === 0) {
    const len = (serialType - 12) / 2;
    return { value: bytes.slice(offset, offset + len), length: len };
  }
  if (serialType >= 13 && serialType % 2 === 1) {
    const len = (serialType - 13) / 2;
    const text = new TextDecoder('utf-8').decode(bytes.subarray(offset, offset + len));
    return { value: text, length: len };
  }
  return { value: null, length: 0 };
}

function readFullCellPayload(
  dbBytes: Uint8Array,
  pageSize: number,
  usableSize: number,
  localOffset: number,
  payloadSize: number,
): Uint8Array {
  const maxLocal = usableSize - 35;
  const minLocal = ((usableSize - 12) * 32) / 255 - 23;
  if (payloadSize <= maxLocal) {
    return dbBytes.subarray(localOffset, localOffset + payloadSize);
  }

  let localSize = minLocal + ((payloadSize - minLocal) % (usableSize - 4));
  if (localSize > maxLocal) localSize = minLocal;
  localSize = Math.floor(localSize);

  const out = new Uint8Array(payloadSize);
  out.set(dbBytes.subarray(localOffset, localOffset + localSize), 0);
  let written = localSize;

  const view = new DataView(dbBytes.buffer, dbBytes.byteOffset, dbBytes.byteLength);
  let nextOverflowPage = view.getUint32(localOffset + localSize, false);
  let guard = 0;

  while (nextOverflowPage > 0 && written < payloadSize && guard < 10000) {
    guard += 1;
    const pageStart = (nextOverflowPage - 1) * pageSize;
    if (pageStart + 4 > dbBytes.byteLength) break;
    nextOverflowPage = view.getUint32(pageStart, false);
    const chunkLen = Math.min(usableSize - 4, payloadSize - written);
    out.set(dbBytes.subarray(pageStart + 4, pageStart + 4 + chunkLen), written);
    written += chunkLen;
  }

  return out;
}

function readSqliteTableRows(
  dbBytes: Uint8Array,
  rootPage: number,
  pageSize: number,
  usableSize: number,
): { rowid: number; values: any[] }[] {
  const rows: { rowid: number; values: any[] }[] = [];
  const view = new DataView(dbBytes.buffer, dbBytes.byteOffset, dbBytes.byteLength);
  const visitedPages = new Set<number>();

  const traversePage = (pageNum: number) => {
    if (pageNum < 1 || visitedPages.has(pageNum)) return;
    visitedPages.add(pageNum);

    const pageStart = (pageNum - 1) * pageSize;
    if (pageStart >= dbBytes.byteLength) return;
    const hdrOff = pageNum === 1 ? 100 : pageStart;
    const pageType = dbBytes[hdrOff];
    const cellCount = view.getUint16(hdrOff + 3, false);

    if (pageType === 0x05) {
      // Interior table B-tree page
      const rightMostPage = view.getUint32(hdrOff + 8, false);
      const ptrStart = hdrOff + 12;
      for (let i = 0; i < cellCount; i++) {
        const cellOffset = pageStart + view.getUint16(ptrStart + i * 2, false);
        const leftChildPage = view.getUint32(cellOffset, false);
        traversePage(leftChildPage);
      }
      traversePage(rightMostPage);
    } else if (pageType === 0x0d) {
      // Leaf table B-tree page
      const ptrStart = hdrOff + 8;
      for (let i = 0; i < cellCount; i++) {
        const cellOffset = pageStart + view.getUint16(ptrStart + i * 2, false);
        const pVar = readSqliteVarint(dbBytes, cellOffset);
        const rVar = readSqliteVarint(dbBytes, cellOffset + pVar.byteLength);
        const payloadOffset = cellOffset + pVar.byteLength + rVar.byteLength;
        const payload = readFullCellPayload(
          dbBytes,
          pageSize,
          usableSize,
          payloadOffset,
          pVar.value,
        );

        const hVar = readSqliteVarint(payload, 0);
        const headerEnd = hVar.value;
        let hPos = hVar.byteLength;
        const serialTypes: number[] = [];
        while (hPos < headerEnd) {
          const st = readSqliteVarint(payload, hPos);
          serialTypes.push(st.value);
          hPos += st.byteLength;
        }

        let bodyPos = headerEnd;
        const values: any[] = [];
        for (const st of serialTypes) {
          const decoded = readSqliteSerialValue(payload, bodyPos, st);
          values.push(decoded.value);
          bodyPos += decoded.length;
        }
        rows.push({ rowid: rVar.value, values });
      }
    }
  };

  traversePage(rootPage);
  return rows;
}

function parseCreateTableColumns(sql: string): { name: string; isPrimaryKeyInt: boolean }[] {
  const openIdx = sql.indexOf('(');
  const closeIdx = sql.lastIndexOf(')');
  if (openIdx < 0 || closeIdx <= openIdx) return [];
  const body = sql.slice(openIdx + 1, closeIdx);

  // 괄호 깊이를 고려해 최상위 콤마 분리
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const cols: { name: string; isPrimaryKeyInt: boolean }[] = [];
  for (const part of parts) {
    const upper = part.toUpperCase();
    if (
      upper.startsWith('CONSTRAINT ') ||
      upper.startsWith('PRIMARY KEY') ||
      upper.startsWith('FOREIGN KEY') ||
      upper.startsWith('UNIQUE') ||
      upper.startsWith('CHECK')
    ) {
      continue;
    }
    const match = part.match(/^(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z0-9_가-힣]+))\s*(.*)$/s);
    if (!match) continue;
    const colName = match[1] ?? match[2] ?? match[3] ?? match[4];
    const restUpper = (match[5] ?? '').toUpperCase();
    const isPkInt = restUpper.includes('INTEGER') && restUpper.includes('PRIMARY KEY');
    cols.push({ name: colName, isPrimaryKeyInt: isPkInt });
  }
  return cols;
}

function parseWkbGeometry(
  bytes: Uint8Array,
  startOffset: number,
): { geometry: SpatialGeometry | null; nextOffset: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = startOffset;
  if (offset + 5 > bytes.byteLength) return { geometry: null, nextOffset: offset };

  const littleEndian = bytes[offset] === 1;
  offset += 1;
  const rawType = view.getUint32(offset, littleEndian);
  offset += 4;

  // EWKB SRID 플래그(0x20000000)가 있는 경우 4바이트 건너뜀
  const hasEwkbSrid = (rawType & 0x20000000) !== 0;
  if (hasEwkbSrid) offset += 4;

  const hasEwkbZ = (rawType & 0x80000000) !== 0;
  const hasEwkbM = (rawType & 0x40000000) !== 0;
  const isoType = rawType & 0x0fffffff;
  const baseType = isoType % 1000;
  const isoDim = Math.floor(isoType / 1000); // 0=2D, 1=Z, 2=M, 3=ZM
  const coordDim =
    2 + (isoDim === 1 || isoDim === 3 || hasEwkbZ ? 1 : 0) + (isoDim === 2 || isoDim === 3 || hasEwkbM ? 1 : 0);
  const pointStride = coordDim * 8;

  const readPoint = (): [number, number] => {
    const x = view.getFloat64(offset, littleEndian);
    const y = view.getFloat64(offset + 8, littleEndian);
    offset += pointStride;
    return [x, y];
  };

  const readLinearRing = (): [number, number][] => {
    const count = view.getUint32(offset, littleEndian);
    offset += 4;
    const pts: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      pts.push(readPoint());
    }
    return pts;
  };

  if (baseType === 1) {
    // Point
    const pt = readPoint();
    return { geometry: { type: 'Point', coordinates: pt }, nextOffset: offset };
  }
  if (baseType === 2) {
    // LineString
    const pts = readLinearRing();
    return { geometry: { type: 'LineString', coordinates: pts }, nextOffset: offset };
  }
  if (baseType === 3) {
    // Polygon
    const numRings = view.getUint32(offset, littleEndian);
    offset += 4;
    const rings: [number, number][][] = [];
    for (let r = 0; r < numRings; r++) {
      rings.push(readLinearRing());
    }
    return { geometry: { type: 'Polygon', coordinates: rings }, nextOffset: offset };
  }
  if (baseType === 4) {
    // MultiPoint
    const count = view.getUint32(offset, littleEndian);
    offset += 4;
    const pts: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      const sub = parseWkbGeometry(bytes, offset);
      offset = sub.nextOffset;
      if (sub.geometry?.type === 'Point') {
        pts.push(sub.geometry.coordinates);
      }
    }
    return { geometry: { type: 'MultiPoint', coordinates: pts }, nextOffset: offset };
  }
  if (baseType === 5) {
    // MultiLineString
    const count = view.getUint32(offset, littleEndian);
    offset += 4;
    const lines: [number, number][][] = [];
    for (let i = 0; i < count; i++) {
      const sub = parseWkbGeometry(bytes, offset);
      offset = sub.nextOffset;
      if (sub.geometry?.type === 'LineString') {
        lines.push(sub.geometry.coordinates);
      }
    }
    return { geometry: { type: 'MultiLineString', coordinates: lines }, nextOffset: offset };
  }
  if (baseType === 6) {
    // MultiPolygon
    const count = view.getUint32(offset, littleEndian);
    offset += 4;
    const polys: [number, number][][][] = [];
    for (let i = 0; i < count; i++) {
      const sub = parseWkbGeometry(bytes, offset);
      offset = sub.nextOffset;
      if (sub.geometry?.type === 'Polygon') {
        polys.push(sub.geometry.coordinates);
      }
    }
    return { geometry: { type: 'MultiPolygon', coordinates: polys }, nextOffset: offset };
  }

  return { geometry: null, nextOffset: offset };
}

function parseGpbOrWkbBlob(blob: Uint8Array): {
  geometry: SpatialGeometry | null;
  srsId?: number;
} {
  if (!(blob instanceof Uint8Array) || blob.byteLength < 5) {
    return { geometry: null };
  }
  // GeoPackage Binary Header ('GP' = 0x47, 0x50)
  if (blob[0] === 0x47 && blob[1] === 0x50) {
    const flags = blob[3];
    const littleEndian = (flags & 0x01) === 1;
    const envelopeType = (flags >> 1) & 0x07;
    const isEmpty = ((flags >> 4) & 0x01) === 1;
    if (isEmpty) return { geometry: null };

    const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
    const srsId = view.getInt32(4, littleEndian);
    const envelopeSizes = [0, 32, 48, 48, 64];
    const envBytes = envelopeSizes[envelopeType] ?? 0;
    const wkbStart = 8 + envBytes;
    const parsed = parseWkbGeometry(blob, wkbStart);
    return { geometry: parsed.geometry, srsId };
  }

  // 일반 WKB Blob
  const parsed = parseWkbGeometry(blob, 0);
  return { geometry: parsed.geometry };
}

async function parseGeoPackageBuffer(
  gpkgBytes: Uint8Array,
  sourceFileName: string,
  crsOverride: SupportedCrsCode,
): Promise<ParsedLayerCandidate[]> {
  const magic = new TextDecoder('ascii').decode(gpkgBytes.subarray(0, 15));
  if (magic !== 'SQLite format 3') {
    throw new Error('유효한 OGC GeoPackage (.gpkg / SQLite3) 파일이 아닙니다.');
  }

  const view = new DataView(gpkgBytes.buffer, gpkgBytes.byteOffset, gpkgBytes.byteLength);
  const rawPageSize = view.getUint16(16, false);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  const reservedSpace = gpkgBytes[20];
  const usableSize = pageSize - reservedSpace;

  // 1. sqlite_schema (Page 1) 스캔
  const schemaRows = readSqliteTableRows(gpkgBytes, 1, pageSize, usableSize);
  const tables = new Map<
    string,
    { name: string; rootPage: number; sql: string; columns: { name: string; isPrimaryKeyInt: boolean }[] }
  >();

  for (const r of schemaRows) {
    const [type, name, , rootpage, sql] = r.values;
    if (type === 'table' && typeof name === 'string' && typeof rootpage === 'number' && rootpage > 0) {
      tables.set(name, {
        name,
        rootPage: rootpage,
        sql: typeof sql === 'string' ? sql : '',
        columns: typeof sql === 'string' ? parseCreateTableColumns(sql) : [],
      });
    }
  }

  // 2. gpkg_spatial_ref_sys 메타데이터 로드
  const srsMap = new Map<number, string>();
  const srsTable = tables.get('gpkg_spatial_ref_sys');
  if (srsTable) {
    const rows = readSqliteTableRows(gpkgBytes, srsTable.rootPage, pageSize, usableSize);
    for (const r of rows) {
      // srs_name, srs_id, organization, organization_coordsys_id, definition
      const srsIdVal = typeof r.values[1] === 'number' ? r.values[1] : r.rowid;
      const orgIdVal = typeof r.values[3] === 'number' ? r.values[3] : srsIdVal;
      const defStr = typeof r.values[4] === 'string' ? r.values[4] : '';
      if (typeof srsIdVal === 'number') {
        srsMap.set(srsIdVal, `EPSG:${orgIdVal} ${defStr}`);
      }
    }
  }

  // 3. gpkg_contents & gpkg_geometry_columns 메타데이터 로드
  const contentMeta = new Map<
    string,
    { identifier?: string; description?: string; srsId?: number; geomCol?: string }
  >();
  const contentsTable = tables.get('gpkg_contents');
  if (contentsTable) {
    const rows = readSqliteTableRows(gpkgBytes, contentsTable.rootPage, pageSize, usableSize);
    for (const r of rows) {
      const [tableName, dataType, identifier, description, , , , , , srsId] = r.values;
      if (typeof tableName === 'string' && (!dataType || dataType === 'features')) {
        contentMeta.set(tableName, {
          identifier: typeof identifier === 'string' ? identifier : tableName,
          description: typeof description === 'string' ? description : '',
          srsId: typeof srsId === 'number' ? srsId : undefined,
        });
      }
    }
  }

  const geomColsTable = tables.get('gpkg_geometry_columns');
  if (geomColsTable) {
    const rows = readSqliteTableRows(gpkgBytes, geomColsTable.rootPage, pageSize, usableSize);
    for (const r of rows) {
      const [tableName, columnName, , srsId] = r.values;
      if (typeof tableName === 'string') {
        const prev = contentMeta.get(tableName) ?? {};
        contentMeta.set(tableName, {
          ...prev,
          geomCol: typeof columnName === 'string' ? columnName : prev.geomCol,
          srsId: typeof srsId === 'number' ? srsId : prev.srsId,
        });
      }
    }
  }

  // 4. 공간 피처 테이블 추출 (gpkg_contents 등록 테이블 또는 GPB 블롭 보유 테이블)
  const targetTableNames =
    contentMeta.size > 0
      ? Array.from(contentMeta.keys())
      : Array.from(tables.keys()).filter(
          (n) => !n.startsWith('gpkg_') && !n.startsWith('sqlite_') && !n.startsWith('rtree_'),
        );

  const candidates: ParsedLayerCandidate[] = [];

  for (const tblName of targetTableNames) {
    const tbl = tables.get(tblName);
    if (!tbl) continue;

    const rows = readSqliteTableRows(gpkgBytes, tbl.rootPage, pageSize, usableSize);
    if (rows.length === 0) continue;

    const meta = contentMeta.get(tblName);
    const rawFeatures: SpatialFeature[] = [];
    let detectedSrsId: number | undefined = meta?.srsId;

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      const props: Record<string, any> = {};
      let geom: SpatialGeometry | null = null;

      for (let cIdx = 0; cIdx < row.values.length; cIdx++) {
        const colDef = tbl.columns[cIdx];
        const colName = colDef?.name ?? `col_${cIdx + 1}`;
        const cellVal = colDef?.isPrimaryKeyInt && row.values[cIdx] === null ? row.rowid : row.values[cIdx];

        if (cellVal instanceof Uint8Array) {
          const parsedBlob = parseGpbOrWkbBlob(cellVal);
          if (parsedBlob.geometry) {
            geom = parsedBlob.geometry;
            if (parsedBlob.srsId && !detectedSrsId) {
              detectedSrsId = parsedBlob.srsId;
            }
          }
        } else {
          props[colName] = cellVal;
        }
      }

      if (geom) {
        rawFeatures.push({
          type: 'Feature',
          id: props.id ?? props.fid ?? row.rowid,
          properties: sanitizeProperties(props, rIdx),
          geometry: geom,
        });
      }
    }

    if (rawFeatures.length === 0) continue;

    const srsWkt = detectedSrsId ? srsMap.get(detectedSrsId) : undefined;
    const metaCrs = detectCrsFromMetadata(srsWkt, detectedSrsId);
    const coordInferred = inferCrsFromCoordinates(rawFeatures);
    const detectedCrs = metaCrs ?? coordInferred.crs;
    const appliedCrs = crsOverride === 'AUTO' ? detectedCrs : crsOverride;
    const axisSwapped = crsOverride === 'AUTO' ? coordInferred.axisSwapped : false;

    const rawFc: SpatialFeatureCollection = {
      type: 'FeatureCollection',
      name: meta?.identifier || tblName,
      features: rawFeatures,
    };

    const candidate = await buildCandidateFromRawFeatureCollection({
      rawFc,
      layerName: meta?.identifier || tblName,
      description: meta?.description || `GeoPackage (${sourceFileName}) — ${tblName} 레이어`,
      sourceFileName,
      sourceFormat: 'gpkg',
      detectedCrs,
      appliedCrs,
      axisSwapped,
      detectedEncoding: 'UTF-8',
    });
    candidates.push(candidate);
  }

  return candidates;
}

// ============================================================================
// 3. KML / KMZ (.kml, .kmz) XML 파서
// ============================================================================

function parseKmlCoordString(coordText: string): [number, number][] {
  return coordText
    .trim()
    .split(/\s+/)
    .map((tuple) => {
      const parts = tuple.split(',').map(Number);
      return [parts[0], parts[1]] as [number, number];
    })
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
}

function parseKmlGeometryElement(container: Element): SpatialGeometry | null {
  const pointEl = container.getElementsByTagName('Point')[0];
  if (pointEl) {
    const coordEl = pointEl.getElementsByTagName('coordinates')[0];
    const pts = parseKmlCoordString(coordEl?.textContent ?? '');
    if (pts.length > 0) return { type: 'Point', coordinates: pts[0] };
  }

  const lineEl = container.getElementsByTagName('LineString')[0];
  if (lineEl) {
    const coordEl = lineEl.getElementsByTagName('coordinates')[0];
    const pts = parseKmlCoordString(coordEl?.textContent ?? '');
    if (pts.length >= 2) return { type: 'LineString', coordinates: pts };
  }

  const polyEl = container.getElementsByTagName('Polygon')[0];
  if (polyEl) {
    const rings: [number, number][][] = [];
    const outerEl = polyEl.getElementsByTagName('outerBoundaryIs')[0];
    if (outerEl) {
      const c = outerEl.getElementsByTagName('coordinates')[0];
      const pts = parseKmlCoordString(c?.textContent ?? '');
      if (pts.length >= 3) rings.push(pts);
    }
    const innerEls = polyEl.getElementsByTagName('innerBoundaryIs');
    for (let i = 0; i < innerEls.length; i++) {
      const c = innerEls[i].getElementsByTagName('coordinates')[0];
      const pts = parseKmlCoordString(c?.textContent ?? '');
      if (pts.length >= 3) rings.push(pts);
    }
    if (rings.length > 0) return { type: 'Polygon', coordinates: rings };
  }

  return null;
}

async function parseKmlText(
  kmlText: string,
  sourceFileName: string,
  crsOverride: SupportedCrsCode,
): Promise<ParsedLayerCandidate> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'text/xml');
  const docNameEl = doc.getElementsByTagName('name')[0];
  const baseLayerName =
    docNameEl?.textContent?.trim() || sourceFileName.replace(/\.(kml|kmz)$/i, '');

  const placemarks = doc.getElementsByTagName('Placemark');
  const rawFeatures: SpatialFeature[] = [];

  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    const geom = parseKmlGeometryElement(pm);
    if (!geom) continue;

    const props: Record<string, any> = {};
    const nameEl = pm.getElementsByTagName('name')[0];
    const descEl = pm.getElementsByTagName('description')[0];
    if (nameEl?.textContent) props.name = nameEl.textContent.trim();
    if (descEl?.textContent) props.description = descEl.textContent.trim();

    const simpleDataEls = pm.getElementsByTagName('SimpleData');
    for (let s = 0; s < simpleDataEls.length; s++) {
      const sd = simpleDataEls[s];
      const key = sd.getAttribute('name');
      if (key) props[key] = sd.textContent?.trim() ?? '';
    }

    const dataEls = pm.getElementsByTagName('Data');
    for (let d = 0; d < dataEls.length; d++) {
      const de = dataEls[d];
      const key = de.getAttribute('name');
      const valEl = de.getElementsByTagName('value')[0];
      if (key && valEl) props[key] = valEl.textContent?.trim() ?? '';
    }

    rawFeatures.push({
      type: 'Feature',
      id: props.id ?? `KML-${i + 1}`,
      properties: sanitizeProperties(props, i),
      geometry: geom,
    });
  }

  if (rawFeatures.length === 0) {
    throw new Error('KML 파일 내부에 유효한 공간 피처(Placemark)가 없습니다.');
  }

  const inferred = inferCrsFromCoordinates(rawFeatures);
  const appliedCrs = crsOverride === 'AUTO' ? inferred.crs : crsOverride;

  return buildCandidateFromRawFeatureCollection({
    rawFc: {
      type: 'FeatureCollection',
      name: baseLayerName,
      features: rawFeatures,
    },
    layerName: baseLayerName,
    description: `KML 공간 데이터 (${sourceFileName})`,
    sourceFileName,
    sourceFormat: 'kml',
    detectedCrs: inferred.crs,
    appliedCrs,
    axisSwapped: crsOverride === 'AUTO' ? inferred.axisSwapped : false,
    detectedEncoding: 'UTF-8',
  });
}

// ============================================================================
// 4. 후보 레이어 빌더 및 통합 엔트리포인트
// ============================================================================

async function buildCandidateFromRawFeatureCollection(params: {
  rawFc: SpatialFeatureCollection;
  layerName: string;
  description: string;
  sourceFileName: string;
  sourceFormat: 'gpkg' | 'shapefile' | 'geojson' | 'kml';
  detectedCrs: Exclude<SupportedCrsCode, 'AUTO'>;
  appliedCrs: Exclude<SupportedCrsCode, 'AUTO'>;
  axisSwapped: boolean;
  detectedEncoding: 'UTF-8' | 'EUC-KR';
  extraNotes?: string[];
}): Promise<ParsedLayerCandidate> {
  const {
    rawFc,
    layerName,
    description,
    sourceFileName,
    sourceFormat,
    detectedCrs,
    appliedCrs,
    axisSwapped,
    detectedEncoding,
    extraNotes = [],
  } = params;

  const normalized = reprojectAndNormalizeFeatureCollection(rawFc, appliedCrs, axisSwapped);
  const serialized = JSON.stringify(normalized.featureCollection);
  const dataSha256 = await computeSha256Hex(serialized);

  const attrKeySet = new Set<string>();
  for (const f of normalized.featureCollection.features.slice(0, 50)) {
    for (const k of Object.keys(f.properties ?? {})) {
      attrKeySet.add(k);
    }
  }
  const attributeKeys = Array.from(attrKeySet);
  const preferredLabelCandidates = [
    'name',
    '명칭',
    '이름',
    '공원명',
    '구역명',
    '보호구역명',
    'NAME',
    'KOR_NM',
    'id',
  ];
  const recommendedLabelField =
    preferredLabelCandidates.find((c) => attrKeySet.has(c)) ?? attributeKeys[0];

  const warnings: string[] = [];
  const [minLng, minLat, maxLng, maxLat] = normalized.bbox;
  if (minLng < 123 || maxLng > 133 || minLat < 31 || maxLat > 40) {
    warnings.push(
      `변환된 좌표 범위([${minLng.toFixed(2)}, ${minLat.toFixed(2)}])가 한반도/남해안 해역 밖입니다. 원본 좌표계(CRS) 선택을 확인하세요.`,
    );
  }

  return {
    candidateId: `${sourceFormat}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    layerName,
    description,
    sourceFileName,
    sourceFormat,
    detectedCrs,
    appliedCrs,
    axisSwapped,
    detectedEncoding,
    geometryTypes: normalized.geometryTypes,
    featureCount: normalized.featureCollection.features.length,
    vertexCount: normalized.vertexCount,
    bbox: normalized.bbox,
    attributeKeys,
    recommendedLabelField,
    autoHealedNotes: [...extraNotes, ...normalized.autoHealedNotes],
    warnings,
    dataSha256,
    featureCollection: normalized.featureCollection,
    rawFeatureCollection: rawFc,
  };
}

/**
 * 이미 파싱된 후보 레이어에 대해 사용자가 화면에서 CRS를 수동 변경했을 때 즉시 재투영 수행
 */
export async function reprojectLayerCandidate(
  candidate: ParsedLayerCandidate,
  newCrs: Exclude<SupportedCrsCode, 'AUTO'>,
): Promise<ParsedLayerCandidate> {
  const baseRaw = candidate.rawFeatureCollection ?? candidate.featureCollection;
  return buildCandidateFromRawFeatureCollection({
    rawFc: baseRaw,
    layerName: candidate.layerName,
    description: candidate.description,
    sourceFileName: candidate.sourceFileName,
    sourceFormat: candidate.sourceFormat,
    detectedCrs: candidate.detectedCrs as Exclude<SupportedCrsCode, 'AUTO'>,
    appliedCrs: newCrs,
    axisSwapped: false,
    detectedEncoding: candidate.detectedEncoding,
  });
}

/**
 * 직원이 선택한 1개 또는 복수 파일(.gpkg, .zip, .shp+.dbf+.prj+.cpg, .geojson/.json, .kml/.kmz)을
 * 일괄 분석하여 표준 WGS84 GeoJSON 후보 레이어 목록으로 변환
 */
export async function parseSpatialFiles(
  fileList: File[] | FileList,
  options?: {
    crsOverride?: SupportedCrsCode;
    encodingOverride?: SupportedTextEncoding;
  },
): Promise<MultiFormatParseResult> {
  const files = Array.from(fileList);
  const crsOverride = options?.crsOverride ?? 'AUTO';
  const encodingOverride = options?.encodingOverride ?? 'AUTO';
  const candidates: ParsedLayerCandidate[] = [];
  const errors: string[] = [];

  // 다중 파일 Shapefile(.shp + .dbf + .prj + .cpg) 묶음 처리를 위한 그룹화
  const looseShpGroups = new Map<
    string,
    { shp?: Uint8Array; dbf?: Uint8Array; prj?: string; cpg?: string; fileName: string }
  >();

  for (const file of files) {
    try {
      const lowerName = file.name.toLowerCase();
      const baseStem = file.name.replace(/\.[^.]+$/, '');
      const buf = new Uint8Array(await file.arrayBuffer());

      // 1. GeoPackage (.gpkg)
      if (lowerName.endsWith('.gpkg')) {
        const gpkgCandidates = await parseGeoPackageBuffer(buf, file.name, crsOverride);
        if (gpkgCandidates.length === 0) {
          errors.push(`${file.name}: GeoPackage 내부에서 공간 피처 테이블을 찾지 못했습니다.`);
        } else {
          candidates.push(...gpkgCandidates);
        }
        continue;
      }

      // 2. ZIP 아카이브 (.zip — Shapefile 묶음 또는 압축된 GeoJSON/GPKG/KML)
      if (lowerName.endsWith('.zip')) {
        const unzipped = unzipSync(buf);
        const zipShpGroups = new Map<
          string,
          { shp?: Uint8Array; dbf?: Uint8Array; prj?: string; cpg?: string; stem: string }
        >();

        for (const [entryPath, entryBytes] of Object.entries(unzipped)) {
          if (entryPath.includes('__MACOSX') || entryBytes.byteLength === 0) continue;
          const cleanName = entryPath.split('/').pop() ?? entryPath;
          const lowerEntry = cleanName.toLowerCase();
          const stem = cleanName.replace(/\.[^.]+$/, '');

          if (lowerEntry.endsWith('.shp')) {
            const g = zipShpGroups.get(stem) ?? { stem };
            g.shp = entryBytes;
            zipShpGroups.set(stem, g);
          } else if (lowerEntry.endsWith('.dbf')) {
            const g = zipShpGroups.get(stem) ?? { stem };
            g.dbf = entryBytes;
            zipShpGroups.set(stem, g);
          } else if (lowerEntry.endsWith('.prj')) {
            const g = zipShpGroups.get(stem) ?? { stem };
            g.prj = new TextDecoder('utf-8').decode(entryBytes);
            zipShpGroups.set(stem, g);
          } else if (lowerEntry.endsWith('.cpg')) {
            const g = zipShpGroups.get(stem) ?? { stem };
            g.cpg = new TextDecoder('utf-8').decode(entryBytes);
            zipShpGroups.set(stem, g);
          } else if (lowerEntry.endsWith('.gpkg')) {
            const gpkgCands = await parseGeoPackageBuffer(entryBytes, cleanName, crsOverride);
            candidates.push(...gpkgCands);
          } else if (lowerEntry.endsWith('.geojson') || lowerEntry.endsWith('.json')) {
            const decoded = decodeBytesWithEncoding(entryBytes, encodingOverride);
            const cand = await parseGeoJsonText(
              decoded.text,
              cleanName,
              crsOverride,
              decoded.detectedEncoding,
            );
            candidates.push(cand);
          } else if (lowerEntry.endsWith('.kml')) {
            const decoded = decodeBytesWithEncoding(entryBytes, encodingOverride);
            const cand = await parseKmlText(decoded.text, cleanName, crsOverride);
            candidates.push(cand);
          }
        }

        for (const group of zipShpGroups.values()) {
          if (!group.shp) continue;
          const shpCand = await buildShapefileCandidate({
            stem: group.stem,
            sourceFileName: `${file.name} (${group.stem}.shp)`,
            shpBytes: group.shp,
            dbfBytes: group.dbf,
            prjText: group.prj,
            cpgText: group.cpg,
            crsOverride,
            encodingOverride,
          });
          candidates.push(shpCand);
        }
        continue;
      }

      // 3. KMZ 압축 KML (.kmz)
      if (lowerName.endsWith('.kmz')) {
        const unzipped = unzipSync(buf);
        for (const [entryPath, entryBytes] of Object.entries(unzipped)) {
          if (entryPath.toLowerCase().endsWith('.kml')) {
            const decoded = decodeBytesWithEncoding(entryBytes, encodingOverride);
            const cand = await parseKmlText(decoded.text, file.name, crsOverride);
            candidates.push(cand);
          }
        }
        continue;
      }

      // 4. KML (.kml)
      if (lowerName.endsWith('.kml')) {
        const decoded = decodeBytesWithEncoding(buf, encodingOverride);
        const cand = await parseKmlText(decoded.text, file.name, crsOverride);
        candidates.push(cand);
        continue;
      }

      // 5. 개별 Shapefile 구성 파일 (.shp, .dbf, .prj, .cpg)
      if (
        lowerName.endsWith('.shp') ||
        lowerName.endsWith('.dbf') ||
        lowerName.endsWith('.prj') ||
        lowerName.endsWith('.cpg') ||
        lowerName.endsWith('.shx')
      ) {
        const key = baseStem.toLowerCase();
        const g = looseShpGroups.get(key) ?? { fileName: `${baseStem}.shp` };
        if (lowerName.endsWith('.shp')) g.shp = buf;
        else if (lowerName.endsWith('.dbf')) g.dbf = buf;
        else if (lowerName.endsWith('.prj')) g.prj = new TextDecoder('utf-8').decode(buf);
        else if (lowerName.endsWith('.cpg')) g.cpg = new TextDecoder('utf-8').decode(buf);
        looseShpGroups.set(key, g);
        continue;
      }

      // 6. GeoJSON / JSON (.geojson, .json)
      if (lowerName.endsWith('.geojson') || lowerName.endsWith('.json')) {
        const decoded = decodeBytesWithEncoding(buf, encodingOverride);
        const cand = await parseGeoJsonText(
          decoded.text,
          file.name,
          crsOverride,
          decoded.detectedEncoding,
        );
        candidates.push(cand);
        continue;
      }

      errors.push(`${file.name}: 지원하지 않는 파일 확장자입니다 (.gpkg, .zip, .shp, .geojson, .kml 지원).`);
    } catch (err: unknown) {
      errors.push(
        `${file.name}: ${err instanceof Error ? err.message : '파일 파싱 중 오류가 발생했습니다.'}`,
      );
    }
  }

  // 개별 선택된 Shapefile 그룹 처리
  for (const [stemKey, group] of looseShpGroups.entries()) {
    if (!group.shp) {
      errors.push(
        `${stemKey}: .dbf/.prj 파일만 선택되었습니다. 도형 정보가 담긴 .shp 파일을 함께 선택하거나 .zip으로 묶어 올려주세요.`,
      );
      continue;
    }
    try {
      const shpCand = await buildShapefileCandidate({
        stem: group.fileName.replace(/\.shp$/i, ''),
        sourceFileName: group.fileName,
        shpBytes: group.shp,
        dbfBytes: group.dbf,
        prjText: group.prj,
        cpgText: group.cpg,
        crsOverride,
        encodingOverride,
      });
      candidates.push(shpCand);
    } catch (err: unknown) {
      errors.push(
        `${group.fileName}: ${err instanceof Error ? err.message : 'Shapefile 파싱 실패'}`,
      );
    }
  }

  return { candidates, errors };
}

async function buildShapefileCandidate(params: {
  stem: string;
  sourceFileName: string;
  shpBytes: Uint8Array;
  dbfBytes?: Uint8Array;
  prjText?: string;
  cpgText?: string;
  crsOverride: SupportedCrsCode;
  encodingOverride: SupportedTextEncoding;
}): Promise<ParsedLayerCandidate> {
  const {
    stem,
    sourceFileName,
    shpBytes,
    dbfBytes,
    prjText,
    cpgText,
    crsOverride,
    encodingOverride,
  } = params;

  const geometries = parseShpBuffer(shpBytes);
  if (geometries.length === 0) {
    throw new Error('Shapefile (.shp) 내부에 유효한 도형 레코드가 없습니다.');
  }

  let dbfRecords: Record<string, any>[] = [];
  let detectedEncoding: 'UTF-8' | 'EUC-KR' = 'UTF-8';
  const extraNotes: string[] = [];

  if (dbfBytes) {
    const parsedDbf = parseDbfBuffer(dbfBytes, cpgText, encodingOverride);
    dbfRecords = parsedDbf.records;
    detectedEncoding = parsedDbf.detectedEncoding;
    if (detectedEncoding === 'EUC-KR') {
      extraNotes.push('Shapefile DBF의 한글 인코딩(CP949/EUC-KR)을 자동 감지하여 UTF-8로 복원했습니다.');
    }
  }

  const rawFeatures: SpatialFeature[] = geometries.map((geom, idx) => {
    const rawProps = dbfRecords[idx] ?? {};
    const props = sanitizeProperties(rawProps, idx);
    return {
      type: 'Feature',
      id: props.id,
      properties: props,
      geometry: geom,
    };
  });

  const prjCrs = detectCrsFromMetadata(prjText, null);
  const coordInferred = inferCrsFromCoordinates(rawFeatures);
  const detectedCrs = prjCrs ?? coordInferred.crs;
  const appliedCrs = crsOverride === 'AUTO' ? detectedCrs : crsOverride;

  return buildCandidateFromRawFeatureCollection({
    rawFc: {
      type: 'FeatureCollection',
      name: stem,
      features: rawFeatures,
    },
    layerName: stem,
    description: `Shapefile 공간 레이어 (${sourceFileName})`,
    sourceFileName,
    sourceFormat: 'shapefile',
    detectedCrs,
    appliedCrs,
    axisSwapped: crsOverride === 'AUTO' ? coordInferred.axisSwapped : false,
    detectedEncoding,
    extraNotes,
  });
}

async function parseGeoJsonText(
  jsonText: string,
  sourceFileName: string,
  crsOverride: SupportedCrsCode,
  detectedEncoding: 'UTF-8' | 'EUC-KR',
): Promise<ParsedLayerCandidate> {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('유효한 JSON 객체가 아닙니다.');
  }

  const extraNotes: string[] = [];
  let crsFromHeader: Exclude<SupportedCrsCode, 'AUTO'> | null = null;
  if (parsed.crs) {
    const crsName = parsed.crs?.properties?.name ?? JSON.stringify(parsed.crs);
    crsFromHeader = detectCrsFromMetadata(String(crsName), null);
    extraNotes.push('레거시 GeoJSON 최상위 crs 속성을 감지하고 RFC 7946 표준 규격으로 정리했습니다.');
  }

  let rawFeatures: SpatialFeature[] = [];
  if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
    rawFeatures = parsed.features;
  } else if (parsed.type === 'Feature' && parsed.geometry) {
    rawFeatures = [parsed];
  } else if (parsed.type && Array.isArray(parsed.coordinates)) {
    rawFeatures = [
      {
        type: 'Feature',
        properties: { id: 'FEAT-001', name: sourceFileName.replace(/\.[^.]+$/, '') },
        geometry: parsed as SpatialGeometry,
      },
    ];
  } else {
    throw new Error('GeoJSON FeatureCollection 또는 Feature 구조가 아닙니다.');
  }

  const coordInferred = inferCrsFromCoordinates(rawFeatures);
  const detectedCrs = crsFromHeader ?? coordInferred.crs;
  const appliedCrs = crsOverride === 'AUTO' ? detectedCrs : crsOverride;
  const baseName =
    (typeof parsed.name === 'string' && parsed.name.trim()) ||
    sourceFileName.replace(/\.(geojson|json)$/i, '');

  return buildCandidateFromRawFeatureCollection({
    rawFc: {
      type: 'FeatureCollection',
      name: baseName,
      features: rawFeatures,
    },
    layerName: baseName,
    description: `QGIS GeoJSON 레이어 (${sourceFileName})`,
    sourceFileName,
    sourceFormat: 'geojson',
    detectedCrs,
    appliedCrs,
    axisSwapped: crsOverride === 'AUTO' ? coordInferred.axisSwapped : false,
    detectedEncoding,
    extraNotes,
  });
}

// ============================================================================
// 5. 직원용 실무 포맷 테스트 샘플 생성기 (.gpkg / .zip Shapefile EPSG:5179 / .kml)
// ============================================================================

/**
 * 실제 SQLite3 B-tree 구조와 OGC GeoPackage Binary(GPB, EPSG:5179 UTM-K 좌표)를 가진
 * 정식 .gpkg 바이너리 파일 생성 (직원 실무 테스트 및 E2E 검증용)
 */
export function createSampleGeoPackageFile(): File {
  const pageSize = 4096;
  const db = new Uint8Array(pageSize * 2);
  const view = new DataView(db.buffer);

  // SQLite 3 파일 헤더 (100 bytes)
  const magic = new TextEncoder().encode('SQLite format 3\0');
  db.set(magic, 0);
  view.setUint16(16, pageSize, false);
  db[18] = 1;
  db[19] = 1;
  db[20] = 0; // reserved space
  db[21] = 64;
  db[22] = 32;
  db[23] = 32;
  view.setUint32(28, 2, false); // database size in pages = 2
  view.setUint32(44, 4, false); // schema format = 4
  view.setUint32(56, 1, false); // text encoding = 1 (UTF-8)
  view.setUint32(68, 0x47503130, false); // Application ID 'GP10'

  // Page 1: sqlite_schema leaf table B-tree (offset 100)
  db[100] = 0x0d; // leaf table page
  view.setUint16(103, 1, false); // 1 cell (table definition for marine_patrol_zone)
  const createSql =
    'CREATE TABLE marine_patrol_zone (fid INTEGER PRIMARY KEY, geom BLOB, name TEXT, zone_type TEXT, office TEXT)';
  const tblNameBytes = new TextEncoder().encode('marine_patrol_zone');
  const typeBytes = new TextEncoder().encode('table');
  const sqlBytes = new TextEncoder().encode(createSql);

  // Serial types for sqlite_schema: [type(TEXT), name(TEXT), tbl_name(TEXT), rootpage(INT8=2), sql(TEXT)]
  const stType = typeBytes.length * 2 + 13;
  const stName = tblNameBytes.length * 2 + 13;
  const stRoot = 1; // 1-byte int = 2
  const stSql = sqlBytes.length * 2 + 13;

  // Build record payload for Page 1 cell
  const encodeVarint = (n: number): number[] => {
    if (n < 128) return [n];
    return [((n >> 7) & 0x7f) | 0x80, n & 0x7f];
  };
  const hdrVarints = [
    ...encodeVarint(stType),
    ...encodeVarint(stName),
    ...encodeVarint(stName),
    ...encodeVarint(stRoot),
    ...encodeVarint(stSql),
  ];
  const hdrLen = hdrVarints.length + 1;
  const recPayload = new Uint8Array(
    hdrLen + typeBytes.length + tblNameBytes.length * 2 + 1 + sqlBytes.length,
  );
  let p = 0;
  recPayload[p++] = hdrLen;
  recPayload.set(hdrVarints, p);
  p += hdrVarints.length;
  recPayload.set(typeBytes, p);
  p += typeBytes.length;
  recPayload.set(tblNameBytes, p);
  p += tblNameBytes.length;
  recPayload.set(tblNameBytes, p);
  p += tblNameBytes.length;
  recPayload[p++] = 2; // rootpage = 2
  recPayload.set(sqlBytes, p);

  const cell1Offset = 3500;
  view.setUint16(105, cell1Offset, false);
  view.setUint16(108, cell1Offset, false); // cell pointer #0
  const pSizeVar = encodeVarint(recPayload.length);
  let cPos = cell1Offset;
  db.set(pSizeVar, cPos);
  cPos += pSizeVar.length;
  db[cPos++] = 1; // rowid = 1
  db.set(recPayload, cPos);

  // Page 2 (offset 4096): marine_patrol_zone leaf table page with EPSG:5179 Polygon GPB
  const page2Start = pageSize;
  db[page2Start] = 0x0d;
  view.setUint16(page2Start + 3, 1, false); // 1 feature row

  // Convert Tongyeong Hansando Marine Zone WGS84 coords to EPSG:5179 UTM-K
  const wgsRing: [number, number][] = [
    [128.435, 34.805],
    [128.495, 34.805],
    [128.495, 34.762],
    [128.435, 34.762],
    [128.435, 34.805],
  ];
  const utmkRing = wgsRing.map(([lng, lat]) => proj4('EPSG:4326', 'EPSG:5179', [lng, lat]));

  // Build GPB (8B header + 1B endian + 4B wkbType=3(Polygon) + 4B numRings=1 + 4B numPts=5 + 5*16B coords = 101 bytes)
  const gpb = new Uint8Array(8 + 1 + 4 + 4 + 4 + utmkRing.length * 16);
  const gpbView = new DataView(gpb.buffer);
  gpb[0] = 0x47; // 'G'
  gpb[1] = 0x50; // 'P'
  gpb[2] = 0x00; // version 0
  gpb[3] = 0x01; // little-endian, no envelope
  gpbView.setInt32(4, 5179, true); // srs_id = 5179 (EPSG:5179 UTM-K!)
  let gOff = 8;
  gpb[gOff++] = 1; // WKB little-endian
  gpbView.setUint32(gOff, 3, true); // wkbPolygon = 3
  gOff += 4;
  gpbView.setUint32(gOff, 1, true); // 1 ring
  gOff += 4;
  gpbView.setUint32(gOff, utmkRing.length, true);
  gOff += 4;
  for (const [ux, uy] of utmkRing) {
    gpbView.setFloat64(gOff, ux, true);
    gpbView.setFloat64(gOff + 8, uy, true);
    gOff += 16;
  }

  const featNameBytes = new TextEncoder().encode('한산도 해양생태 중점순찰구역 (GPKG·EPSG:5179)');
  const zoneTypeBytes = new TextEncoder().encode('해양순찰중점구역');
  const officeBytes = new TextEncoder().encode('한려해상생태보전과');

  const rowHdrVars = [
    0, // fid (NULL -> rowid)
    ...encodeVarint(gpb.length * 2 + 12), // geom BLOB
    ...encodeVarint(featNameBytes.length * 2 + 13),
    ...encodeVarint(zoneTypeBytes.length * 2 + 13),
    ...encodeVarint(officeBytes.length * 2 + 13),
  ];
  const rowHdrLen = rowHdrVars.length + 1;
  const rowPayload = new Uint8Array(
    rowHdrLen + gpb.length + featNameBytes.length + zoneTypeBytes.length + officeBytes.length,
  );
  let rp = 0;
  rowPayload[rp++] = rowHdrLen;
  rowPayload.set(rowHdrVars, rp);
  rp += rowHdrVars.length;
  rowPayload.set(gpb, rp);
  rp += gpb.length;
  rowPayload.set(featNameBytes, rp);
  rp += featNameBytes.length;
  rowPayload.set(zoneTypeBytes, rp);
  rp += zoneTypeBytes.length;
  rowPayload.set(officeBytes, rp);

  const cell2RelOffset = 3200;
  view.setUint16(page2Start + 5, cell2RelOffset, false);
  view.setUint16(page2Start + 8, cell2RelOffset, false);
  const p2SizeVar = encodeVarint(rowPayload.length);
  let c2Pos = page2Start + cell2RelOffset;
  db.set(p2SizeVar, c2Pos);
  c2Pos += p2SizeVar.length;
  db[c2Pos++] = 1; // rowid = 1
  db.set(rowPayload, c2Pos);

  return new File([db], '한려해상_해양순찰구역_EPSG5179.gpkg', {
    type: 'application/geopackage+sqlite3',
  });
}

/**
 * 실제 ESRI Shapefile (.shp + .dbf + .prj) ZIP 아카이브 생성 (EPSG:5179 UTM-K 투영 좌표계)
 */
export function createSampleShapefileZip(): File {
  // 통영~비진도 해상 순찰 항로 (LineString, EPSG:5179 좌표)
  const wgsLine: [number, number][] = [
    [128.4278, 34.8378],
    [128.445, 34.795],
    [128.462, 34.745],
    [128.458, 34.718],
  ];
  const utmkLine = wgsLine.map(([lng, lat]) => proj4('EPSG:4326', 'EPSG:5179', [lng, lat]));

  // .shp: 100B header + 8B record header + (4B shapeType=3 + 32B bbox + 4B numParts=1 + 4B numPoints=4 + 4B part[0]=0 + 4*16B points = 112B content)
  const contentByteLen = 4 + 32 + 4 + 4 + 4 + utmkLine.length * 16;
  const shp = new Uint8Array(100 + 8 + contentByteLen);
  const shpView = new DataView(shp.buffer);
  shpView.setInt32(0, 9994, false); // file code big-endian
  shpView.setInt32(24, (100 + 8 + contentByteLen) / 2, false); // file length in 16-bit words
  shpView.setInt32(28, 1000, true); // version 1000
  shpView.setInt32(32, 3, true); // PolyLine = 3

  // Record 1 header (offset 100)
  shpView.setInt32(100, 1, false); // record number 1
  shpView.setInt32(104, contentByteLen / 2, false); // content length in 16-bit words
  shpView.setInt32(108, 3, true); // shapeType = 3 (PolyLine)
  shpView.setInt32(108 + 36, 1, true); // numParts = 1
  shpView.setInt32(108 + 40, utmkLine.length, true); // numPoints = 4
  shpView.setInt32(108 + 44, 0, true); // parts[0] = 0
  let pOff = 108 + 48;
  for (const [ux, uy] of utmkLine) {
    shpView.setFloat64(pOff, ux, true);
    shpView.setFloat64(pOff + 8, uy, true);
    pOff += 16;
  }

  // .dbf: 1 record with 2 fields (id C(16), name C(100))
  const headerLen = 32 + 32 * 2 + 1;
  const recLen = 1 + 16 + 100;
  const dbf = new Uint8Array(headerLen + recLen);
  const dbfView = new DataView(dbf.buffer);
  dbf[0] = 0x03;
  dbfView.setUint32(4, 1, true); // 1 record
  dbfView.setUint16(8, headerLen, true);
  dbfView.setUint16(10, recLen, true);

  // Field 1: id
  dbf.set(new TextEncoder().encode('id'), 32);
  dbf[32 + 11] = 'C'.charCodeAt(0);
  dbf[32 + 16] = 16;
  // Field 2: name
  dbf.set(new TextEncoder().encode('name'), 64);
  dbf[64 + 11] = 'C'.charCodeAt(0);
  dbf[64 + 16] = 100;
  dbf[96] = 0x0d; // header terminator

  // Record 1 data
  dbf[headerLen] = 0x20; // active record
  const idBytes = new TextEncoder().encode('PATROL-LINE-01');
  const nameBytes = new TextEncoder().encode('통영-비진도 정기 해상순찰 항로 (Shapefile·EPSG:5179)');
  dbf.set(idBytes.subarray(0, 16), headerLen + 1);
  dbf.set(nameBytes.subarray(0, 100), headerLen + 1 + 16);

  const prjText =
    'PROJCS["Korea 2000 / Unified CS",GEOGCS["Korea 2000",DATUM["Geocentric_datum_of_Korea",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",38],PARAMETER["central_meridian",127.5],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",1000000],PARAMETER["false_northing",2000000],UNIT["Meter",1],AUTHORITY["EPSG","5179"]]';

  const zipped = zipSync({
    'patrol_route_5179.shp': shp,
    'patrol_route_5179.dbf': dbf,
    'patrol_route_5179.prj': new TextEncoder().encode(prjText),
    'patrol_route_5179.cpg': new TextEncoder().encode('UTF-8'),
  });

  return new File([zipped], '통영_비진도_해상순찰항로_Shapefile_EPSG5179.zip', {
    type: 'application/zip',
  });
}
