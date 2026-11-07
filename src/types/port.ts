export type PortRegion = '통영' | '거제';
export type PortCategory = 'docking' | 'port';

export interface MarinePort {
  id: string;
  name: string;
  region: PortRegion;
  category: PortCategory;
  lat: number;
  lng: number;
  description: string;
}

export interface PortsDataset {
  version: string;
  snap_radius_meters: number;
  ports: MarinePort[];
}
