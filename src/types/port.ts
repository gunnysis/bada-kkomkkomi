export type PortRegion = '통영' | '거제';
export type PortCategory = 'docking' | 'port';
export type PortSubCategory = 'official_docking' | 'small_berth' | 'port';
export type TidalSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface MarineWaypointNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  neighbors: string[];
}

export interface MarinePort {
  id: string;
  name: string;
  region: PortRegion;
  category: PortCategory;
  subCategory?: PortSubCategory;
  lat: number;
  lng: number;
  seaApproachLat?: number;
  seaApproachLng?: number;
  description: string;
  aliases?: string[];
  eupmyeondong?: string;
  islandName?: string | null;
  portClassLabel?: string;
  facilityType?: string;
  facilityLabel?: string;
  minDepthMeters?: number;
  tidalSensitivity?: TidalSensitivity;
  maxVesselTons?: number;
  hazards?: string[];
  connectedWaypointIds?: string[];
  parentPortId?: string | null;
}

export interface PortsDataset {
  version: string;
  snap_radius_meters: number;
  ports: MarinePort[];
  waypoints?: MarineWaypointNode[];
}
