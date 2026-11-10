import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  CalendarCheck2,
  Check,
  Compass,
  Copy,
  Eye,
  Info,
  Navigation,
  Waves,
  X,
  Send,
} from 'lucide-react';
import type { DockingFeature } from '../types/docking';
import { MARKER_COLOR_MAP } from '../types/docking';
import { PhotoGallery } from './PhotoGallery';
import { calculateHaversineKm, kmToNauticalMiles } from '../services/routeGeoService';
import type { SourceCategoryKey } from '../config/dataSources';

interface DockingDetailSheetProps {
  feature: DockingFeature | null;
  userLocation: { lat: number; lng: number; accuracy?: number } | null;
  onClose: () => void;
  onFlyToPoint: (lat: number, lng: number) => void;
  onRequestReport: (feature: DockingFeature) => void;
  onRequestRoadview?: (feature: DockingFeature) => void;
  onRequestNavigateRoute?: (feature: DockingFeature) => void;
  onOpenSourcesInfo?: (sourceId: SourceCategoryKey) => void;
}

export function DockingDetailSheet({
  feature,
  userLocation,
  onClose,
  onFlyToPoint,
  onRequestReport,
  onRequestRoadview,
  onRequestNavigateRoute,
  onOpenSourcesInfo,
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
    ? calculateHaversineKm(userLocation.lat, userLocation.lng, lat, lng)
    : null;
  const distanceNauticalMiles = distanceKm !== null ? kmToNauticalMiles(distanceKm) : null;

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
      className="bada-bottom-sheet knps-modal-surface fixed inset-x-0 bottom-0 top-auto z-[1200] m-0 max-h-[86dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border-t-2 border-[#00a79d]/65 bg-white p-0 text-[#003360] shadow-2xl sm:mx-auto"
      style={{
        transform: dragOffsetY > 0 ? `translateY(${dragOffsetY}px)` : undefined,
        transition: touchStartY === null ? 'transform 0.22s ease-out' : 'none',
      }}
    >
      {/* 상단 드래그 핸들 및 헤더 */}
      <div
        className="sticky top-0 z-20 border-b border-sky-200 bg-gradient-to-r from-sky-50 via-teal-50/60 to-white px-5 pt-3 pb-4 backdrop-blur-md select-none"
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
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-300" aria-hidden="true" />

        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-sky-200 bg-white px-2.5 py-1 font-mono text-xs font-extrabold text-[#0066b3] shadow-2xs">
                {properties.id}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-extrabold ${colorMeta.badgeBg} ${colorMeta.badgeText} ${colorMeta.borderClass}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorMeta.hex }} />
                {colorMeta.label}
              </span>
              {distanceKm !== null && distanceNauticalMiles !== null && (
                <span className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-[#00846c]">
                  현재 위치에서 {distanceKm.toFixed(1)}km ({distanceNauticalMiles.toFixed(1)}NM)
                </span>
              )}
            </div>

            <h2
              id="sheet-point-title"
              className="text-xl leading-snug font-black tracking-tight text-[#003360] sm:text-2xl"
            >
              {properties.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="상세 시트 닫기"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-300 bg-white text-[#003360] shadow-xs active:scale-95"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* 본문 영역 */}
      <div className="space-y-5 px-5 pt-4 pb-8">
        {/* 1. 최우선 경고: 위험 요소 (NPIP Pitta Crimson & Rose 시맨틱 배너) */}
        <div
          role="alert"
          className="rounded-2xl border-2 border-red-300 bg-gradient-to-br from-red-50 via-rose-50/90 to-white p-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow">
              <AlertTriangle className="h-6 w-6 stroke-[2.5]" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <span className="inline-block rounded bg-[#870b41] px-2 py-0.5 text-xs font-black tracking-wider text-white uppercase">
                접안 위험 요소 · 필독
              </span>
              <p className="text-base leading-relaxed font-extrabold text-red-950">
                {properties.hazard}
              </p>
            </div>
          </div>
        </div>

        {/* 2. 조석/수심 정보 및 접안 목적 */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
            <div className="mb-1.5 flex items-center gap-2 text-[#0066b3]">
              <Waves className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="text-sm font-extrabold">조석 · 수심 · 조류 특성</span>
            </div>
            <p className="text-base leading-relaxed font-bold text-[#003360]">
              {properties.tide_info}
            </p>
          </div>

          <div className="rounded-2xl border border-[#d6c6b2] bg-[#f7f4ee] p-4">
            <div className="mb-1.5 flex items-center gap-2 text-[#8b5e3c]">
              <Anchor className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="text-sm font-extrabold">주요 현장 업무 · 접안 목적</span>
            </div>
            <p className="text-base leading-relaxed font-bold text-[#003360]">
              {properties.purpose}
            </p>
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
        <div className="rounded-2xl border border-sky-200 bg-sky-50/55 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <Compass className="h-4 w-4 text-[#0066b3]" />
                <span>WGS84 해상 좌표</span>
              </div>
              <p className="font-mono text-base font-extrabold text-[#003360]">
                {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
              </p>
            </div>

            <div className="space-y-1 text-right">
              <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-slate-600">
                <CalendarCheck2 className="h-4 w-4 text-[#00846c]" />
                <span>최근 실측 검증일</span>
              </div>
              <p className="font-mono text-sm font-extrabold text-[#00846c]">
                {properties.verified_date}
              </p>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-sky-200/80 pt-2 text-[11px] font-bold text-slate-600">
            <span>
              🏛️ 공단 현장조사 · 국립해양조사원(KHOA) 기본수준면(DL) 기준
            </span>
            {onOpenSourcesInfo && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSourcesInfo('ports_docking');
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sky-300 bg-white px-2 py-0.5 text-[11px] font-extrabold text-[#0066b3] transition hover:border-[#0066b3] active:scale-95"
              >
                <Info className="h-3 w-3" aria-hidden="true" />
                <span>데이터 출처</span>
              </button>
            )}
          </div>

          {/* 원터치 브릿지: 이 접안지로 바닷길 시간·기상 계산하기 */}
          {onRequestNavigateRoute && (
            <button
              type="button"
              onClick={() => {
                onRequestNavigateRoute(feature);
                onClose();
              }}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00854a] via-[#00846c] to-[#0066b3] px-3 py-3 text-xs font-black text-white shadow-md transition hover:brightness-105 active:scale-[0.99] sm:text-sm"
            >
              <Navigation className="h-4 w-4 stroke-[2.6]" />
              <span>이 접안지를 목적지로 바닷길 시간·기상 계산하기</span>
            </button>
          )}

          {/* 액션 버튼 4종: 좌표복사 / 포인트정밀확대 / 3D 현장뷰 / 현장제보 */}
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={handleCopyCoords}
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2 py-3 text-xs font-extrabold text-[#003360] shadow-2xs active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-[#00846c]" />
                  <span className="text-[#00846c]">복사됨</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 text-[#0066b3]" />
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
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-[#0066b3] px-2 py-3 text-xs font-black text-white shadow-sm active:scale-95"
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
                className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-2 py-3 text-xs font-black text-[#00846c] shadow-2xs active:scale-95"
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
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2 py-3 text-xs font-black text-amber-900 shadow-2xs active:scale-95"
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
