import type { RouteWaypoint, RouteLeg, RouteCalculationResult } from '../types/route';

/**
 * WGS84 좌표간 대권거리(Haversine Formula) 계산
 * @returns 킬로미터(km) 거리
 */
export function calculateHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
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
 * 예상 소요시간(분) 계산 공식
 * 예상 소요시간(분) = 거리(해리) ÷ 속력(노트) × 60
 */
export function calculateDurationMinutes(distanceNm: number, speedKnots: number): number {
  if (speedKnots <= 0) return 0;
  return (distanceNm / speedKnots) * 60;
}

/**
 * 경로 포인트 목록과 선박 속력으로 전체 및 구간별 항해 연산 수행
 */
export function calculateRouteSummary(
  waypoints: RouteWaypoint[],
  speedKnots: number
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

    legs.push({
      from,
      to,
      distanceKm,
      distanceNm,
      durationMinutes,
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
