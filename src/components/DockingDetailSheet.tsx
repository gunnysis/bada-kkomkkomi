import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  CalendarCheck2,
  Check,
  Compass,
  Copy,
  Eye,
  Navigation,
  Waves,
  X,
  Send,
} from 'lucide-react';
import type { DockingFeature } from '../types/docking';
import { MARKER_COLOR_MAP } from '../types/docking';
import { PhotoGallery } from './PhotoGallery';

interface DockingDetailSheetProps {
  feature: DockingFeature | null;
  userLocation: { lat: number; lng: number; accuracy?: number } | null;
  onClose: () => void;
  onFlyToPoint: (lat: number, lng: number) => void;
  onRequestReport: (feature: DockingFeature) => void;
  onRequestRoadview?: (feature: DockingFeature) => void;
  onRequestNavigateRoute?: (feature: DockingFeature) => void;
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function DockingDetailSheet({
  feature,
  userLocation,
  onClose,
  onFlyToPoint,
  onRequestReport,
  onRequestRoadview,
  onRequestNavigateRoute,
}: DockingDetailSheetProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (feature) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [feature]);

  if (!feature) return null;

  const { properties, geometry } = feature;
  const [lng, lat] = geometry.coordinates;
  const colorMeta = MARKER_COLOR_MAP[properties.color] ?? MARKER_COLOR_MAP.blue;

  const distanceKm = userLocation
    ? calculateDistanceKm(userLocation.lat, userLocation.lng, lat, lng)
    : null;
  const distanceNauticalMiles = distanceKm !== null ? distanceKm / 1.852 : null;

  const handleCopyCoords = async () => {
    const text = `${lat.toFixed(5)}, ${lng.toFixed(5)} (${properties.name})`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        if (document.querySelector('[data-photo-lightbox="true"]')) {
          e.preventDefault();
        }
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
      aria-labelledby="sheet-point-title"
      className="bada-bottom-sheet fixed inset-x-0 bottom-0 top-auto z-[1200] m-0 max-h-[86dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border-t-2 border-slate-600 bg-[#0b192c] p-0 text-white shadow-2xl sm:mx-auto"
      style={{
        transform: dragOffsetY > 0 ? `translateY(${dragOffsetY}px)` : undefined,
        transition: touchStartY === null ? 'transform 0.22s ease-out' : 'none',
      }}
    >
      {/* 상단 드래그 핸들 및 헤더 */}
      <div
        className="sticky top-0 z-20 border-b border-slate-700/90 bg-[#0b192c]/95 px-5 pt-3 pb-4 backdrop-blur-md"
        onTouchStart={(e) => setTouchStartY(e.touches[0].clientY)}
        onTouchMove={(e) => {
          if (touchStartY === null) return;
          const delta = e.touches[0].clientY - touchStartY;
          if (delta > 0) setDragOffsetY(delta);
        }}
        onTouchEnd={() => {
          if (dragOffsetY > 95) {
            onClose();
          } else {
            setDragOffsetY(0);
          }
          setTouchStartY(null);
        }}
      >
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-500" aria-hidden="true" />

        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-slate-800 px-2.5 py-1 font-mono text-xs font-extrabold text-sky-300">
                {properties.id}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-extrabold ${colorMeta.badgeBg} ${colorMeta.badgeText} ${colorMeta.borderClass}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorMeta.hex }} />
                {colorMeta.label}
              </span>
              {distanceKm !== null && distanceNauticalMiles !== null && (
                <span className="rounded-lg bg-emerald-950/90 border border-emerald-500/50 px-2.5 py-1 text-xs font-extrabold text-emerald-300">
                  현재 위치에서 {distanceKm.toFixed(1)}km ({distanceNauticalMiles.toFixed(1)}NM)
                </span>
              )}
            </div>

            <h2 id="sheet-point-title" className="text-xl leading-snug font-black tracking-tight text-white sm:text-2xl">
              {properties.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="상세 시트 닫기"
            className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-600 bg-slate-800/90 text-white shadow-md active:scale-95"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* 본문 영역 */}
      <div className="space-y-5 px-5 pt-4 pb-8">
        {/* 1. 최우선 경고: 위험 요소 */}
        <div
          role="alert"
          className="rounded-2xl border-2 border-red-500 bg-gradient-to-br from-red-950/95 via-red-950/80 to-slate-950 p-4 shadow-lg"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500 text-slate-950 shadow">
              <AlertTriangle className="h-6 w-6 stroke-[2.5]" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <span className="rounded bg-red-500 px-2 py-0.5 text-xs font-black tracking-wider text-slate-950 uppercase">
                접안 위험 요소 · 필독
              </span>
              <p className="text-base leading-relaxed font-extrabold text-red-100">{properties.hazard}</p>
            </div>
          </div>
        </div>

        {/* 2. 조석/수심 정보 및 접안 목적 */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="rounded-2xl border border-sky-500/40 bg-sky-950/40 p-4">
            <div className="mb-1.5 flex items-center gap-2 text-sky-300">
              <Waves className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="text-sm font-extrabold">조석 · 수심 · 조류 특성</span>
            </div>
            <p className="text-base leading-relaxed font-bold text-slate-100">{properties.tide_info}</p>
          </div>

          <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4">
            <div className="mb-1.5 flex items-center gap-2 text-amber-300">
              <Anchor className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="text-sm font-extrabold">주요 현장 업무 · 접안 목적</span>
            </div>
            <p className="text-base leading-relaxed font-bold text-slate-100">{properties.purpose}</p>
          </div>
        </div>

        {/* 3. 현장 사진 스와이프 갤러리 */}
        <PhotoGallery
          key={properties.id}
          photos={properties.photos}
          pointName={properties.name}
          pointId={properties.id}
        />

        {/* 4. 좌표 및 검증일 */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <Compass className="h-4 w-4 text-sky-400" />
                <span>WGS84 해상 좌표</span>
              </div>
              <p className="font-mono text-base font-extrabold text-sky-200">
                {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
              </p>
            </div>

            <div className="space-y-1 text-right">
              <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-slate-400">
                <CalendarCheck2 className="h-4 w-4 text-emerald-400" />
                <span>최근 실측 검증일</span>
              </div>
              <p className="font-mono text-sm font-extrabold text-emerald-300">{properties.verified_date}</p>
            </div>
          </div>

          {/* 원터치 브릿지: 이 접안지로 바닷길 시간·기상 계산하기 */}
          {onRequestNavigateRoute && (
            <button
              type="button"
              onClick={() => {
                onRequestNavigateRoute(feature);
                onClose();
              }}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-teal-300 bg-gradient-to-r from-teal-500 to-sky-500 px-3 py-3 text-xs font-black text-slate-950 shadow-lg transition active:scale-[0.99] sm:text-sm"
            >
              <Navigation className="h-4 w-4 stroke-[2.6]" />
              <span>🧭 이 접안지를 목적지로 바닷길 시간·기상 계산하기</span>
            </button>
          )}

          {/* 액션 버튼 4종: 좌표복사 / 포인트정밀확대 / 3D 현장뷰 / 현장제보 */}
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={handleCopyCoords}
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-slate-800 px-2 py-3 text-xs font-extrabold text-white active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-300">복사됨</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 text-sky-400" />
                  <span>좌표 복사</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                onFlyToPoint(lat, lng);
                onClose();
              }}
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-2 py-3 text-xs font-black text-slate-950 shadow-lg active:scale-95"
            >
              <Navigation className="h-4 w-4" />
              <span>정밀 확대</span>
            </button>

            {onRequestRoadview && (
              <button
                type="button"
                onClick={() => {
                  onRequestRoadview(feature);
                  onClose();
                }}
                className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-emerald-400/80 bg-emerald-500/20 px-2 py-3 text-xs font-black text-emerald-300 shadow active:scale-95"
              >
                <Eye className="h-4 w-4" />
                <span>3D 현장뷰</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onRequestReport(feature);
                onClose();
              }}
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-amber-400/80 bg-amber-500/20 px-2 py-3 text-xs font-black text-amber-300 shadow active:scale-95"
            >
              <Send className="h-4 w-4" />
              <span>현장 제보</span>
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
