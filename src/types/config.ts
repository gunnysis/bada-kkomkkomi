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

export interface MapLayerConfig {
  id: string;
  name: string;
  visible: boolean;
  color: string;
  url?: string;
  description: string;
}

export interface AppConfig {
  admin: AdminConfig;
  default_region: DefaultRegionConfig;
  route_defaults: RouteDefaultsConfig;
  weather_defaults: WeatherDefaultsConfig;
  layers: MapLayerConfig[];
}
