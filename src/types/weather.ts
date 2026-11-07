export type MarineWeatherGrade = 'good' | 'moderate' | 'bad' | 'unknown';

export interface WeatherThresholds {
  windKnot: {
    good: number;
    moderate: number;
  };
  waveMeter: {
    good: number;
    moderate: number;
  };
}

export interface HourlyMarineWeather {
  time: string; // ISO 8601 (e.g. 2026-11-07T14:00)
  displayTime: string; // e.g. "11/07 14:00"
  windSpeedKnots: number | null;
  waveHeightMeters: number | null;
  grade: MarineWeatherGrade;
  windGrade: MarineWeatherGrade;
  waveGrade: MarineWeatherGrade;
}

export interface MarineWeatherStatusResult {
  lat: number;
  lng: number;
  hourly: HourlyMarineWeather[];
  selectedIndex: number;
  current: HourlyMarineWeather | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
}
