import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, TileLayer, useMap, Polyline, GeoJSON, useMapEvents } from 'react-leaflet';
import { Compass, LocateFixed, Maximize, Minus, Plus } from 'lucide-react';
import type { DockingFeature, MarkerColor } from '../types/docking';
import { MARKER_COLOR_MAP } from '../types/docking';
import type { PorpoiseRecord } from '../types/porpoise';
import type { RouteWaypoint } from '../types/route';
import type { MapLayerConfig } from '../types/config';

interface UserGpsLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  isSimulated?: boolean;
}

interface MapViewProps {
  // 모드
  activeMainTab: 'notebook' | 'navigation';
  navSubTab: 'route' | 'weather';

  // 3.1 꼬미의 바다수첩
  features: DockingFeature[];
  selectedFeature: DockingFeature | null;
  onSelectFeature: (feature: DockingFeature) => void;
  layers: MapLayerConfig[];
  showPorpoiseLayer: boolean;
  isPorpoiseAddMode: boolean;
  porpoiseRecords: PorpoiseRecord[];
  onSelectPorpoise: (record: PorpoiseRecord) => void;
  onMapClickForPorpoise: (lat: number, lng: number) => void;

  // 3.2 바닷길 콕콕 (경로 계산)
  routeWaypoints: RouteWaypoint[];
  onUpdateWaypointPos: (id: string, lat: number, lng: number) => void;

  // 3.2 바닷길 콕콕 (해상기상)
  weatherCoords: { lat: number; lng: number };
  weatherGrade: 'good' | 'moderate' | 'bad' | 'unknown';
  onUpdateWeatherCoords: (lat: number, lng: number) => void;

  // 공통
  userLocation: UserGpsLocation | null;
  onRequestGps: () => void;
  onSimulateFieldGps: () => void;
  flyTarget: { lat: number; lng: number; zoom: number; nonce: number } | null;
  onResetBounds: () => void;
}

const DEFAULT_CENTER: [number, number] = [34.8195, 128.552];
const DEFAULT_ZOOM = 11;

// 커스텀 접안 마커
function createDockingMarkerIcon(color: MarkerColor, pointCode: string, isSelected: boolean): L.DivIcon {
  const theme = MARKER_COLOR_MAP[color] ?? MARKER_COLOR_MAP.blue;
  const scaleStyle = isSelected ? 'transform: scale(1.16);' : '';
  const selectedHalo = isSelected
    ? `<circle cx="26" cy="22" r="21" fill="none" stroke="${theme.ringHex}" stroke-width="3.5" stroke-dasharray="5 3" />`
    : '';

  const html = `
    <div class="bada-marker-hit-target" style="${scaleStyle}">
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div style="
          margin-bottom: 2px;
          padding: 1px 6px;
          border-radius: 6px;
          background: #020617;
          border: 1.5px solid ${isSelected ? '#ffffff' : theme.hex};
          color: #f8fafc;
          font-size: 10px;
          font-weight: 900;
          line-height: 1.2;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.65);
        ">${pointCode}</div>
        <svg width="44" height="44" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.65));">
          ${selectedHalo}
          <path d="M26 4C16.611 4 9 11.611 9 21C9 33.25 26 48 26 48C26 48 43 33.25 43 21C43 11.611 35.389 4 26 4Z" fill="${theme.hex}" stroke="#ffffff" stroke-width="3" />
          <circle cx="26" cy="21" r="7.5" fill="#0b192c" stroke="#ffffff" stroke-width="2" />
          <circle cx="26" cy="21" r="3.2" fill="#ffffff" />
        </svg>
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'bada-custom-marker',
    html,
    iconSize: [52, 58],
    iconAnchor: [26, 54],
  });
}

// 상괭이 관찰 마커
function createPorpoiseIcon(count: number): L.DivIcon {
  const html = `
    <div class="bada-marker-hit-target" style="cursor: pointer;">
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div style="
          margin-bottom: 2px;
          padding: 1px 5px;
          border-radius: 9999px;
          background: #0d9488;
          color: #ffffff;
          font-size: 10px;
          font-weight: 900;
          box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        ">상괭이 ${count}마리</div>
        <div style="
          width: 38px;
          height: 38px;
          border-radius: 9999px;
          background: #14b8a6;
          border: 3px solid #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.6);
        ">🐬</div>
      </div>
    </div>
  `;
  return L.divIcon({
    className: 'bada-custom-marker',
    html,
    iconSize: [44, 52],
    iconAnchor: [22, 48],
  });
}

// 항해 경로 드래그 마커 (출발 🟢 / 경유 🟡 / 도착 🔴)
function createRouteWaypointIcon(type: 'start' | 'waypoint' | 'end', label: string): L.DivIcon {
  const bg = type === 'start' ? '#10b981' : type === 'waypoint' ? '#f59e0b' : '#ef4444';
  const icon = type === 'start' ? '출발' : type === 'waypoint' ? '경유' : '도착';
  const html = `
    <div style="display: flex; flex-direction: column; align-items: center; cursor: grab;">
      <div style="
        padding: 2px 6px;
        border-radius: 6px;
        background: #020617;
        border: 2px solid ${bg};
        color: #ffffff;
        font-size: 10px;
        font-weight: 900;
        margin-bottom: 2px;
        white-space: nowrap;
      ">${label} (${icon})</div>
      <div style="
        width: 34px;
        height: 34px;
        border-radius: 9999px;
        background: ${bg};
        border: 3px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 900;
        color: #020617;
      ">⚓</div>
    </div>
  `;
  return L.divIcon({
    className: 'bada-custom-marker',
    html,
    iconSize: [40, 50],
    iconAnchor: [20, 48],
  });
}

// 해상기상 상태 3단계 신호등 마커
function createWeatherPinIcon(grade: 'good' | 'moderate' | 'bad' | 'unknown'): L.DivIcon {
  const color =
    grade === 'good'
      ? '#10b981'
      : grade === 'moderate'
      ? '#94a3b8'
      : grade === 'bad'
      ? '#ef4444'
      : '#64748b';
  const label = grade === 'good' ? '좋음' : grade === 'moderate' ? '보통' : grade === 'bad' ? '나쁨' : '?';

  const html = `
    <div style="display: flex; flex-direction: column; align-items: center; cursor: grab;">
      <div style="
        padding: 3px 8px;
        border-radius: 9999px;
        background: #020617;
        border: 2px solid ${color};
        color: #ffffff;
        font-size: 11px;
        font-weight: 900;
        margin-bottom: 2px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.6);
      ">기상: ${label}</div>
      <div style="
        width: 42px;
        height: 42px;
        border-radius: 9999px;
        background: ${color};
        border: 3.5px solid #ffffff;
        box-shadow: 0 0 16px ${color};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
      ">🌤️</div>
    </div>
  `;
  return L.divIcon({
    className: 'bada-custom-marker',
    html,
    iconSize: [44, 56],
    iconAnchor: [22, 52],
  });
}

// GPS 내 위치 펄스 마커
function createGpsPulseIcon(): L.DivIcon {
  const html = `
    <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
      <span class="bada-gps-pulse-ring" style="position: absolute; width: 34px; height: 34px; border-radius: 9999px; background: rgba(56, 189, 248, 0.45); border: 2px solid #38bdf8;"></span>
      <span style="position: relative; width: 18px; height: 18px; border-radius: 9999px; background: #0ea5e9; border: 3.5px solid #ffffff; box-shadow: 0 0 12px rgba(14, 165, 233, 0.95);"></span>
    </div>
  `;
  return L.divIcon({
    className: 'bada-custom-marker',
    html,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function MapClickHandler({
  isPorpoiseAddMode,
  onMapClickForPorpoise,
}: {
  isPorpoiseAddMode: boolean;
  onMapClickForPorpoise: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (isPorpoiseAddMode) {
        onMapClickForPorpoise(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

function MapCameraAndThumbControls({
  flyTarget,
  onRequestGps,
  onSimulateFieldGps,
  onResetBounds,
  hasGps,
}: {
  flyTarget: { lat: number; lng: number; zoom: number; nonce: number } | null;
  onRequestGps: () => void;
  onSimulateFieldGps: () => void;
  onResetBounds: () => void;
  hasGps: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!flyTarget) return;
    map.flyTo([flyTarget.lat, flyTarget.lng], flyTarget.zoom, { animate: true, duration: 0.75 });
  }, [flyTarget, map]);

  return (
    <div
      className="fixed right-3.5 bottom-6 z-[900] flex flex-col gap-2.5"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
      aria-label="한 손 지도 조작 버튼 모음"
    >
      <button
        type="button"
        onClick={onRequestGps}
        aria-label="내 GPS 위치 찾기"
        className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 shadow-xl transition active:scale-95 ${
          hasGps ? 'border-sky-400 bg-sky-500 text-slate-950' : 'border-slate-600 bg-[#0b192c]/95 text-sky-400'
        }`}
      >
        <LocateFixed className="h-7 w-7 stroke-[2.4]" />
      </button>

      <button
        type="button"
        onClick={onSimulateFieldGps}
        aria-label="통영·거제 해상 선박 GPS 시뮬레이션"
        className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl border-2 border-amber-500/70 bg-[#0b192c]/95 text-amber-300 shadow-xl transition active:scale-95"
      >
        <Compass className="h-5 w-5 stroke-[2.3]" />
        <span className="mt-0.5 text-[10px] leading-none font-black">현장GPS</span>
      </button>

      <button
        type="button"
        onClick={onResetBounds}
        aria-label="전체 해역 보기"
        className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-slate-600 bg-[#0b192c]/95 text-white shadow-xl transition active:scale-95"
      >
        <Maximize className="h-6 w-6 stroke-[2.3]" />
      </button>

      <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-slate-600 bg-[#0b192c]/95 shadow-xl">
        <button
          type="button"
          onClick={() => map.zoomIn()}
          aria-label="지도 확대"
          className="flex h-14 w-14 items-center justify-center border-b border-slate-700 text-white active:bg-slate-800"
        >
          <Plus className="h-7 w-7 stroke-[2.6]" />
        </button>
        <button
          type="button"
          onClick={() => map.zoomOut()}
          aria-label="지도 축소"
          className="flex h-14 w-14 items-center justify-center text-white active:bg-slate-800"
        >
          <Minus className="h-7 w-7 stroke-[2.6]" />
        </button>
      </div>
    </div>
  );
}

export function MapView({
  activeMainTab,
  navSubTab,
  features,
  selectedFeature,
  onSelectFeature,
  layers,
  showPorpoiseLayer,
  isPorpoiseAddMode,
  porpoiseRecords,
  onSelectPorpoise,
  onMapClickForPorpoise,
  routeWaypoints,
  onUpdateWaypointPos,
  weatherCoords,
  weatherGrade,
  onUpdateWeatherCoords,
  userLocation,
  onRequestGps,
  onSimulateFieldGps,
  flyTarget,
  onResetBounds,
}: MapViewProps) {
  const gpsPulseIcon = useMemo(() => createGpsPulseIcon(), []);
  const [geoJsonLayersData, setGeoJsonLayersData] = useState<{ [id: string]: any }>({});

  // QGIS 공간정보 레이어 GeoJSON 로드
  useEffect(() => {
    layers.forEach((layer) => {
      if (layer.url && !geoJsonLayersData[layer.id]) {
        const fullUrl = `${import.meta.env.BASE_URL}${layer.url.replace(/^\/+/, '')}`;
        fetch(fullUrl)
          .then((r) => r.json())
          .then((data) => {
            setGeoJsonLayersData((prev) => ({ ...prev, [layer.id]: data }));
          })
          .catch(() => {});
      }
    });
  }, [layers, geoJsonLayersData]);

  // 바닷길 콕콕 경로 좌표선
  const polylinePositions = useMemo(() => {
    return routeWaypoints.map((wp) => [wp.lat, wp.lng] as [number, number]);
  }, [routeWaypoints]);

  return (
    <main
      className="bada-map-viewport relative h-dvh w-full"
      tabIndex={0}
      role="region"
      aria-label="통영·거제 해역 지도"
    >
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        minZoom={7}
        maxZoom={18}
        zoomControl={false}
        bounceAtZoomLimits={false}
        worldCopyJump={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <MapClickHandler
          isPorpoiseAddMode={isPorpoiseAddMode}
          onMapClickForPorpoise={onMapClickForPorpoise}
        />

        {/* 1. QGIS 공간정보 레이어 (국립공원 경계, 특별보호구역) */}
        {layers.map((layer) => {
          if (!layer.visible || !geoJsonLayersData[layer.id]) return null;
          return (
            <GeoJSON
              key={`layer-${layer.id}`}
              data={geoJsonLayersData[layer.id]}
              style={() => ({
                color: layer.color,
                weight: layer.id === 'national_park' ? 2.5 : 3,
                fillColor: layer.color,
                fillOpacity: layer.id === 'national_park' ? 0.08 : 0.16,
                dashArray: layer.id === 'protected_area' ? '6 4' : undefined,
              })}
            />
          );
        })}

        {/* 2. [3.1 꼬미의 바다수첩] 갯바위 접안 마커 */}
        {activeMainTab === 'notebook' &&
          layers.find((l) => l.id === 'docking')?.visible !== false &&
          features.map((feature) => {
            const [lng, lat] = feature.geometry.coordinates;
            const isSelected = selectedFeature?.properties.id === feature.properties.id;
            const icon = createDockingMarkerIcon(
              feature.properties.color,
              feature.properties.id,
              isSelected
            );

            return (
              <Marker
                key={feature.properties.id}
                position={[lat, lng]}
                icon={icon}
                eventHandlers={{
                  click: () => onSelectFeature(feature),
                }}
              />
            );
          })}

        {/* 3. [3.1 꼬미의 바다수첩] 개인 상괭이 관찰기록 마커 */}
        {activeMainTab === 'notebook' &&
          showPorpoiseLayer &&
          porpoiseRecords.map((record) => (
            <Marker
              key={record.id}
              position={[record.lat, record.lng]}
              icon={createPorpoiseIcon(record.count)}
              eventHandlers={{
                click: () => onSelectPorpoise(record),
              }}
            />
          ))}

        {/* 4. [3.2 바닷길 콕콕 - 시간계산기] 경로 폴리라인 및 드래그 마커 */}
        {activeMainTab === 'navigation' && navSubTab === 'route' && (
          <>
            {polylinePositions.length >= 2 && (
              <Polyline
                positions={polylinePositions}
                pathOptions={{
                  color: '#38bdf8',
                  weight: 4,
                  dashArray: '8 6',
                  opacity: 0.9,
                }}
              />
            )}

            {routeWaypoints.map((wp) => (
              <Marker
                key={wp.id}
                position={[wp.lat, wp.lng]}
                icon={createRouteWaypointIcon(wp.type, wp.name)}
                draggable={true}
                eventHandlers={{
                  dragend: (e) => {
                    const latlng = e.target.getLatLng();
                    onUpdateWaypointPos(wp.id, latlng.lat, latlng.lng);
                  },
                }}
              />
            ))}
          </>
        )}

        {/* 5. [3.2 바닷길 콕콕 - 해상기상] 3단계 신호등 드래그 마커 */}
        {activeMainTab === 'navigation' && navSubTab === 'weather' && (
          <Marker
            position={[weatherCoords.lat, weatherCoords.lng]}
            icon={createWeatherPinIcon(weatherGrade)}
            draggable={true}
            eventHandlers={{
              dragend: (e) => {
                const latlng = e.target.getLatLng();
                onUpdateWeatherCoords(latlng.lat, latlng.lng);
              },
            }}
          />
        )}

        {/* GPS 현재 위치 펄스 마커 */}
        {userLocation && (
          <>
            <Circle
              center={[userLocation.lat, userLocation.lng]}
              radius={userLocation.accuracy ?? 120}
              pathOptions={{
                color: '#38bdf8',
                fillColor: '#0ea5e9',
                fillOpacity: 0.14,
                weight: 1.5,
              }}
            />
            <Marker position={[userLocation.lat, userLocation.lng]} icon={gpsPulseIcon} zIndexOffset={1000} />
          </>
        )}

        <MapCameraAndThumbControls
          flyTarget={flyTarget}
          onRequestGps={onRequestGps}
          onSimulateFieldGps={onSimulateFieldGps}
          onResetBounds={onResetBounds}
          hasGps={Boolean(userLocation)}
        />
      </MapContainer>
    </main>
  );
}
