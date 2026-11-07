import type { MarinePort } from '../types/port';
import type { RouteWaypoint, RouteLeg, RouteCalculationResult } from '../types/route';

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
 * 지능형 항구/좌표 스냅 판정 (500m 이내 항포구/접안지 자동 매칭, 그 외 해상 좌표 표기)
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
 * 경로 포인트 목록과 선박 속력으로 전체 및 구간별 항해 연산 수행
 */
export function calculateRouteSummary(
  waypoints: RouteWaypoint[],
  speedKnots: number,
): RouteCalculationResult {
  if (waypoints.length < 2) {
    return {
      legs: [],
      totalDistanceKm: 0,
      totalDistanceNm: 0,
      totalDurationMinutes: 0,
      speedKnots,
    };
  }

  const legs: RouteLeg[] = [];
  let totalDistanceKm = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    const distanceKm = calculateHaversineKm(from.lat, from.lng, to.lat, to.lng);
    const distanceNm = kmToNauticalMiles(distanceKm);
    const durationMinutes = calculateDurationMinutes(distanceNm, speedKnots);
    const bearingDeg = calculateBearingDegrees(from.lat, from.lng, to.lat, to.lng);
    const cardinal = bearingToCardinal8(bearingDeg);

    legs.push({
      id: `${from.id}-${to.id}`,
      index: i + 1,
      from,
      to,
      midLat: (from.lat + to.lat) / 2,
      midLng: (from.lng + to.lng) / 2,
      distanceKm,
      distanceNm,
      durationMinutes,
      bearingDeg,
      cardinal,
    });
    totalDistanceKm += distanceKm;
  }

  const totalDistanceNm = kmToNauticalMiles(totalDistanceKm);
  const totalDurationMinutes = calculateDurationMinutes(totalDistanceNm, speedKnots);

  return {
    legs,
    totalDistanceKm,
    totalDistanceNm,
    totalDurationMinutes,
    speedKnots,
  };
}
