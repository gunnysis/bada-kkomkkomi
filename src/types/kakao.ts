/**
 * Kakao Maps JavaScript SDK v3 엄격 타입 정의
 * 외부 @types 의존성 없이 프로젝트 내 GIS 레이어(Map, CustomOverlay, Polygon, Polyline, Circle, MapProjection)를
 * TypeScript 7.0 및 Oxlint 116개 규칙 하에서 안전하게 다루기 위한 선언입니다.
 */

export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

export interface KakaoPoint {
  x: number;
  y: number;
}

export interface KakaoMapProjection {
  coordsFromContainerPoint(point: KakaoPoint): KakaoLatLng;
  containerPointFromCoords(latlng: KakaoLatLng): KakaoPoint;
}

export interface KakaoMapOptions {
  center: KakaoLatLng;
  level?: number;
  mapTypeId?: number;
  draggable?: boolean;
  scrollwheel?: boolean;
  disableDoubleClickZoom?: boolean;
}

export interface KakaoAnimateOptions {
  animate?: boolean | { duration?: number };
}

export interface KakaoMap {
  setCenter(latlng: KakaoLatLng): void;
  getCenter(): KakaoLatLng;
  panTo(latlng: KakaoLatLng): void;
  setLevel(level: number, options?: KakaoAnimateOptions): void;
  getLevel(): number;
  setMapTypeId(mapTypeId: number): void;
  getMapTypeId(): number;
  setDraggable(draggable: boolean): void;
  getDraggable(): boolean;
  setZoomable(zoomable: boolean): void;
  getProjection(): KakaoMapProjection;
  relayout(): void;
}

export interface KakaoCustomOverlayOptions {
  map?: KakaoMap | null;
  position: KakaoLatLng;
  content: HTMLElement | string;
  xAnchor?: number;
  yAnchor?: number;
  zIndex?: number;
  clickable?: boolean;
}

export interface KakaoCustomOverlay {
  setMap(map: KakaoMap | null): void;
  getMap(): KakaoMap | null;
  setPosition(position: KakaoLatLng): void;
  getPosition(): KakaoLatLng;
  setContent(content: HTMLElement | string): void;
  setZIndex(zIndex: number): void;
}

export type KakaoStrokeStyle =
  | 'solid'
  | 'shortdash'
  | 'shortdot'
  | 'shortdashdot'
  | 'shortdashdotdot'
  | 'dot'
  | 'dash'
  | 'dashdot'
  | 'longdash'
  | 'longdashdot'
  | 'longdashdotdot';

export interface KakaoPolygonOptions {
  map?: KakaoMap | null;
  path: KakaoLatLng[] | KakaoLatLng[][];
  strokeWeight?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeStyle?: KakaoStrokeStyle;
  fillColor?: string;
  fillOpacity?: number;
  zIndex?: number;
}

export interface KakaoPolygon {
  setMap(map: KakaoMap | null): void;
  setPath(path: KakaoLatLng[] | KakaoLatLng[][]): void;
}

export interface KakaoPolylineOptions {
  map?: KakaoMap | null;
  path: KakaoLatLng[];
  strokeWeight?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeStyle?: KakaoStrokeStyle;
  zIndex?: number;
}

export interface KakaoPolyline {
  setMap(map: KakaoMap | null): void;
  setPath(path: KakaoLatLng[]): void;
}

export interface KakaoCircleOptions {
  map?: KakaoMap | null;
  center: KakaoLatLng;
  radius: number;
  strokeWeight?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeStyle?: KakaoStrokeStyle;
  fillColor?: string;
  fillOpacity?: number;
  zIndex?: number;
}

export interface KakaoCircle {
  setMap(map: KakaoMap | null): void;
  setPosition(position: KakaoLatLng): void;
  setRadius(radius: number): void;
}

export interface KakaoMouseEvent {
  latLng: KakaoLatLng;
  point: KakaoPoint;
}

export interface KakaoMapsNamespace {
  load(callback: () => void): void;
  Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMap;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Point: new (x: number, y: number) => KakaoPoint;
  CustomOverlay: new (options: KakaoCustomOverlayOptions) => KakaoCustomOverlay;
  Polygon: new (options: KakaoPolygonOptions) => KakaoPolygon;
  Polyline: new (options: KakaoPolylineOptions) => KakaoPolyline;
  Circle: new (options: KakaoCircleOptions) => KakaoCircle;
  MapTypeId: {
    ROADMAP: number;
    SKYVIEW: number;
    HYBRID: number;
  };
  event: {
    addListener<T = KakaoMouseEvent>(
      target: object,
      type: string,
      handler: (e: T) => void,
    ): void;
    removeListener<T = KakaoMouseEvent>(
      target: object,
      type: string,
      handler: (e: T) => void,
    ): void;
    preventMap(): void;
  };
}

declare global {
  interface Window {
    kakao?: {
      maps?: KakaoMapsNamespace;
    };
  }
}
