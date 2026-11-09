export interface AdminConfig {
  report_recipient_email: string;
  report_cc_email?: string;
  department_name: string;
}

export interface DefaultRegionConfig {
  name: string;
  center: [number, number];
  zoom: number;
}

export interface RouteDefaultsConfig {
  default_speed_knots: number;
}

export interface WeatherDefaultsConfig {
  wind_threshold_knot: {
    good: number;
    moderate: number;
  };
  wave_threshold_meter: {
    good: number;
    moderate: number;
  };
}

export type SpatialGeometryType =
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon';

export type StrokeDashPattern = 'solid' | 'shortdash' | 'shortdot';

export interface LayerRenderStyle {
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  strokeDash: StrokeDashPattern;
  fillColor: string;
  fillOpacity: number;
  pointRadius: number;
  labelField?: string;
  showLabels?: boolean;
  zIndex?: number;
}

export interface LayerSourceMeta {
  originalFileName?: string;
  originalFormat?: 'gpkg' | 'shapefile' | 'geojson' | 'kml';
  detectedCrs?: string;
  detectedEncoding?: 'UTF-8' | 'EUC-KR';
  updatedAt?: string;
  updatedBy?: string;
  dataSha256?: string;
}

export interface MapLayerConfig {
  id: string;
  name: string;
  visible: boolean;
  color: string;
  url?: string;
  description: string;
  isSystemLayer?: boolean;
  geometryTypes?: SpatialGeometryType[];
  featureCount?: number;
  bbox?: [number, number, number, number];
  style?: LayerRenderStyle;
  sourceMeta?: LayerSourceMeta;
}

export interface AppConfig {
  admin: AdminConfig;
  default_region: DefaultRegionConfig;
  route_defaults: RouteDefaultsConfig;
  weather_defaults: WeatherDefaultsConfig;
  layers: MapLayerConfig[];
}
