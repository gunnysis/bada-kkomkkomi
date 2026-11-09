export interface RouteWaypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'start' | 'waypoint' | 'end';
  matchedPortId?: string;
  isCustomCoord?: boolean;
  subCategory?: 'official_docking' | 'small_berth' | 'port';
  facilityLabel?: string;
  minDepthMeters?: number;
  tidalSensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';
  maxVesselTons?: number;
  hazards?: string[];
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
  directDistanceNm?: number;
  detourFactor?: number;
  durationMinutes: number;
  bearingDeg: number;
  cardinal: string;
  directBearingDeg?: number;
  directCardinal?: string;
  pathPositions?: [number, number][];
  waypointNames?: string[];
  safetyLevel?: 'safe' | 'caution' | 'danger';
  safetyNote?: string;
}

export interface RouteCalculationResult {
  legs: RouteLeg[];
  totalDistanceKm: number;
  totalDistanceNm: number;
  totalDirectDistanceNm?: number;
  totalDurationMinutes: number;
  speedKnots: number;
}
