export interface PorpoiseRecord {
  id: string;
  lat: number;
  lng: number;
  observedAt: string; // ISO 8601 string (e.g. 2026-11-07T14:30)
  count: number;
  createdAt: number;
}
