/**
 * Kakao Maps JavaScript SDK v3 엄격 타입 정의
 * 외부 @types 의존성 없이 프로젝트 내 GIS 레이어(Map, CustomOverlay, Polygon, Polyline, Circle, MapProjection)를
 * TypeScript 7.0 및 Oxlint 116개 규칙 하에서 안전하게 다루기 위한 선언입니다.
 */

export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

export interface KakaoLatLngBounds {
  extend(latlng: KakaoLatLng): void;
  isEmpty(): boolean;
  getSouthWest(): KakaoLatLng;
  getNorthEast(): KakaoLatLng;
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

export type KakaoBaseMapType = 'roadmap' | 'skyview' | 'hybrid';

export type KakaoOverlayMapType =
  | 'terrain'
  | 'use_district'
  | 'roadview'
  | 'traffic'
  | 'bicycle';

export interface KakaoMapTypePreferences {
  baseMapType: KakaoBaseMapType;
  overlayMapTypes: KakaoOverlayMapType[];
}

export interface RoadviewTargetLocation {
  lat: number;
  lng: number;
  title: string;
  pointId?: string;
}

export interface KakaoMap {
  setCenter(latlng: KakaoLatLng): void;
  getCenter(): KakaoLatLng;
  panTo(latlng: KakaoLatLng): void;
  setBounds(
    bounds: KakaoLatLngBounds,
    paddingTop?: number,
    paddingRight?: number,
    paddingBottom?: number,
    paddingLeft?: number,
  ): void;
  setLevel(level: number, options?: KakaoAnimateOptions): void;
  getLevel(): number;
  setMapTypeId(mapTypeId: number): void;
  getMapTypeId(): number;
  addOverlayMapTypeId(mapTypeId: number): void;
  removeOverlayMapTypeId(mapTypeId: number): void;
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

export interface KakaoViewpoint {
  pan: number;
  tilt: number;
  zoom: number;
  panoId?: number;
}

export interface KakaoRoadviewOptions {
  panoId?: number;
  panoX?: number;
  panoY?: number;
  pan?: number;
  tilt?: number;
  zoom?: number;
  disableZoomControl?: boolean;
}

export interface KakaoRoadview {
  setPanoId(panoId: number, position: KakaoLatLng): void;
  getPanoId(): number;
  getPosition(): KakaoLatLng;
  setViewpoint(viewpoint: KakaoViewpoint): void;
  getViewpoint(): KakaoViewpoint;
  relayout(): void;
}

export interface KakaoRoadviewClient {
  getNearestPanoId(
    position: KakaoLatLng,
    radius: number,
    callback: (panoId: number | null) => void,
  ): void;
}

export interface KakaoMapsNamespace {
  load(callback: () => void): void;
  Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMap;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new (sw?: KakaoLatLng, ne?: KakaoLatLng) => KakaoLatLngBounds;
  Point: new (x: number, y: number) => KakaoPoint;
  CustomOverlay: new (options: KakaoCustomOverlayOptions) => KakaoCustomOverlay;
  Polygon: new (options: KakaoPolygonOptions) => KakaoPolygon;
  Polyline: new (options: KakaoPolylineOptions) => KakaoPolyline;
  Circle: new (options: KakaoCircleOptions) => KakaoCircle;
  Roadview: new (container: HTMLElement, options?: KakaoRoadviewOptions) => KakaoRoadview;
  RoadviewClient: new () => KakaoRoadviewClient;
  MapTypeId: {
    ROADMAP: number;
    NORMAL: number;
    SKYVIEW: number;
    HYBRID: number;
    OVERLAY: number;
    ROADVIEW: number;
    TRAFFIC: number;
    TERRAIN: number;
    BICYCLE: number;
    BICYCLE_HYBRID: number;
    USE_DISTRICT: number;
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
