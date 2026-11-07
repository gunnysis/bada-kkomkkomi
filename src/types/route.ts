export interface RouteWaypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'start' | 'waypoint' | 'end';
}

export interface RouteLeg {
  from: RouteWaypoint;
  to: RouteWaypoint;
  distanceKm: number;
  distanceNm: number;
  durationMinutes: number;
}

export interface RouteCalculationResult {
  legs: RouteLeg[];
  totalDistanceKm: number;
  totalDistanceNm: number;
  totalDurationMinutes: number;
  speedKnots: number;
}
