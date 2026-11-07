export interface RouteWaypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'start' | 'waypoint' | 'end';
  matchedPortId?: string;
  isCustomCoord?: boolean;
}

export interface RouteLeg {
  id: string;
  index: number;
  from: RouteWaypoint;
  to: RouteWaypoint;
  midLat: number;
  midLng: number;
  distanceKm: number;
  distanceNm: number;
  durationMinutes: number;
  bearingDeg: number;
  cardinal: string;
}

export interface RouteCalculationResult {
  legs: RouteLeg[];
  totalDistanceKm: number;
  totalDistanceNm: number;
  totalDurationMinutes: number;
  speedKnots: number;
}
