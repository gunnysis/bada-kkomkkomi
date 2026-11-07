import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { Compass, LocateFixed, Maximize, Minus, Plus } from 'lucide-react';
import type { DockingFeature, MarkerColor } from '../types/docking';
import { MARKER_COLOR_MAP } from '../types/docking';

interface UserGpsLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  isSimulated?: boolean;
}

interface MapViewProps {
  features: DockingFeature[];
  selectedFeature: DockingFeature | null;
  onSelectFeature: (feature: DockingFeature) => void;
  userLocation: UserGpsLocation | null;
  onRequestGps: () => void;
  onSimulateFieldGps: () => void;
  flyTarget: { lat: number; lng: number; zoom: number; nonce: number } | null;
  onResetBounds: () => void;
}

/**
 *通영·거제 해역 중심 기본 좌표 및 줌 레벨
 */
const DEFAULT_CENTER: [number, number] = [34.8195, 128.552];
const DEFAULT_ZOOM = 11;

/**
 * 5가지 색상(red, amber, green, blue, purple) 커스텀 마커 생성 함수
 * - Leaflet 기본 PNG 마커의 Vite 번들링 경로 깨짐 문제를 근본 원인으로 차단 (순수 SVG L.divIcon)
 * - 두꺼운 해상 작업 장갑 착용 시에도 오터치가 없도록 52x52px 히트박스 적용
 * - 직사광선 아래에서도 식별되도록 3중 외곽선(어두운 네이비 + 화이트 + 고채도 컬러) 적용
 */
function createDockingMarkerIcon(
  color: MarkerColor,
  pointCode: string,
  isSelected: boolean,
): L.DivIcon {
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
          border: 1.5px solid ${ isSelected ? '#ffffff' : theme.hex };
          color: #f8fafc;
          font-size: 10px;
          font-weight: 900;
          line-height: 1.2;
          letter-spacing: 0.02em;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.65);
        ">${pointCode}</div>
        <svg width="44" height="44" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.65));">
          ${selectedHalo}
          <path
            d="M26 4C16.611 4 9 11.611 9 21C9 33.25 26 48 26 48C26 48 43 33.25 43 21C43 11.611 35.389 4 26 4Z"
            fill="${theme.hex}"
            stroke="#ffffff"
            stroke-width="3"
          />
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

/**
 * GPS 현재 위치 펄스 마커 아이콘 생성
 */
function createGpsPulseIcon(): L.DivIcon {
  const html = `
    <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
      <span
        class="bada-gps-pulse-ring"
        style="
          position: absolute;
          width: 34px;
          height: 34px;
          border-radius: 9999px;
          background: rgba(56, 189, 248, 0.45);
          border: 2px solid #38bdf8;
        "
      ></span>
      <span
        style="
          position: relative;
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #0ea5e9;
          border: 3.5px solid #ffffff;
          box-shadow: 0 0 12px rgba(14, 165, 233, 0.95);
        "
      ></span>
    </div>
  `;

  return L.divIcon({
    className: 'bada-custom-marker',
    html,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

/**
 * 지도 카메라 이동 및 한 손 엄지 영역(Thumb-Zone) 컨트롤러
 */
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
    map.flyTo([flyTarget.lat, flyTarget.lng], flyTarget.zoom, {
      animate: true,
      duration: 0.75,
    });
  }, [flyTarget, map]);

  return (
    <div
      className="fixed right-3.5 bottom-6 z-[900] flex flex-col gap-2.5"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
      aria-label="한 손 지도 조작 버튼 모음"
    >
      {/* 실측 GPS 또는 통영·거제 현장 시뮬레이션 GPS 버튼 */}
      <button
        type="button"
        onClick={onRequestGps}
        aria-label="내 GPS 위치 찾기"
        title="실제 GPS 위치 조회"
        className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 shadow-xl transition active:scale-95 ${
          hasGps
            ? 'border-sky-400 bg-sky-500 text-slate-950'
            : 'border-slate-600 bg-[#0b192c]/95 text-sky-400'
        }`}
      >
        <LocateFixed className="h-7 w-7 stroke-[2.4]" />
      </button>

      {/* 실내 테스트 및 데모용 통영·거제 해역 가상 선박 위치 이동 버튼 */}
      <button
        type="button"
        onClick={onSimulateFieldGps}
        aria-label="통영·거제 해상 선박 GPS 시뮬레이션"
        title="통영·거제 해역 가상 선박 GPS 시뮬레이션"
        className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl border-2 border-amber-500/70 bg-[#0b192c]/95 text-amber-300 shadow-xl transition active:scale-95"
      >
        <Compass className="h-5 w-5 stroke-[2.3]" />
        <span className="mt-0.5 text-[10px] leading-none font-black">현장GPS</span>
      </button>

      {/* 전체 해역 보기 */}
      <button
        type="button"
        onClick={onResetBounds}
        aria-label="통영·거제 전체 포인트 한눈에 보기"
        title="전체 포인트 보기"
        className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-slate-600 bg-[#0b192c]/95 text-white shadow-xl transition active:scale-95"
      >
        <Maximize className="h-6 w-6 stroke-[2.3]" />
      </button>

      {/* 장갑 착용용 대형 확대/축소 버튼 */}
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
  features,
  selectedFeature,
  onSelectFeature,
  userLocation,
  onRequestGps,
  onSimulateFieldGps,
  flyTarget,
  onResetBounds,
}: MapViewProps) {
  const gpsPulseIcon = useMemo(() => createGpsPulseIcon(), []);

  return (
    <main
      className="bada-map-viewport relative h-dvh w-full"
      tabIndex={0}
      role="region"
      aria-label="통영·거제 해역 접안 포인트 인터랙티브 지도"
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

        {/* 통영·거제 접안 포인트 마커 렌더링 */}
        {features.map((feature) => {
          const [lng, lat] = feature.geometry.coordinates;
          const isSelected = selectedFeature?.properties.id === feature.properties.id;
          const icon = createDockingMarkerIcon(
            feature.properties.color,
            feature.properties.id,
            isSelected,
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

        {/* 사용자 GPS 위치 펄스 마커 및 오차 반경 원 */}
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
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={gpsPulseIcon}
              zIndexOffset={1000}
            />
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
